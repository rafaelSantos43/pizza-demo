import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getClientEnv } from "@/lib/env";

// TODO: parametrizar con Database tras correr supabase gen types typescript
export async function createClient() {
  const cookieStore = await cookies();
  const env = getClientEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Ignorado: setAll falla cuando se llama desde un Server Component;
            // la sesión se refresca via middleware o Server Actions.
          }
        },
      },
    },
  );
}
