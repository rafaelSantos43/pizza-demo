export type Intent = "status_inquiry" | "greet" | "unknown";

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const STATUS_PATTERNS: RegExp[] = [
  /\bya\??\b/,
  /\bya viene\??\b/,
  /\bcuanto falta\b/,
  /\bcuanto va a tardar\b/,
  /\bdonde esta mi pedido\b/,
  /\bdonde va\b/,
  /\bviene\??\b/,
  /\bmi orden\b/,
  /\bmi pedido\b/,
  /\bel pedido\b/,
];

const GREET_PATTERNS: RegExp[] = [
  /\bhola\b/,
  /\bbuenas\b/,
  /\bbuenos dias\b/,
  /\bbuenas tardes\b/,
  /\bbuenas noches\b/,
  /\bquiero pedir\b/,
  /\bordenar\b/,
  /\bpedido\b/,
  /\bpizza\b/,
  /\bmenu\b/,
  /\bcarta\b/,
];

export function detectIntent(text: string): Intent {
  const n = normalize(text);
  if (!n) return "greet";

  for (const re of STATUS_PATTERNS) {
    if (re.test(n)) return "status_inquiry";
  }
  for (const re of GREET_PATTERNS) {
    if (re.test(n)) return "greet";
  }
  // Default conservador: ante la duda mandamos el link al catálogo.
  return "greet";
}
