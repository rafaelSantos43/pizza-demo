import { createBrowserClient } from "@supabase/ssr";

import { getClientEnv } from "@/lib/env";

// TODO: parametrizar con Database tras correr supabase gen types typescript
export function createClient() {
  const env = getClientEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
