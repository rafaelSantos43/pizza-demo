// Vacía el bucket `payment-proofs` (comprobantes de pago) vía la Storage API.
// Supabase bloquea el DELETE directo sobre storage.objects, así que se usa la API.
// El bucket NO se elimina, solo se vacía. NO toca `product-images`.
//
// Uso: bun scripts/empty-proofs.ts

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "payment-proofs";

// Intento directo: emptyBucket vacía todo el bucket.
const { error: emptyErr } = await admin.storage.emptyBucket(BUCKET);
if (!emptyErr) {
  console.log(`✓ Bucket "${BUCKET}" vaciado.`);
  process.exit(0);
}

// Fallback: listar (recursivo) y remover en lotes.
console.log(`emptyBucket falló (${emptyErr.message}); intento list+remove…`);

async function collect(prefix: string): Promise<string[]> {
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000 });
  if (error) {
    console.error(`list ${prefix}: ${error.message}`);
    return [];
  }
  const paths: string[] = [];
  for (const entry of data ?? []) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // carpeta (sin id) → recursión; archivo → path
    if ((entry as { id: string | null }).id === null) {
      paths.push(...(await collect(full)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

const all = await collect("");
if (all.length === 0) {
  console.log("No hay archivos que borrar.");
  process.exit(0);
}
const { error: rmErr } = await admin.storage.from(BUCKET).remove(all);
if (rmErr) {
  console.error(`✗ remove: ${rmErr.message}`);
  process.exit(1);
}
console.log(`✓ Borrados ${all.length} archivos de "${BUCKET}".`);
