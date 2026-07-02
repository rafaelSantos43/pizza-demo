import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";

// Token corto random URL-safe. Reemplaza el formato `<uuid>.<iat>.<hmac>`
// que daba links de ~96 chars. La seguridad descansa solo en la DB
// (`order_tokens.token_hash`, `expires_at`, `used_at`); 9 bytes random
// = 72 bits de entropía es infactible adivinar dentro de la ventana
// de 2h.
function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function signToken(
  customerId: string,
  ttlMinutes = 120,
): Promise<{ token: string; expiresAt: Date }> {
  const id = randomUUID();
  const token = base64url(randomBytes(9)); // 12 chars URL-safe
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  const { error } = await supabaseAdmin.from("order_tokens").insert({
    id,
    token_hash: tokenHash,
    customer_id: customerId,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw error;

  return { token, expiresAt };
}
