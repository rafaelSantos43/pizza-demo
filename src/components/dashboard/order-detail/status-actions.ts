import { Ban, CheckCircle2, ChefHat, Truck, X } from "lucide-react";

import {
  approvePayment,
  rejectPayment,
  transitionOrder,
} from "@/features/orders/actions";
import type { OrderDetail, OrderStatus } from "@/features/orders/types";

type ActionResult = { ok: boolean; error?: string };

interface ActionDescriptor {
  label: string;
  icon: typeof CheckCircle2;
  variant: "default" | "destructive" | "success";
  // Acción excepcional/escape (ej. cancelar pedido) que convive con la
  // acción de flujo normal: se renderiza como ghost sutil para no competir
  // visualmente con la primaria. El variant de arriba se ignora cuando
  // subtle es true.
  subtle?: boolean;
  needsConfirm?: string;
  successMessage: string;
  build: (orderId: string) => () => Promise<ActionResult>;
}

export interface ActionConfig extends Omit<ActionDescriptor, "build"> {
  run: () => Promise<ActionResult>;
}

const transitionTo =
  (toStatus: OrderStatus) => (orderId: string) => () =>
    transitionOrder({ orderId, toStatus });

const APPROVE_PAYMENT: ActionDescriptor = {
  label: "Aprobar pago",
  icon: CheckCircle2,
  variant: "success",
  successMessage: "Pago aprobado",
  build: (id) => () => approvePayment(id),
};

const REJECT_PAYMENT: ActionDescriptor = {
  label: "Rechazar comprobante",
  icon: X,
  variant: "destructive",
  needsConfirm: "¿Rechazar el comprobante? Se le pedirá uno nuevo al cliente.",
  successMessage: "Comprobante rechazado",
  build: (id) => () => rejectPayment(id),
};

const TO_PREPARING: ActionDescriptor = {
  label: "Marcar en preparación",
  icon: ChefHat,
  variant: "success",
  successMessage: "Pedido en preparación",
  build: transitionTo("preparing"),
};

const TO_READY: ActionDescriptor = {
  label: "Marcar listo",
  icon: CheckCircle2,
  variant: "success",
  successMessage: "Pedido listo",
  build: transitionTo("ready"),
};

const TO_ON_THE_WAY: ActionDescriptor = {
  label: "Marcar en camino",
  icon: Truck,
  variant: "success",
  successMessage: "Pedido en camino",
  build: transitionTo("on_the_way"),
};

const TO_DELIVERED: ActionDescriptor = {
  label: "Marcar entregado",
  icon: CheckCircle2,
  variant: "success",
  successMessage: "Pedido entregado",
  build: transitionTo("delivered"),
};

const CANCEL: ActionDescriptor = {
  label: "Cancelar pedido",
  icon: Ban,
  variant: "destructive",
  subtle: true,
  needsConfirm: "¿Seguro que quieres cancelar este pedido?",
  successMessage: "Pedido cancelado",
  build: transitionTo("cancelled"),
};

// Pickup salta `on_the_way`: cuando la pizza está lista, el cliente la
// recoge y el cajero la marca entregada directamente. La state machine
// del server ya valida `ready → delivered` solo si delivery_type=pickup
// (ver state-machine.ts), aquí refleja la UI esa misma decisión.
const STATUS_ACTIONS_DELIVERY: Partial<Record<OrderStatus, ActionDescriptor[]>> =
  {
    awaiting_payment: [APPROVE_PAYMENT, REJECT_PAYMENT],
    new: [TO_PREPARING],
    payment_approved: [TO_PREPARING],
    preparing: [TO_READY],
    ready: [TO_ON_THE_WAY],
    on_the_way: [TO_DELIVERED],
  };

const STATUS_ACTIONS_PICKUP: Partial<Record<OrderStatus, ActionDescriptor[]>> =
  {
    awaiting_payment: [APPROVE_PAYMENT, REJECT_PAYMENT],
    new: [TO_PREPARING],
    payment_approved: [TO_PREPARING],
    preparing: [TO_READY],
    ready: [TO_DELIVERED],
  };

export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "delivered",
  "cancelled",
]);

export function actionsForStatus(detail: OrderDetail): ActionConfig[] {
  const matrix =
    detail.delivery_type === "pickup"
      ? STATUS_ACTIONS_PICKUP
      : STATUS_ACTIONS_DELIVERY;
  const descriptors = [...(matrix[detail.status] ?? [])];
  if (!TERMINAL_STATUSES.has(detail.status)) descriptors.push(CANCEL);

  return descriptors.map(({ build, ...rest }) => ({
    ...rest,
    run: build(detail.id),
  }));
}
