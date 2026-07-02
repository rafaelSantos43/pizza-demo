// Rehospeda las fotos de producto que hoy apuntan a URLs efímeras (mockup de
// Stitch, lh3.googleusercontent.com/aida-public/...) en un bucket PÚBLICO de
// Supabase Storage propio, y actualiza products.image_url a la URL estable.
// Idempotente: si ya está en /storage/v1/object/public/ lo salta.
//
// Uso: bun scripts/host-product-images.ts

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

const BUCKET = "product-images";
const NAMES = ["4 Quesos", "Bacon Peperoni", "Bocadillo", "Vegetariana"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// 1. Asegura el bucket público.
const { error: bErr } = await admin.storage.createBucket(BUCKET, {
  public: true,
});
if (bErr && !/exist/i.test(bErr.message)) {
  console.error("Error creando bucket:", bErr.message);
  process.exit(1);
}
console.log(`Bucket "${BUCKET}" listo (público).`);

// 2. Lee los productos objetivo.
const { data: prods, error: selErr } = await admin
  .from("products")
  .select("id, name, image_url")
  .in("name", NAMES);
if (selErr) {
  console.error("Error leyendo products:", selErr.message);
  process.exit(1);
}

for (const p of prods ?? []) {
  const prod = p as { id: string; name: string; image_url: string | null };
  if (!prod.image_url) {
    console.log(`— ${prod.name}: sin image_url, se salta`);
    continue;
  }
  if (prod.image_url.includes("/storage/v1/object/public/")) {
    console.log(`✓ ${prod.name}: ya está en tu storage`);
    continue;
  }
  try {
    const res = await fetch(prod.image_url);
    if (!res.ok) {
      console.error(`✗ ${prod.name}: fetch ${res.status}`);
      continue;
    }
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    const path = `${slugify(prod.name)}.${ext}`;

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: ct, upsert: true });
    if (upErr) {
      console.error(`✗ ${prod.name}: upload ${upErr.message}`);
      continue;
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    const { error: updErr } = await admin
      .from("products")
      .update({ image_url: pub.publicUrl })
      .eq("id", prod.id);
    if (updErr) {
      console.error(`✗ ${prod.name}: update ${updErr.message}`);
      continue;
    }
    console.log(`✓ ${prod.name} → ${pub.publicUrl}`);
  } catch (e) {
    console.error(`✗ ${prod.name}:`, (e as Error).message);
  }
}

console.log("\nListo. Las fotos ahora viven en tu Supabase Storage.");
