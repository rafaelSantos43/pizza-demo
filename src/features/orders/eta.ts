import type { DeliveryType, DeliveryZone } from "@/features/catalog/types";

// Fallback al primer zone para no romper el checkout si la zona del cliente
// no coincide con el catálogo configurado; el staff puede ajustar después.
export function computeEtaAt(
  zone: string | null,
  deliveryZones: DeliveryZone[],
  now: Date = new Date(),
  options?: { deliveryType?: DeliveryType; pickupPrepMin?: number },
): Date {
  // Pickup: tiempo fijo de preparación. No depende de zona ni de driver.
  // El cron de retrasos (eta_at + 10min) sigue activando badge rojo igual
  // que en delivery — reuso 100% sin cambios.
  if (options?.deliveryType === "pickup") {
    const min = options.pickupPrepMin ?? 30;
    return new Date(now.getTime() + min * 60_000);
  }

  const fallback = deliveryZones[0];
  const matched = zone
    ? deliveryZones.find((z) => z.zone === zone)
    : undefined;
  const chosen = matched ?? fallback;

  const etaMin = chosen?.eta_min ?? 30;
  return new Date(now.getTime() + etaMin * 60_000);
}
