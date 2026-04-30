"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentStaff } from "@/features/auth/queries";
import { SIZE_ORDER, type PizzaSize } from "@/features/catalog/types";
import { markTokenUsed } from "@/features/order-tokens/mark-used";
import { verifyToken } from "@/features/order-tokens/verify";
import { sendOrderStatusTemplate } from "@/features/whatsapp/sender";
import { isDemoMode } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { computeEtaAt } from "./eta";
import { computeUnitPrice } from "./compute-unit-price";
import { createOrderInputSchema, type CreateOrderInput } from "./schemas";
import { canTransition } from "./state-machine";
import type { OrderStatus } from "./types";

// ─── Schemas y tipos compartidos por todas las actions ──────────────

const ORDER_STATUSES = [
  "new",
  "awaiting_payment",
  "payment_approved",
  "payment_rejected",
  "preparing",
  "ready",
  "on_the_way",
  "delivered",
  "cancelled",
] as const satisfies readonly OrderStatus[];

const transitionOrderInputSchema = z.object({
  orderId: z.uuid(),
  toStatus: z.enum(ORDER_STATUSES),
  reason: z.string().optional(),
});

const assignDriverInputSchema = z.object({
  orderId: z.uuid(),
  driverId: z.uuid().nullable(),
});

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const TOKEN_REASON_MESSAGES: Record<string, string> = {
  malformed: "El enlace no es válido.",
  invalid_signature: "El enlace no es válido.",
  not_found: "El enlace no existe o ya fue usado.",
  expired: "El enlace expiró. Pide uno nuevo por WhatsApp.",
  used: "El enlace ya fue usado para otro pedido.",
};

interface PriceRow {
  product_id: string;
  size: PizzaSize;
  price_cents: number;
}

interface ProductRuleRow {
  id: string;
  max_flavors: number;
  min_size_for_multiflavor: PizzaSize | null;
}

function sizeAtLeast(size: PizzaSize, min: PizzaSize): boolean {
  return SIZE_ORDER.indexOf(size) >= SIZE_ORDER.indexOf(min);
}

// Cash salta validación de pago → entra directo a preparing.
// Transferencia con comprobante → awaiting_payment con la imagen lista.
// Transferencia sin comprobante → awaiting_payment esperando WhatsApp (camino B).
function pickInitialStatus(
  input: CreateOrderInput,
): { status: OrderStatus; needsProof: boolean; proofUrl: string | null } {
  if (input.paymentMethod === "cash") {
    return { status: "preparing", needsProof: false, proofUrl: null };
  }
  if (input.paymentProofPath) {
    return {
      status: "awaiting_payment",
      needsProof: false,
      proofUrl: input.paymentProofPath,
    };
  }
  return { status: "awaiting_payment", needsProof: true, proofUrl: null };
}

// ─── createOrder: entrada del pedido desde el catálogo público ─────
// Recalcula precios server-side (no confía en el carrito del cliente),
// inserta address+order+items+event, marca token usado.

