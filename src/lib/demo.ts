// Demo mode: permite navegar el panel y el catálogo sin Supabase real.
// Activación: poner `NEXT_PUBLIC_DEMO_MODE=true` en `.env.local`. Necesita
// el prefijo NEXT_PUBLIC_ para que Next la inline también en el bundle del
// cliente (la usan client components como OrdersBoard).
// Cuando esté activo, las queries devuelven fixtures, las Server Actions son
// no-ops que retornan `{ ok: true }`, y el validator de env evita tirar por
// falta de credenciales.

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export const DEMO_PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "demo-anon-key",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
} as const;

export const DEMO_SERVER_ENV = {
  NODE_ENV: "development" as const,
  SUPABASE_SERVICE_ROLE_KEY: "demo-service-role-key",
  ORDER_TOKEN_SECRET: "demo-secret-with-at-least-32-characters-xx",
  WHATSAPP_VERIFY_TOKEN: "demo",
  WHATSAPP_APP_SECRET: "demo",
  WHATSAPP_ACCESS_TOKEN: "demo",
  WHATSAPP_PHONE_NUMBER_ID: "demo",
  META_GRAPH_API_VERSION: "v23.0",
  CRON_SECRET: "demo-cron-secret-16chars-min",
};
