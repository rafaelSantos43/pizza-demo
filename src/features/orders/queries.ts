import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

import type {
  CustomerProfile,
  OrderDetail,
  OrderDetailAddress,
  OrderDetailCustomer,
  OrderDetailItem,
  OrderStatus,
  OrderStatusEvent,
  OrderSummary,
  OrderSummaryAddress,
  OrderSummaryCustomer,
  PaymentMethod,
} from "./types";

export interface OrderConfirmation {
  id: string;
  status: OrderStatus;
  total_cents: number;
  payment_method: PaymentMethod;
  needs_proof: boolean;
  created_at: string;
}

/**
 * Devuelve nombre + última dirección registrada del customer; null si no
 * tiene historial. Usado para precargar el form de checkout cuando el
 * customer es recurrente.
 *
 * Nota: `createOrder` inserta SIEMPRE una nueva fila en `addresses` por
 * pedido (no reusa ni mantiene `customers.default_address_id`), así que
 * "última dirección" se resuelve por `created_at DESC LIMIT 1`.
 */
export async function getCustomerProfile(
  customerId: string,
): Promise<CustomerProfile | null> {
  const { data: customerRow, error: customerErr } = await supabaseAdmin
    .from("customers")
    .select("name, phone")
    .eq("id", customerId)
    .maybeSingle();

  if (customerErr) throw customerErr;
  if (!customerRow) return null;

  const customer = customerRow as { name: string | null; phone: string };

  const { data: addressRow, error: addressErr } = await supabaseAdmin
    .from("addresses")
    .select("street, complex_name, tower, apartment, neighborhood, references")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (addressErr) throw addressErr;

  const lastAddress = addressRow
    ? (addressRow as {
        street: string;
        complex_name: string | null;
        tower: string | null;
        apartment: string | null;
        neighborhood: string | null;
        references: string | null;
      })
    : null;

  return {
    name: customer.name,
    phone: customer.phone,
    lastAddress,
  };
}

// `expectedCustomerId` viene del token de la ruta. Si el orderId
// pertenece a otro cliente, retornamos null para que la página muestre
// "no encontramos tu pedido" en lugar de filtrar datos ajenos. Ver L04.
export async function getOrderConfirmation(
  orderId: string,
  expectedCustomerId: string,
): Promise<OrderConfirmation | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, total_cents, payment_method, needs_proof, created_at",
    )
    .eq("id", orderId)
    .eq("customer_id", expectedCustomerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as OrderConfirmation;
}

interface ActiveOrderRow {
  id: string;
  status: OrderStatus;
  total_cents: number;
  payment_method: PaymentMethod;
  delivery_type: "delivery" | "pickup";
  needs_proof: boolean;
  delayed: boolean;
  eta_at: string | null;
  created_at: string;
  driver_id: string | null;
  // Snapshot del nombre en el momento del pedido. Los pedidos creados
  // antes de la migration 0007 quedaron con NULL si el backfill falló
  // por algún motivo — el mapper hace fallback al `customer.name` vivo.
  customer_name: string | null;
  customer: OrderSummaryCustomer | null;
  address: OrderSummaryAddress | null;
  order_items: { count: number }[] | null;
}

const ACTIVE_ORDER_SELECT = `id, status, total_cents, payment_method, delivery_type, needs_proof, delayed,
       eta_at, created_at, driver_id, customer_name,
       customer:customers(id, phone, name),
       address:addresses(street, complex_name, neighborhood, zone),
       order_items(count)`;

function mapActiveOrderRow(row: ActiveOrderRow): OrderSummary {
  const liveCustomer = row.customer ?? { id: "", phone: "", name: null };
  return {
    id: row.id,
    status: row.status,
    total_cents: row.total_cents,
    payment_method: row.payment_method,
    delivery_type: row.delivery_type,
    needs_proof: row.needs_proof,
    delayed: row.delayed,
    eta_at: row.eta_at,
    created_at: row.created_at,
    driver_id: row.driver_id,
    customer: {
      ...liveCustomer,
      name: row.customer_name ?? liveCustomer.name,
    },
    // Pickup: address_id queda NULL en createOrder, address llega null aquí.
    address: row.address,
    item_count: row.order_items?.[0]?.count ?? 0,
  };
}

export async function listActiveOrders(): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ACTIVE_ORDER_SELECT)
    .not("status", "in", "(delivered,cancelled)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as ActiveOrderRow[];
  // L01: descartar orphans (orders sin items) que pueden quedar si la
  // cascada del INSERT falló a mitad. No corrompen el sistema, solo
  // confunden al cajero si aparecen en el panel.
  return rows.map(mapActiveOrderRow).filter((o) => o.item_count > 0);
}