export async function createOrder(
  input: unknown,
): Promise<ActionResult<{ orderId: string }>> {
  const parsed = createOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }
  const data = parsed.data;

  if (isDemoMode()) {
    console.log("[orders:demo] createOrder", {
      items: data.items.length,
      method: data.paymentMethod,
    });
    return {
      ok: true,
      data: { orderId: "demo-0001-aaaa-bbbb-cccc-dddddddddddd" },
    };
  }

  const tokenResult = await verifyToken(data.token);
  if (!tokenResult.ok) {
    return {
      ok: false,
      error:
        TOKEN_REASON_MESSAGES[tokenResult.reason] ?? "El enlace no es válido.",
    };
  }
  const { customerId, tokenId } = tokenResult;

  try {
    // El nombre del checkout siempre gana — es el cliente confirmando
    // cómo quiere que lo llamemos en este pedido.
    const { error: nameErr } = await supabaseAdmin
      .from("customers")
      .update({ name: data.customerName })
      .eq("id", customerId);
    if (nameErr) throw nameErr;

    const addressInsert = {
      customer_id: customerId,
      street: data.addressInput.street,
      complex_name: data.addressInput.complex_name ?? null,
      tower: data.addressInput.tower ?? null,
      apartment: data.addressInput.apartment ?? null,
      neighborhood: data.addressInput.neighborhood ?? null,
      references: data.addressInput.references ?? null,
      zone: data.addressInput.zone ?? null,
    };
    const { data: addressRow, error: addressErr } = await supabaseAdmin
      .from("addresses")
      .insert(addressInsert)
      .select("id")
      .single();
    if (addressErr) throw addressErr;
    const addressId = (addressRow as { id: string }).id;

    const productIds = Array.from(
      new Set(
        data.items.flatMap((i) => [i.productId, ...(i.flavors ?? [])]),
      ),
    );

    const { data: priceRowsRaw, error: priceErr } = await supabaseAdmin
      .from("product_sizes")
      .select("product_id, size, price_cents")
      .in("product_id", productIds);
    if (priceErr) throw priceErr;

    const priceMap = new Map<string, number>();
    for (const row of (priceRowsRaw ?? []) as PriceRow[]) {
      priceMap.set(`${row.product_id}:${row.size}`, row.price_cents);
    }

    const { data: ruleRowsRaw, error: ruleErr } = await supabaseAdmin
      .from("products")
      .select("id, max_flavors, min_size_for_multiflavor")
      .in("id", productIds)
      .eq("active", true);
    if (ruleErr) throw ruleErr;

    const ruleMap = new Map<string, ProductRuleRow>();
    for (const row of (ruleRowsRaw ?? []) as ProductRuleRow[]) {
      ruleMap.set(row.id, row);
    }

    const itemsResolved: {
      product_id: string;
      size: PizzaSize;
      qty: number;
      unit_price_cents: number;
      flavors: string[] | null;
      notes: string | null;
    }[] = [];

    for (const item of data.items) {
      const rule = ruleMap.get(item.productId);
      if (!rule) {
        return { ok: false, error: "Producto o tamaño no disponible" };
      }

      const flavors = item.flavors ?? [];
      if (flavors.length > rule.max_flavors) {
        return {
          ok: false,
          error: `Este producto admite máximo ${rule.max_flavors} sabores.`,
        };
      }
      if (flavors.length > 1) {
        if (
          !rule.min_size_for_multiflavor ||
          !sizeAtLeast(item.size, rule.min_size_for_multiflavor)
        ) {
          return {
            ok: false,
            error: "Mitad y mitad no está disponible en ese tamaño.",
          };
        }
      }

      const priced = computeUnitPrice({
        baseProductId: item.productId,
        flavors: item.flavors,
        size: item.size,
        priceMap,
      });
      if (!priced.ok) {
        return {
          ok: false,
          error:
            priced.reason === "flavor_missing"
              ? "Sabor no disponible en este tamaño"
              : "Producto o tamaño no disponible",
        };
      }

      itemsResolved.push({
        product_id: item.productId,
        size: item.size,
        qty: item.qty,
        unit_price_cents: priced.price,
        flavors: flavors.length > 0 ? flavors : null,
        notes: item.notes ?? null,
      });
    }

    const totalCents = itemsResolved.reduce(
      (sum, it) => sum + it.unit_price_cents * it.qty,
      0,
    );

    const { status, needsProof, proofUrl } = pickInitialStatus(data);

    const { data: settingsRow, error: settingsErr } = await supabaseAdmin
      .from("settings")
      .select("delivery_zones")
      .maybeSingle();
    if (settingsErr) throw settingsErr;

    const deliveryZones =
      ((settingsRow as { delivery_zones: { zone: string; eta_min: number }[] } | null)
        ?.delivery_zones) ?? [];
    const etaAt = computeEtaAt(data.addressInput.zone ?? null, deliveryZones);

    const orderInsert = {
      customer_id: customerId,
      address_id: addressId,
      status,
      total_cents: totalCents,
      payment_method: data.paymentMethod,
      payment_proof_url: proofUrl,
      needs_proof: needsProof,
      eta_at: etaAt.toISOString(),
      notes: data.notes ?? null,
    };

    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert(orderInsert)
      .select("id")
      .single();
    if (orderErr) throw orderErr;
    const orderId = (orderRow as { id: string }).id;

    const itemsInsert = itemsResolved.map((it) => ({
      order_id: orderId,
      product_id: it.product_id,
      size: it.size,
      qty: it.qty,
      unit_price_cents: it.unit_price_cents,
      flavors: it.flavors,
      notes: it.notes,
    }));
    const { error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .insert(itemsInsert);
    if (itemsErr) throw itemsErr;

    const { error: eventErr } = await supabaseAdmin
      .from("order_status_events")
      .insert({
        order_id: orderId,
        from_status: null,
        to_status: status,
        actor_id: null,
      });
    if (eventErr) throw eventErr;

    try {
      await markTokenUsed(tokenId);
    } catch (err) {
      console.error("markTokenUsed failed", err);
    }

    return { ok: true, data: { orderId } };
  } catch (err) {
    console.error("createOrder failed", err);
    return {
      ok: false,
      error: "No pudimos crear tu pedido. Intenta de nuevo.",
    };
  }
}

// ─── Acciones del staff: transiciones, pagos, asignación ───────────

type SimpleResult = { ok: true } | { ok: false; error: string };

interface OrderStateRow {
  status: OrderStatus;
  needs_proof: boolean;
  payment_proof_url: string | null;
}

