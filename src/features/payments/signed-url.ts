import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getSignedProofUrl(
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUrl(path, expiresInSec);
    if (error) {
      console.error("getSignedProofUrl failed", error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (err) {
    console.error("getSignedProofUrl threw", err);
    return null;
  }
}
