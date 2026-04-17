export type PizzaSize =
  | "personal"
  | "pequena"
  | "mediana"
  | "grande"
  | "familiar";

export interface ProductSize {
  size: PizzaSize;
  price_cents: number;
}

export interface Product {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  max_flavors: number;
  min_size_for_multiflavor: PizzaSize | null;
  active: boolean;
  sizes: ProductSize[];
}

export const SIZE_ORDER: PizzaSize[] = [
  "personal",
  "pequena",
  "mediana",
  "grande",
  "familiar",
];

export const SIZE_LABEL: Record<PizzaSize, string> = {
  personal: "Personal",
  pequena: "Pequeña",
  mediana: "Mediana",
  grande: "Grande",
  familiar: "Familiar",
};

// Convención fija del restaurante (single-tenant). Si entran más clientes,
// mover a `settings.size_specs` o por-producto.
export interface SizeInfo {
  porciones: number;
  diametro_cm: number;
}

export const SIZE_INFO: Record<PizzaSize, SizeInfo> = {
  personal: { porciones: 4, diametro_cm: 20 },
  pequena: { porciones: 4, diametro_cm: 25 },
  mediana: { porciones: 6, diametro_cm: 30 },
  grande: { porciones: 8, diametro_cm: 35 },
  familiar: { porciones: 12, diametro_cm: 40 },
};

export interface DeliveryZone {
  zone: string;
  eta_min: number;
}

export interface PaymentAccounts {
  nequi?: string;
  bancolombia?: string;
  llave?: string;
}

export interface Settings {
  business_name: string;
  payment_accounts: PaymentAccounts;
  delivery_zones: DeliveryZone[];
}
