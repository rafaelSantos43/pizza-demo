import type { DeliveryZone } from "@/features/catalog/types";

// Fallback al primer zone para no romper el checkout si la zona del cliente
// no coincide con el catálogo configurado; el staff puede ajustar después.
export function computeEtaAt(
  zone: string | null,
  deliveryZones: DeliveryZone[],
  now: Date = new Date(),
): Date {
  const fallback = deliveryZones[0];
  const matched = zone
    ? deliveryZones.find((z) => z.zone === zone)
    : undefined;
  const chosen = matched ?? fallback;

  const etaMin = chosen?.eta_min ?? 30;
  return new Date(now.getTime() + etaMin * 60_000);
}
