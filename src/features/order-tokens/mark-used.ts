import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

// Marca el token como usado de forma atómica. Retorna `true` si esta
// llamada fue la que efectivamente lo marcó, `false` si otra request
// concurrente ya lo había marcado (race condition entre verifyToken y
// markTokenUsed). El caller debe abortar si retorna false para no crear
// pedidos duplicados.
export async function markTokenUsed(tokenId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("order_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("used_at", null)
    .select("id");

  if (error) throw error;
  return Boolean(data && data.length > 0);
}
