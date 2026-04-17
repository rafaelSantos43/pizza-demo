import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
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
  ttlMinutes = 30,
): Promise<{ token: string; expiresAt: Date }> {
  const id = randomUUID();
  const iat = Date.now();
  const secret = getServerEnv().ORDER_TOKEN_SECRET;

  const iatPart = base64url(String(iat));
  const payload = `${id}.${iatPart}`;
  const sig = createHmac("sha256", secret).update(payload).digest();
  const token = `${payload}.${base64url(sig)}`;

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
