// Rebranding en 1 comando: cambia el nombre comercial en las DOS fuentes
//  1) la constante BRAND_NAME/BRAND_TAGLINE en src/config/brand.ts
//     (sidebar, login, landing, inicial del logo)
//  2) settings.business_name en la DB (header del catálogo del cliente)
//
// Úsalo para adaptar el demo a cada negocio (o dejarlo genérico):
//   bun scripts/rebrand.ts "Mi Pizzería" "Mi eslogan"
//   bun scripts/rebrand.ts "Pizza Demo"             (tagline opcional)
//
// En dev el cambio se ve al instante (hot reload). En Vercel requiere redeploy.

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const name = process.argv[2];
const tagline = process.argv[3] ?? "";

if (!name) {
  console.error(
    'Uso: bun scripts/rebrand.ts "<Nombre>" ["tagline opcional"]\n' +
      'Ej:  bun scripts/rebrand.ts "Mi Pizzería" "Mi eslogan"',
  );
  process.exit(1);
}

// 1. Reescribe la constante en src/config/brand.ts
const brandPath = "src/config/brand.ts";
let src = readFileSync(brandPath, "utf8");
const nameRe = /export const BRAND_NAME = .*;/;
const taglineRe = /export const BRAND_TAGLINE = .*;/;
if (!nameRe.test(src) || !taglineRe.test(src)) {
  console.error(
    "No pude ubicar las líneas BRAND_NAME/BRAND_TAGLINE en brand.ts (¿cambió el formato?).",
  );
  process.exit(1);
}
src = src
  .replace(nameRe, `export const BRAND_NAME = ${JSON.stringify(name)};`)
  .replace(taglineRe, `export const BRAND_TAGLINE = ${JSON.stringify(tagline)};`);
writeFileSync(brandPath, src);
console.log(`✓ brand.ts → BRAND_NAME="${name}", BRAND_TAGLINE="${tagline}"`);

// 2. Actualiza settings.business_name en la DB
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "\n⚠️ brand.ts quedó actualizado, pero faltan NEXT_PUBLIC_SUPABASE_URL / " +
      "SUPABASE_SERVICE_ROLE_KEY para actualizar la DB. Corre de nuevo con el .env cargado.",
  );
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await admin
  .from("settings")
  .update({ business_name: name })
  .not("id", "is", null);
if (error) {
  console.error(`✗ DB: ${error.message}`);
  process.exit(1);
}
console.log(`✓ settings.business_name → "${name}"`);
console.log("\nListo. Refresca la app para ver el rebrand.");
