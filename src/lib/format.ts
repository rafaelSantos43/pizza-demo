// Los precios en DB se guardan ya en COP completos (no en centavos), pero el
// nombre de la columna es price_cents. Mostramos el valor tal cual.
export function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}
