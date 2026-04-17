import type {
  OrderConfirmation,
} from "./queries";
import type {
  OrderDetail,
  OrderStatusEvent,
  OrderSummary,
} from "./types";

const NOW = Date.now();
const min = (m: number) => new Date(NOW - m * 60_000).toISOString();
const inMin = (m: number) => new Date(NOW + m * 60_000).toISOString();

export const DEMO_ORDER_SUMMARIES: OrderSummary[] = [
  {
    id: "demo-0001-aaaa-bbbb-cccc-dddddddddddd",
    status: "awaiting_payment",
    total_cents: 38000,
    payment_method: "nequi",
    needs_proof: true,
    delayed: false,
    eta_at: inMin(35),
    created_at: min(2),
    customer: {
      id: "demo-c-1",
      phone: "+573001112233",
      name: "María Restrepo",
    },
    address: {
      street: "Cll 63b # 105-95",
      complex_name: "Cantares 2",
      neighborhood: "Belén",
      zone: "A",
    },
    item_count: 1,
    driver_id: null,
  },
  {
    id: "demo-0002-aaaa-bbbb-cccc-dddddddddddd",
    status: "awaiting_payment",
    total_cents: 76000,
    payment_method: "bancolombia",
    needs_proof: false,
    delayed: false,
    eta_at: inMin(45),
    created_at: min(8),
    customer: {
      id: "demo-c-2",
      phone: "+573012224455",
      name: "Carlos Patiño",
    },
    address: {
      street: "Cra 70 # 1-23",
      complex_name: null,
      neighborhood: "Laureles",
      zone: "A",
    },
    item_count: 2,
    driver_id: null,
  },
  {
    id: "demo-0003-aaaa-bbbb-cccc-dddddddddddd",
    status: "preparing",
    total_cents: 48000,
    payment_method: "cash",
    needs_proof: false,
    delayed: false,
    eta_at: inMin(20),
    created_at: min(15),
    customer: {
      id: "demo-c-3",
      phone: "+573023335566",
      name: "Lucía Gómez",
    },
    address: {
      street: "Av 33 # 80-12",
      complex_name: "Edificio Oasis",
      neighborhood: "Estadio",
      zone: "B",
    },
    item_count: 3,
    driver_id: null,
  },
  {
    id: "demo-0004-aaaa-bbbb-cccc-dddddddddddd",
    status: "ready",
    total_cents: 28000,
    payment_method: "llave",
    needs_proof: false,
    delayed: false,
    eta_at: inMin(10),
    created_at: min(28),
    customer: {
      id: "demo-c-4",
      phone: "+573034446677",
      name: "Andrés Mejía",
    },
    address: {
      street: "Cll 10 # 40-22",
      complex_name: null,
      neighborhood: "El Poblado",
      zone: "A",
    },
    item_count: 1,
    driver_id: null,
  },
  {
    id: "demo-0005-aaaa-bbbb-cccc-dddddddddddd",
    status: "on_the_way",
    total_cents: 58000,
    payment_method: "nequi",
    needs_proof: false,
    delayed: true,
    eta_at: min(12),
    created_at: min(55),
    customer: {
      id: "demo-c-5",
      phone: "+573045557788",
      name: "Paola Restrepo",
    },
    address: {
      street: "Cra 80 # 33-15",
      complex_name: "Conjunto Mirador",
      neighborhood: "Calasanz",
      zone: "B",
    },
    item_count: 2,
    driver_id: "demo-driver-1",
  },
  {
    id: "demo-0006-aaaa-bbbb-cccc-dddddddddddd",
    status: "ready",
    total_cents: 32000,
    payment_method: "cash",
    needs_proof: false,
    delayed: false,
    eta_at: inMin(8),
    created_at: min(25),
    customer: {
      id: "demo-c-6",
      phone: "+573056668899",
      name: "Sebastián Toro",
    },
    address: {
      street: "Cra 25 # 12-30",
      complex_name: null,
      neighborhood: "Manila",
      zone: "A",
    },
    item_count: 1,
    driver_id: "demo-driver-1",
  },
  {
    id: "demo-0007-aaaa-bbbb-cccc-dddddddddddd",
    status: "on_the_way",
    total_cents: 56000,
    payment_method: "bancolombia",
    needs_proof: false,
    delayed: false,
    eta_at: inMin(5),
    created_at: min(18),
    customer: {
      id: "demo-c-7",
      phone: "+573067779900",
      name: "Diana Henao",
    },
    address: {
      street: "Cll 50 # 25-10",
      complex_name: null,
      neighborhood: "Centro",
      zone: "B",
    },
    item_count: 2,
    driver_id: "demo-driver-1",
  },
];

function detailFromSummary(
  s: OrderSummary,
  events: OrderStatusEvent[],
): OrderDetail {
  return {
    id: s.id,
    status: s.status,
    total_cents: s.total_cents,
    payment_method: s.payment_method,
    payment_proof_url: s.payment_method !== "cash" && !s.needs_proof
      ? `pending/${s.id}/demo-proof.png`
      : null,
    needs_proof: s.needs_proof,
    payment_approved_at: ["payment_approved", "preparing", "ready", "on_the_way", "delivered"].includes(
      s.status,
    )
      ? min(20)
      : null,
    eta_at: s.eta_at,
    delayed: s.delayed,
    delay_notified_at: s.delayed ? min(2) : null,
    driver_id: s.driver_id,
    notes: null,
    created_at: s.created_at,
    delivered_at: null,
    customer: s.customer,
    address: {
      id: `${s.id}-addr`,
      street: s.address.street,
      complex_name: s.address.complex_name,
      tower: null,
      apartment: null,
      neighborhood: s.address.neighborhood,
      references: "Casa esquinera, portón verde.",
      zone: s.address.zone,
    },
    items: [
      {
        id: `${s.id}-item-1`,
        product_id: "demo-prod-hawaiana",
        product_name: "Hawaiana",
        size: "mediana",
        qty: 1,
        unit_price_cents: 38000,
        flavor_names: null,
        notes: null,
      },
    ],
    status_events: events,
  };
}

export const DEMO_ORDER_DETAILS: Record<string, OrderDetail> = Object.fromEntries(
  DEMO_ORDER_SUMMARIES.map((s) => [
    s.id,
    detailFromSummary(s, [
      { from_status: null, to_status: "new", actor_id: null, created_at: s.created_at },
      ...(s.status !== "new"
        ? [
            {
              from_status: "new" as const,
              to_status: s.status,
              actor_id: null,
              created_at: s.created_at,
            },
          ]
        : []),
    ]),
  ]),
);

export function toConfirmation(detail: OrderDetail): OrderConfirmation {
  return {
    id: detail.id,
    status: detail.status,
    total_cents: detail.total_cents,
    payment_method: detail.payment_method,
    needs_proof: detail.needs_proof,
    created_at: detail.created_at,
  };
}
