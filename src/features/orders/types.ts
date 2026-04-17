export type OrderStatus =
  | "new"
  | "awaiting_payment"
  | "payment_approved"
  | "payment_rejected"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "cash" | "bancolombia" | "nequi" | "llave";

export interface OrderSummaryCustomer {
  id: string;
  phone: string;
  name: string | null;
}

export interface OrderSummaryAddress {
  street: string;
  complex_name: string | null;
  neighborhood: string | null;
  zone: string | null;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  total_cents: number;
  payment_method: PaymentMethod;
  needs_proof: boolean;
  delayed: boolean;
  eta_at: string | null;
  created_at: string;
  customer: OrderSummaryCustomer;
  address: OrderSummaryAddress;
  item_count: number;
  driver_id: string | null;
}

export interface OrderDetailCustomer {
  id: string;
  phone: string;
  name: string | null;
}

export interface OrderDetailAddress {
  id: string;
  street: string;
  complex_name: string | null;
  tower: string | null;
  apartment: string | null;
  neighborhood: string | null;
  references: string | null;
  zone: string | null;
}

export interface OrderDetailItem {
  id: string;
  product_id: string;
  product_name: string | null;
  size: string;
  qty: number;
  unit_price_cents: number;
  flavor_names: string[] | null;
  notes: string | null;
}

export interface OrderStatusEvent {
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  created_at: string;
}

export interface OrderDetail {
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
  customer: OrderDetailCustomer;
  address: OrderDetailAddress;
  items: OrderDetailItem[];
  status_events: OrderStatusEvent[];
}
