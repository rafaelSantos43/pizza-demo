import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function markTokenUsed(tokenId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("order_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("used_at", null);

  if (error) throw error;
}