async function loadOrderState(orderId: string): Promise<OrderStateRow | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("status, needs_proof, payment_proof_url")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return (data as OrderStateRow | null) ?? null;
}

export async function transitionOrder(input: {
  orderId: string;
  toStatus: OrderStatus;
  reason?: string;
}): Promise<SimpleResult> {
  if (isDemoMode()) return { ok: true };

  const staff = await getCurrentStaff();
  if (!staff) return { ok: false, error: "No autorizado" };

  const parsed = transitionOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }
  const { orderId, toStatus } = parsed.data;

  try {
    const current = await loadOrderState(orderId);
    if (!current) return { ok: false, error: "Pedido no encontrado" };

    if (!canTransition(current.status, toStatus)) {
      return { ok: false, error: "Transición inválida" };
    }

    const update: Record<string, unknown> = { status: toStatus };
    if (toStatus === "payment_approved") {
      update.payment_approved_at = new Date().toISOString();
    }
    if (toStatus === "delivered") {
      update.delivered_at = new Date().toISOString();
    }
    // Rechazar el comprobante: limpiamos la URL para que el cliente
    // pueda reenviar uno nuevo (camino A o B) sin colisionar con el viejo.
    if (toStatus === "payment_rejected") {
      update.needs_proof = true;
      update.payment_proof_url = null;
    }

    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update(update)
      .eq("id", orderId);
    if (updateErr) throw updateErr;

    const { error: eventErr } = await supabaseAdmin
      .from("order_status_events")
      .insert({
        order_id: orderId,
        from_status: current.status,
        to_status: toStatus,
        actor_id: staff.id,
      });
    if (eventErr) throw eventErr;

    try {
      await sendOrderStatusTemplate(orderId, toStatus);
    } catch (err) {
      console.error("sendOrderStatusTemplate errored", err);
    }

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${orderId}`);
    return { ok: true };
  } catch (err) {
    console.error("transitionOrder failed", err);
    return { ok: false, error: "No pudimos actualizar el pedido." };
  }
}

export async function approvePayment(orderId: string): Promise<SimpleResult> {
  if (isDemoMode()) return { ok: true };

  const staff = await getCurrentStaff();
  if (!staff) return { ok: false, error: "No autorizado" };

  try {
    const current = await loadOrderState(orderId);
    if (!current) return { ok: false, error: "Pedido no encontrado" };
    if (current.needs_proof || !current.payment_proof_url) {
      return { ok: false, error: "Falta el comprobante" };
    }
  } catch (err) {
    console.error("approvePayment precheck failed", err);
    return { ok: false, error: "No pudimos validar el pedido." };
  }

  return transitionOrder({ orderId, toStatus: "payment_approved" });
}

export async function rejectPayment(
  orderId: string,
  reason?: string,
): Promise<SimpleResult> {
  return transitionOrder({
    orderId,
    toStatus: "payment_rejected",
    reason,
  });
}

export async function assignDriver(input: {
  orderId: string;
  driverId: string | null;
}): Promise<SimpleResult> {
  if (isDemoMode()) return { ok: true };

  const staff = await getCurrentStaff();
  if (!staff) return { ok: false, error: "No autorizado" };

  const parsed = assignDriverInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }
  const { orderId, driverId } = parsed.data;

  try {
    // Cargar estado actual del pedido
    const { data: currentOrder, error: loadErr } = await supabaseAdmin
      .from("orders")
      .select("status, payment_approved_at, payment_method")
      .eq("id", orderId)
      .single();

    if (loadErr || !currentOrder) {
      return { ok: false, error: "Pedido no encontrado" };
    }

    // Guard: estado válido para asignar
    const ASSIGNABLE_STATUSES = [
      "payment_approved",
      "preparing",
      "ready",
      "on_the_way",
    ] as const;
    if (!ASSIGNABLE_STATUSES.includes(currentOrder.status as any)) {
      return {
        ok: false,
        error: `No se puede asignar en estado '${currentOrder.status}'. El pago debe ser aprobado primero.`,
      };
    }

    // Guard: si se intenta asignar un driver, validar que existe
    if (driverId) {
      const { data: driver, error: driverErr } = await supabaseAdmin
        .from("staff")
        .select("id, role")
        .eq("id", driverId)
        .eq("role", "driver")
        .single();

      if (driverErr || !driver) {
        return {
          ok: false,
          error: "El domiciliario no existe o no tiene rol válido.",
        };
      }
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ driver_id: driverId })
      .eq("id", orderId);
    if (error) throw error;

    revalidatePath("/pedidos");
    revalidatePath("/mensajero");
    return { ok: true };
  } catch (err) {
    console.error("assignDriver failed", err);
    return { ok: false, error: "No pudimos asignar al domiciliario." };
  }
}
