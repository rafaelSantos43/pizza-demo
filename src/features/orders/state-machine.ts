import type { OrderStatus } from "./types";

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["awaiting_payment", "preparing", "cancelled"],
  awaiting_payment: ["payment_approved", "payment_rejected", "cancelled"],
  payment_approved: ["preparing", "cancelled"],
  payment_rejected: ["awaiting_payment", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["on_the_way", "cancelled"],
  on_the_way: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
