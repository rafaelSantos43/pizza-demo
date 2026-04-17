import "server-only";

import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  DEMO_ORDER_DETAILS,
  DEMO_ORDER_SUMMARIES,
  toConfirmation,
} from "./demo-fixtures";
import type {
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

export async function getOrderConfirmation(
  orderId: string,
): Promise<OrderConfirmation | null> {
  if (isDemoMode()) {
    const detail = DEMO_ORDER_DETAILS[orderId] ?? Object.values(DEMO_ORDER_DETAILS)[0];
    return detail ? toConfirmation(detail) : null;
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, total_cents, payment_method, needs_proof, created_at",
    )
    .eq("id", orderId)
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
  needs_proof: boolean;
  delayed: boolean;
  eta_at: string | null;
  created_at: string;
  driver_id: string | null;
  customer: OrderSummaryCustomer | null;
  address: OrderSummaryAddress | null;
  order_items: { count: number }[] | null;
}

const ACTIVE_ORDER_SELECT = `id, status, total_cents, payment_method, needs_proof, delayed,
       eta_at, created_at, driver_id,
       customer:customers(id, phone, name),
       address:addresses(street, complex_name, neighborhood, zone),
       order_items(count)`;

function mapActiveOrderRow(row: ActiveOrderRow): OrderSummary {
  return {
    id: row.id,
    status: row.status,
    total_cents: row.total_cents,
    payment_method: row.payment_method,
    needs_proof: row.needs_proof,
    delayed: row.delayed,
    eta_at: row.eta_at,
    created_at: row.created_at,
    driver_id: row.driver_id,
    customer: row.customer ?? { id: "", phone: "", name: null },
    address: row.address ?? {
      street: "",
      complex_name: null,
      neighborhood: null,
      zone: null,
    },
    item_count: row.order_items?.[0]?.count ?? 0,
  };
}

export async function listActiveOrders(): Promise<OrderSummary[]> {
  if (isDemoMode()) return DEMO_ORDER_SUMMARIES;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ACTIVE_ORDER_SELECT)
    .not("status", "in", "(delivered,cancelled)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as ActiveOrderRow[];
  return rows.map(mapActiveOrderRow);
}

export async function listOrdersForDriver(
  driverId: string | null,
): Promise<OrderSummary[]> {
  if (isDemoMode()) {
    const filtered = DEMO_ORDER_SUMMARIES.filter((o) =>
      driverId === null ? o.driver_id !== null : o.driver_id === driverId,
    ).filter((o) => o.status !== "delivered" && o.status !== "cancelled");
    return sortByEtaThenCreated(filtered);
  }

  const supabase = await createClient();
  const base = supabase
    .from("orders")
    .select(ACTIVE_ORDER_SELECT)
    .not("status", "in", "(delivered,cancelled)");

  const filtered = driverId === null
    ? base.not("driver_id", "is", null)
    : base.eq("driver_id", driverId);

  const { data, error } = await filtered
    .order("eta_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as ActiveOrderRow[];
  return rows.map(mapActiveOrderRow);
}

function sortByEtaThenCreated(orders: OrderSummary[]): OrderSummary[] {
  return orders.slice().sort((a, b) => {
    if (a.eta_at && b.eta_at) {
      const diff = a.eta_at.localeCompare(b.eta_at);
      if (diff !== 0) return diff;
    } else if (a.eta_at) {
      return -1;
    } else if (b.eta_at) {
      return 1;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

interface OrderDetailRow {
  id: string;
  status: OrderStatus;
  total_cents: number;
  payment_method: PaymentMethod;
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
        notes: string | null;
        product: { name: string | null } | null;
      }[]
    | null;
  // flavors above contains product UUIDs; names are resolved after the main SELECT.
  status_events: OrderStatusEvent[] | null;
}

export async function getOrderDetail(
  orderId: string,
): Promise<OrderDetail | null> {
  if (isDemoMode()) return DEMO_ORDER_DETAILS[orderId] ?? null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, status, total_cents, payment_method, payment_proof_url,
       needs_proof, payment_approved_at, eta_at, delayed, delay_notified_at,
       driver_id, notes, created_at, delivered_at,
       customer:customers(id, phone, name),
       address:addresses(id, street, complex_name, tower, apartment,
         neighborhood, references, zone),
       items:order_items(id, product_id, size, qty, unit_price_cents,
         flavors, notes, product:products(name)),
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
    customer: row.customer ?? { id: "", phone: "", name: null },
    address: row.address ?? {
      id: "",
      street: "",
      complex_name: null,
      tower: null,
      apartment: null,
      neighborhood: null,
      references: null,
      zone: null,
    },
    items,
    status_events: statusEvents,
  };
}
