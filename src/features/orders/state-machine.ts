import type { DeliveryType, OrderStatus } from "./types";

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["awaiting_payment", "preparing", "cancelled"],
  awaiting_payment: ["payment_approved", "payment_rejected", "cancelled"],
  payment_approved: ["preparing", "cancelled"],
  payment_rejected: ["awaiting_payment", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["on_the_way", "delivered", "cancelled"],
  on_the_way: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  deliveryType: DeliveryType = "delivery",
): boolean {
  if (!VALID_TRANSITIONS[from].includes(to)) return false;
  // Pickup salta on_the_way: el cliente recoge en el local, no hay tránsito.
  // Delivery NO puede saltar de ready a delivered: el driver debe pasar por
  // on_the_way para que el cliente reciba la notificación "en camino".
  if (deliveryType === "pickup" && to === "on_the_way") return false;
  if (deliveryType === "delivery" && from === "ready" && to === "delivered") {
    return false;
  }
  return true;
}
