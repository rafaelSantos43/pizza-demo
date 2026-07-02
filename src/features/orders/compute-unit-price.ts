import type { PizzaSize } from "@/features/catalog/types";

export type ComputeUnitPriceResult =
  | { ok: true; price: number }
  | { ok: false; reason: "product_or_size" | "flavor_missing" };

export function computeUnitPrice(params: {
  baseProductId: string;
  flavors: string[] | undefined;
  size: PizzaSize;
  priceMap: Map<string, number>;
  addonExtra?: number;
}): ComputeUnitPriceResult {
  const { baseProductId, flavors, size, priceMap, addonExtra = 0 } = params;
  const key = (id: string) => `${id}:${size}`;

  const basePrice = priceMap.get(key(baseProductId));
  if (basePrice === undefined) return { ok: false, reason: "product_or_size" };

  if (!flavors || flavors.length === 0) {
    return { ok: true, price: basePrice + addonExtra };
  }

  // Mitad-y-mitad: el producto principal es parte de la combinación; el precio
  // se toma como el máximo de la base + cada sabor adicional (regla del menú
  // "se toma el valor más alto"). El addon (borde/estofada) suma encima.
  const prices: number[] = [basePrice];
  for (const flavorId of flavors) {
    const price = priceMap.get(key(flavorId));
    if (price === undefined) return { ok: false, reason: "flavor_missing" };
    prices.push(price);
  }
  return { ok: true, price: Math.max(...prices) + addonExtra };
}
