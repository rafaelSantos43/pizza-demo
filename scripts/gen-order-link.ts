// Genera un link /pedir/<token> válido para un teléfono dado.
// Crea el customer si no existe y registra el token en order_tokens.
// Uso dev-only para simular el flujo del webhook de WhatsApp.
//
// Uso: bun scripts/gen-order-link.ts +573001112233 "Rafa"

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const phone = process.argv[2];
const name = process.argv[3] ?? null;

if (!phone || !phone.startsWith("+")) {
  console.error(
    'Uso: bun scripts/gen-order-link.ts <phone E.164> ["nombre"]\n' +
      'Ejemplo: bun scripts/gen-order-link.ts +573001112233 "Rafa"',
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!url || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1. Upsert customer por phone.
const { data: existing, error: selErr } = await admin
  .from("customers")
  .select("id, name")
  .eq("phone", phone)
  .maybeSingle();
if (selErr) {
  console.error("Error buscando customer:", selErr.message);
  process.exit(1);
}

let customerId: string;
if (existing) {
  customerId = (existing as { id: string }).id;
  console.log(`✓ Customer existente: ${customerId}`);
} else {
  const { data: inserted, error: insErr } = await admin
    .from("customers")
    .insert({ phone, name })
    .select("id")
    .single();
  if (insErr) {
    console.error("Error creando customer:", insErr.message);
    process.exit(1);
  }
  customerId = (inserted as { id: string }).id;
  console.log(`✓ Customer nuevo: ${customerId}`);
}

// 2. Generar token corto random URL-safe (12 chars). La seguridad descansa
// en order_tokens (token_hash + expires_at + used_at), no en HMAC.
function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const token = toBase64Url(randomBytes(9));
const tokenHash = createHash("sha256").update(token).digest("hex");
const expiresAt = new Date(Date.now() + 120 * 60_000).toISOString();

// 3. Insertar en order_tokens.
const { error: insTokErr } = await admin.from("order_tokens").insert({
  token_hash: tokenHash,
  customer_id: customerId,
  expires_at: expiresAt,
});
if (insTokErr) {
  console.error("Error insertando token:", insTokErr.message);
  process.exit(1);
}

console.log("\n✓ Link de pedido (pégalo en tu celular, válido 2 horas):\n");
console.log(`${appUrl}/pedir/${token}`);
console.log("");
