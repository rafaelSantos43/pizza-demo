import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

import type {
  ResolveExpiredTokenResult,
  ResolveTokenCustomerResult,
  VerifyResult,
} from "./schemas";

function base64urlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// 2-step: verify SOLO lee. createOrder marca used_at. Así el catálogo sigue
// vigente si el cliente refresca antes de confirmar.
export async function verifyToken(token: string): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [id, iatPart, sigPart] = parts;
  if (!id || !iatPart || !sigPart) return { ok: false, reason: "malformed" };

  const payload = `${id}.${iatPart}`;
  const expected = createHmac("sha256", getServerEnv().ORDER_TOKEN_SECRET)
    .update(payload)
    .digest();
  const provided = base64urlToBuffer(sigPart);

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  const tokenHash = sha256Hex(token);
  const { data, error } = await supabaseAdmin
    .from("order_tokens")
    .select("id, customer_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };

  const row = data as {
    id: string;
    customer_id: string;
    expires_at: string;
    used_at: string | null;
  };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.used_at) return { ok: false, reason: "used" };

  return { ok: true, customerId: row.customer_id, tokenId: row.id };
}

// Recupera el customer_id de un token EXPIRADO o USADO. Mantiene la
// verificación HMAC para no aceptar tokens inventados. Se usa para el
// flujo de "pedir nuevo link" desde la página de link expirado.
export async function getCustomerIdFromExpiredToken(
  token: string,
): Promise<ResolveExpiredTokenResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [id, iatPart, sigPart] = parts;
  if (!id || !iatPart || !sigPart) return { ok: false, reason: "malformed" };

  const payload = `${id}.${iatPart}`;
  const expected = createHmac("sha256", getServerEnv().ORDER_TOKEN_SECRET)
    .update(payload)
    .digest();
  const provided = base64urlToBuffer(sigPart);

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  const tokenHash = sha256Hex(token);
  const { data, error } = await supabaseAdmin
    .from("order_tokens")
    .select("customer_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };

  const row = data as {
    customer_id: string;
    expires_at: string;
    used_at: string | null;
  };

  const isExpired = new Date(row.expires_at).getTime() < Date.now();
  const isUsed = row.used_at !== null;

  if (!isExpired && !isUsed) {
    return { ok: false, reason: "still_valid" };
  }

  return {
    ok: true,
    customerId: row.customer_id,
    reason: isExpired ? "expired" : "used",
  };
}

// Resuelve el customer_id de un token con firma válida, sin importar
// el estado de vida (válido, usado, expirado). Se usa donde solo nos
// interesa la identidad del titular del token, no su autorización para
// crear pedidos. Caso típico: página de gracias, donde el token recién
// se marcó `used` al confirmar el pedido.
export async function resolveTokenCustomer(
  token: string,
): Promise<ResolveTokenCustomerResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [id, iatPart, sigPart] = parts;
  if (!id || !iatPart || !sigPart) return { ok: false, reason: "malformed" };

  const payload = `${id}.${iatPart}`;
  const expected = createHmac("sha256", getServerEnv().ORDER_TOKEN_SECRET)
    .update(payload)
    .digest();
  const provided = base64urlToBuffer(sigPart);

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  const tokenHash = sha256Hex(token);
  const { data, error } = await supabaseAdmin
    .from("order_tokens")
    .select("customer_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };

  const row = data as { customer_id: string };
  return { ok: true, customerId: row.customer_id };
}
