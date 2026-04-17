// Genera un magic link directo (sin mandar email) para saltar el rate limit
// de Supabase SMTP. Uso dev-only.
//
// Uso: bun scripts/gen-login-link.ts <email>

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Uso: bun scripts/gen-login-link.ts <email>");
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

const admin = createClient(url, serviceKey);

// Crea el user si no existe (admin.generateLink con type=magiclink falla si
// el user no existe todavía). Si ya existe, devuelve error "already" que
// ignoramos.
const { error: createErr } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (createErr) {
  const msg = createErr.message.toLowerCase();
  const isAlreadyExists =
    msg.includes("already") || msg.includes("registered") || msg.includes("exists");
  if (!isAlreadyExists) {
    console.error("Error creando user:", createErr.message);
    process.exit(1);
  }
}

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `${appUrl}/auth/callback` },
});

if (error) {
  console.error("Error generando link:", error.message);
  process.exit(1);
}

const hashedToken = data?.properties?.hashed_token;
if (!hashedToken) {
  console.error("Respuesta inesperada:", JSON.stringify(data, null, 2));
  process.exit(1);
}

// Construimos la URL que nuestro callback server-side puede procesar
// (token_hash + type → verifyOtp). La URL cruda del admin usa hash fragment
// que el server no puede leer.
const callbackUrl = new URL(`${appUrl}/auth/callback`);
callbackUrl.searchParams.set("token_hash", hashedToken);
callbackUrl.searchParams.set("type", "magiclink");

console.log("\n✓ Magic link (pégalo en el browser):\n");
console.log(callbackUrl.toString());
console.log("");
