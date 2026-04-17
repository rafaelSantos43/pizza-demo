import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getClientEnv, getServerEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

function buildClient(): SupabaseClient {
  if (cached) return cached;
  const env = getClientEnv();
  const server = getServerEnv();
  cached = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    server.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}

// Proxy lazy: importar este módulo NO valida env ni construye el cliente
// (eso rompe `next build` y el dev server cuando no hay .env.local).
// El cliente se materializa en el primer acceso a una propiedad.
// TODO: parametrizar con Database tras correr supabase gen types typescript.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const instance = buildClient();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
