// Marca un token de /pedir/<token> como EXPIRADO en DB para probar el
// flujo de "pedir nuevo link" sin esperar 2h. NO toca ningún archivo del
// runtime. Dev-only: requiere SUPABASE_SERVICE_ROLE_KEY del .env.local.
//
// Uso (cualquiera de las dos formas):
//   bun scripts/expire-order-link.ts <token-completo>
//   bun scripts/expire-order-link.ts --phone +573001112233   # expira el más reciente del cliente

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const arg = process.argv[2];
const phoneFlag = process.argv[2] === "--phone" ? process.argv[3] : null;

if (!arg || (arg === "--phone" && !phoneFlag)) {
  console.error(
    "Uso:\n" +
      "  bun scripts/expire-order-link.ts <token>\n" +
      "  bun scripts/expire-order-link.ts --phone +573001112233",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pastDate = new Date(Date.now() - 60_000).toISOString();

if (phoneFlag) {
  const { data: customer, error: custErr } = await admin
    .from("customers")
    .select("id")
    .eq("phone", phoneFlag)
    .maybeSingle();
  if (custErr || !customer) {
    console.error(`No encontré customer con phone ${phoneFlag}`);
    process.exit(1);
  }

  const { data: latest, error: tokErr } = await admin
    .from("order_tokens")
    .select("id, token_hash")
    .eq("customer_id", (customer as { id: string }).id)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tokErr || !latest) {
    console.error("No hay tokens activos para ese teléfono.");
    process.exit(1);
  }

  const { error: updErr } = await admin
    .from("order_tokens")
    .update({ expires_at: pastDate })
    .eq("id", (latest as { id: string }).id);
  if (updErr) {
    console.error("Error expirando token:", updErr.message);
    process.exit(1);
  }
  console.log(`✓ Token más reciente de ${phoneFlag} marcado como expirado.`);
} else {
  const tokenHash = createHash("sha256").update(arg).digest("hex");
  const { data, error } = await admin
    .from("order_tokens")
    .update({ expires_at: pastDate })
    .eq("token_hash", tokenHash)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Error expirando token:", error.message);
    process.exit(1);
  }
  if (!data) {
    console.error("Token no encontrado en DB.");
    process.exit(1);
  }
  console.log("✓ Token marcado como expirado. Ya puedes abrir el link.");
}
