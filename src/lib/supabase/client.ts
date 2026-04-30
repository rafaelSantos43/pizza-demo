import { createBrowserClient } from "@supabase/ssr";

import { getClientEnv } from "@/lib/env";

// Sin tipos generados: D13 en docs/audit/deuda-tecnica.md.
export function createClient() {
  const env = getClientEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
