// Dev-only: asigna a 5 productos las mismas fotos que usa el mockup Heritage
// de Stitch (URLs públicas lh3.googleusercontent.com/aida-public/...).
// Uso interino para el demo — cuando lleguen las fotos reales de el cliente
// se reemplazan con otro UPDATE (ver ENGRAM 2026-07-01).
//
// Uso: bun scripts/set-stitch-images.ts

import { createClient } from "@supabase/supabase-js";

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

const MAP: Record<string, string> = {
  "4 Quesos":
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCEa3tygy5gqdVLfnSKjUisMGBfr4tXon41UzhgsGVyhHndCN4-gvZnw4PjZ4iv-YMvFlhChVHOsFGvHtAF764beRk32rmpycJoyQ3rcWvWemq9uHcp7MjLTPxps4DVMyIXpY9BNyiOraUec7iIwtAS5EjWcJeygizyteKmf1b1_uQkR_XB9tOAqHEnYT8KObFUn8mWBrR6ECEnGFS1ngTIJ-s1ULVcKVxMJjjamd24QLhfSTH0dFPu5Q64Lgt1jLtSxhMSoIF523Kw",
  // Aborrajada se OMITE a propósito: la imagen que generó Stitch para ese
  // producto trae texto incrustado (artefacto de generación). Se dejó su
  // image_url en null hasta tener la foto real de el cliente.
  "Bacon Peperoni":
    "https://lh3.googleusercontent.com/aida-public/AB6AXuA90uRgmVoR0R8u0621J4JtV5WHCZq2ia2qa_3EyWhzx61YBuDbO4Qt2uPcC_gBw8UU8104xrWwNpey-GVECQbli5Fx3u9GHQ7jI2QX0SbjGG8uaN6C2xd0T7_gvQ0R9ooaxcRL-K0SFItCJiWQzWwesuquHP63MUnNVPwXZr6P0ukVMdXkNJhvWupy4cxaB7WGJrDeFbWdZ4yIw2PbDseqFuALWjt31jnmarFDnj7R5HiyMCe_W78Ox7Bk8z7hRNYBPnbBtdasIEtM",
  Bocadillo:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDhKky6itY5HJUd_1PlXpeKw8aEB_KxyEyWhtCa9ruL5aa5BKRSFsdWFEeRE_ZWY36pxveglEYuGV0erXAob1L3fnYdORK-9v5CnrPCk5MUhrAjjhd1uTxwBHuCe4crdrXVXloPr-oozXH9SgYtEVIFaNO-oVMULXWFVTDV146lPKe31mDljbhX_qav7uYC1FUT8wXRsM6FiGSPj57JxX9UOQ1QH1II-3NqN-va9z8mWIyw6OWC2aSM6owoqYkHslBJYE-AsA0BDvjo",
  Vegetariana:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBH-0lZG2Xxbt1tFcPY62EBwoHEr3gr1Me2DZ6Q3LRXxQMSETGq9Z5THTFULKo1dqUEiMVS8usc22yexiASwCeKrMaDrZYXKf1Nj7264Fz0zSzQYJStGJSs-AXJU2yJMq5L8G5V1mAeIxUOVgIMAUUdmVJ1V_kb3CdrBNqXyXIzCoZJqxmW0Bpj-4bGAOOquzg2CZbDvsjoyk8VEWDyd5RyoT8cw6r2zOKeQpRKZjgRtNbnkqXoGC4B1Vl4okBBb-AH2aakUdva6_Jg",
};

for (const [name, imageUrl] of Object.entries(MAP)) {
  const { data, error } = await admin
    .from("products")
    .update({ image_url: imageUrl })
    .eq("name", name)
    .select("id, name");
  if (error) {
    console.error(`✗ ${name}: ${error.message}`);
    continue;
  }
  const n = (data ?? []).length;
  console.log(n > 0 ? `✓ ${name} (${n} fila)` : `— ${name}: no existe en DB`);
}

console.log("\nListo. Refresca el catálogo para ver las fotos de Stitch.");
