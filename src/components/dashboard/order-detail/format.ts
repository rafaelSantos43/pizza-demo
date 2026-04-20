import type { OrderDetail, PaymentMethod } from "@/features/orders/types";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  bancolombia: "Bancolombia",
  nequi: "Nequi",
  llave: "Llave",
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return dateTimeFormatter.format(new Date(iso));
  } catch {
    return "—";
  }
}

export function buildAddressLines(detail: OrderDetail): string[] {
  const a = detail.address;
  const lines: string[] = [a.street];
  const lvl2 = [a.complex_name, a.tower, a.apartment]
    .filter((v): v is string => Boolean(v && v.trim().length))
    .join(" · ");
  if (lvl2) lines.push(lvl2);
  if (a.neighborhood || a.zone) {
    lines.push([a.neighborhood, a.zone].filter(Boolean).join(" · "));
  }
  if (a.references) lines.push(a.references);
  return lines;
}
