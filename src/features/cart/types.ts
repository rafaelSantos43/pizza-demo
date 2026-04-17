import type { PizzaSize } from "@/features/catalog/types";

export interface CartFlavor {
  productId: string;
  name: string;
}

export interface CartItem {
  productId: string;
  productName: string;
  size: PizzaSize;
  sizeLabel: string;
  qty: number;
  unitPriceCents: number;
  flavors: CartFlavor[];
  notes: string;
}
