import type { OrderStatus } from "@/features/orders/types";

export interface TemplateSpec {
  name: string;
  language: string;
  bodyParams: number;
}

// Estos nombres son convención del dev; el cliente debe registrarlos
// EXACTOS en Meta Business Manager y aprobarlos antes del go-live.
export const TEMPLATES = {
  greet: { name: "pf_greet", language: "es_CO", bodyParams: 2 },
  payment_received: {
    name: "pf_payment_received",
    language: "es_CO",
    bodyParams: 0,
  },
  payment_approved: {
    name: "pf_payment_approved",
    language: "es_CO",
    bodyParams: 0,
  },
  preparing: { name: "pf_preparing", language: "es_CO", bodyParams: 0 },
  ready: { name: "pf_ready", language: "es_CO", bodyParams: 0 },
  on_the_way: { name: "pf_on_the_way", language: "es_CO", bodyParams: 0 },
  delivered: { name: "pf_delivered", language: "es_CO", bodyParams: 0 },
  delay_apology: {
    name: "pf_delay_apology",
    language: "es_CO",
    bodyParams: 0,
  },
  status_response: {
    name: "pf_status_response",
    language: "es_CO",
    bodyParams: 2,
  },
  proof_request: {
    name: "pf_proof_request",
    language: "es_CO",
    bodyParams: 0,
  },
} as const satisfies Record<string, TemplateSpec>;

export type TemplateKey = keyof typeof TEMPLATES;

export function templateForStatus(status: OrderStatus): TemplateKey | null {
  switch (status) {
    case "payment_approved":
      return "payment_approved";
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "on_the_way":
      return "on_the_way";
    case "delivered":
      return "delivered";
    // payment_rejected: el adapter Twilio cubre este caso con texto libre.
    // Para Meta: cuando el trámite vuelva, aprobar `pf_payment_rejected` y
    // mapearlo aquí. Ver docs/audit/deuda-tecnica.md D02.
    default:
      return null;
  }
}