export async function listOrdersForDriver(
  driverId: string | null,
  options: { deliverableOnly?: boolean } = {},
): Promise<OrderSummary[]> {
  const supabase = await createClient();
  // Pickups nunca llegan al panel del driver — el cliente recoge en el local,
  // no hay nada que entregar. La UI ya filtra por `driver_id`, pero forzamos
  // delivery aquí para defense-in-depth ante un assignDriver bypass.
  const base = supabase
    .from("orders")
    .select(ACTIVE_ORDER_SELECT)
    .eq("delivery_type", "delivery")
    .not("status", "in", "(delivered,cancelled)");

  // `deliverableOnly`: solo pedidos en los que el driver puede actuar
  // (ready = recoger, on_the_way = entregar). Excluye payment_approved y
  // preparing aunque ya estén asignados — la pre-asignación del admin es
  // info de gestión, no compromiso operativo. El driver ve el pedido
  // recién cuando cocina lo marca listo. Admin viendo /mensajeros tab
  // Flota usa el default (sin filtro) para ver el pipeline completo.
  const withStatus = options.deliverableOnly
    ? base.in("status", ["ready", "on_the_way"])
    : base;

  const filtered = driverId === null
    ? withStatus.not("driver_id", "is", null)
    : withStatus.eq("driver_id", driverId);

  const { data, error } = await filtered
    .order("eta_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as ActiveOrderRow[];
  // L01: igual que `listActiveOrders`, descartamos orphans.
  return rows.map(mapActiveOrderRow).filter((o) => o.item_count > 0);
}

interface OrderDetailRow {
  id: string;
  status: OrderStatus;
  total_cents: number;
  payment_method: PaymentMethod;
  delivery_type: "delivery" | "pickup";
  payment_proof_url: string | null;
  needs_proof: boolean;
  payment_approved_at: string | null;
  eta_at: string | null;
  delayed: boolean;
  delay_notified_at: string | null;
  driver_id: string | null;
  notes: string | null;
  created_at: string;
  delivered_at: string | null;
  customer_name: string | null;
  customer: OrderDetailCustomer | null;
  address: OrderDetailAddress | null;
  items:
    | {
        id: string;
        product_id: string;
        size: string;
        qty: number;
        unit_price_cents: number;
        flavors: string[] | null;
        addon_key: string | null;
        notes: string | null;
        product: { name: string | null } | null;
      }[]
    | null;
  // flavors above contains product UUIDs; names are resolved after the main SELECT.
  // addon_key is a slug; label is resolved against settings.pizza_addons.
  status_events: OrderStatusEvent[] | null;
}

export async function getOrderDetail(
  orderId: string,
): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, status, total_cents, payment_method, delivery_type, payment_proof_url,
       needs_proof, payment_approved_at, eta_at, delayed, delay_notified_at,
       driver_id, notes, created_at, delivered_at, customer_name,
       customer:customers(id, phone, name),
       address:addresses(id, street, complex_name, tower, apartment,
         neighborhood, references, zone),
       items:order_items(id, product_id, size, qty, unit_price_cents,
         flavors, addon_key, notes, product:products(name)),
       status_events:order_status_events(from_status, to_status, actor_id,
         created_at)`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as OrderDetailRow;

  const flavorIds = Array.from(
    new Set((row.items ?? []).flatMap((it) => it.flavors ?? [])),
  );
  const flavorNameMap = new Map<string, string>();
  if (flavorIds.length > 0) {
    const { data: flavorRows, error: flavorErr } = await supabase
      .from("products")
      .select("id, name")
      .in("id", flavorIds);
    if (flavorErr) throw flavorErr;
    for (const p of (flavorRows ?? []) as { id: string; name: string }[]) {
      flavorNameMap.set(p.id, p.name);
    }
  }

  // Resolver addon_label "vivo" desde settings.pizza_addons. Si Rafael cambia
  // el label, el panel refleja el nuevo (los precios sí son snapshot porque
  // ya cobramos el dinero). Una Q al settings es barata vs. snapshot column.
  const addonLabelMap = new Map<string, string>();
  const hasAddons = (row.items ?? []).some((it) => !!it.addon_key);
  if (hasAddons) {
    const { data: settingsRow, error: settingsErr } = await supabase
      .from("settings")
      .select("pizza_addons")
      .maybeSingle();
    if (settingsErr) throw settingsErr;
    const addons =
      ((settingsRow as { pizza_addons: { key: string; label: string }[] | null } | null)
        ?.pizza_addons) ?? [];
    for (const a of addons) {
      addonLabelMap.set(a.key, a.label);
    }
  }

  const items: OrderDetailItem[] = (row.items ?? []).map((it) => ({
    id: it.id,
    product_id: it.product_id,
    product_name: it.product?.name ?? null,
    size: it.size,
    qty: it.qty,
    unit_price_cents: it.unit_price_cents,
    flavor_names:
      it.flavors && it.flavors.length > 0
        ? it.flavors.map((id) => flavorNameMap.get(id) ?? "Desconocido")
        : null,
    addon_key: it.addon_key,
    addon_label: it.addon_key
      ? addonLabelMap.get(it.addon_key) ?? "Estilo desconocido"
      : null,
    notes: it.notes,
  }));

  const statusEvents = (row.status_events ?? []).slice().sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return {
    id: row.id,
    status: row.status,
    total_cents: row.total_cents,
    payment_method: row.payment_method,
    delivery_type: row.delivery_type,
    payment_proof_url: row.payment_proof_url,
    needs_proof: row.needs_proof,
    payment_approved_at: row.payment_approved_at,
    eta_at: row.eta_at,
    delayed: row.delayed,
    delay_notified_at: row.delay_notified_at,
    driver_id: row.driver_id,
    notes: row.notes,
    created_at: row.created_at,
    delivered_at: row.delivered_at,
    customer: {
      ...(row.customer ?? { id: "", phone: "", name: null }),
      // Snapshot del momento del pedido sobre el JOIN del cliente "vivo".
      name: row.customer_name ?? row.customer?.name ?? null,
    },
    // Pickup: address_id NULL en createOrder, address llega null aquí. La UI
    // del detail-body se ramifica por delivery_type para no mostrar dirección
    // vacía y usar settings.business_address en su lugar.
    address: row.address,
    items,
    status_events: statusEvents,
  };
}
