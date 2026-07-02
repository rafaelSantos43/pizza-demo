import "server-only";

import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";

import type {
  ResolveExpiredTokenResult,
  ResolveTokenCustomerResult,
  VerifyResult,
} from "./schemas";

// Tokens nuevos son 12 chars URL-safe. Permitimos 8-32 para tolerar variaciones
// futuras del tamaño sin tirar `malformed` por una letra de más.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{8,32}$/;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// 2-step: verify SOLO lee. createOrder marca used_at. Así el catálogo sigue
// vigente si el cliente refresca antes de confirmar.
export async function verifyToken(token: string): Promise<VerifyResult> {
  if (!TOKEN_FORMAT.test(token)) return { ok: false, reason: "malformed" };

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

// Recupera el customer_id de un token EXPIRADO o USADO. Se usa para el
// flujo de "pedir nuevo link" desde la página de link expirado.
export async function getCustomerIdFromExpiredToken(
  token: string,
): Promise<ResolveExpiredTokenResult> {
  if (!TOKEN_FORMAT.test(token)) return { ok: false, reason: "malformed" };

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

// Resuelve el customer_id de un token con formato válido, sin importar
// el estado de vida (válido, usado, expirado). Se usa donde solo nos
// interesa la identidad del titular del token, no su autorización para
// crear pedidos. Caso típico: página de gracias, donde el token recién
// se marcó `used` al confirmar el pedido.
export async function resolveTokenCustomer(
  token: string,
): Promise<ResolveTokenCustomerResult> {
  if (!TOKEN_FORMAT.test(token)) return { ok: false, reason: "malformed" };

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
