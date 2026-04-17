"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/features/auth/guards";
import { isDemoMode } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { DEMO_PRODUCTS } from "./demo-fixtures";
import {
  productInputSchema,
  productUpdateInputSchema,
  type ProductInput,
  type ProductUpdateInput,
} from "./schemas";
import type { Product } from "./types";

type SimpleResult = { ok: true } | { ok: false; error: string };
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function revalidateCatalog(): void {
  revalidatePath("/menu");
  revalidatePath("/pedir/[token]", "page");
}

function buildProductRow(input: ProductInput) {
  return {
    name: input.name,
    category: input.category,
    description: input.description ?? null,
    image_url: input.image_url ?? null,
    max_flavors: input.max_flavors,
    min_size_for_multiflavor: input.min_size_for_multiflavor ?? null,
  };
}

function buildSizeRows(productId: string, input: ProductInput) {
  return input.sizes.map((s) => ({
    product_id: productId,
    size: s.size,
    price_cents: s.price_cents,
  }));
}

export async function createProduct(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireStaff({ roles: ["admin"] });

  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }
  const data = parsed.data;

  if (isDemoMode()) {
    const id = `demo-product-${Date.now().toString(36)}`;
    const product: Product = {
      id,
      name: data.name,
      category: data.category,
      description: data.description ?? null,
      image_url: data.image_url ?? null,
      max_flavors: data.max_flavors,
      min_size_for_multiflavor: data.min_size_for_multiflavor ?? null,
      active: true,
      sizes: data.sizes.map((s) => ({ size: s.size, price_cents: s.price_cents })),
    };
    DEMO_PRODUCTS.push(product);
    revalidateCatalog();
    return { ok: true, data: { id } };
  }

  try {
    const { data: productRow, error: productErr } = await supabaseAdmin
      .from("products")
      .insert({ ...buildProductRow(data), active: true })
      .select("id")
      .single();
    if (productErr) throw productErr;
    const id = (productRow as { id: string }).id;

    const { error: sizesErr } = await supabaseAdmin
      .from("product_sizes")
      .insert(buildSizeRows(id, data));
    if (sizesErr) throw sizesErr;

    revalidateCatalog();
    return { ok: true, data: { id } };
  } catch (err) {
    console.error("createProduct failed", err);
    return { ok: false, error: "No pudimos crear el producto." };
  }
}

export async function updateProduct(
  input: unknown,
): Promise<SimpleResult> {
  await requireStaff({ roles: ["admin"] });

  const parsed = productUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }
  const data: ProductUpdateInput = parsed.data;

  if (isDemoMode()) {
    const idx = DEMO_PRODUCTS.findIndex((p) => p.id === data.id);
    if (idx === -1) return { ok: false, error: "Producto no encontrado" };
    DEMO_PRODUCTS[idx] = {
      ...DEMO_PRODUCTS[idx],
      name: data.name,
      category: data.category,
      description: data.description ?? null,
      image_url: data.image_url ?? null,
      max_flavors: data.max_flavors,
      min_size_for_multiflavor: data.min_size_for_multiflavor ?? null,
      active: data.active ?? DEMO_PRODUCTS[idx].active,
      sizes: data.sizes.map((s) => ({ size: s.size, price_cents: s.price_cents })),
    };
    revalidateCatalog();
    return { ok: true };
  }

  try {
    const productUpdate: Record<string, unknown> = buildProductRow(data);
    if (data.active !== undefined) productUpdate.active = data.active;

    const { error: updateErr } = await supabaseAdmin
      .from("products")
      .update(productUpdate)
      .eq("id", data.id);
    if (updateErr) throw updateErr;

    const { error: sizesErr } = await supabaseAdmin
      .from("product_sizes")
      .upsert(buildSizeRows(data.id, data), {
        onConflict: "product_id,size",
      });
    if (sizesErr) throw sizesErr;

    revalidateCatalog();
    return { ok: true };
  } catch (err) {
    console.error("updateProduct failed", err);
    return { ok: false, error: "No pudimos actualizar el producto." };
  }
}

export async function toggleProductActive(input: {
  id: string;
  active: boolean;
}): Promise<SimpleResult> {
  await requireStaff({ roles: ["admin"] });

  if (isDemoMode()) {
    const product = DEMO_PRODUCTS.find((p) => p.id === input.id);
    if (!product) return { ok: false, error: "Producto no encontrado" };
    product.active = input.active;
    revalidateCatalog();
    return { ok: true };
  }

  try {
    const { error } = await supabaseAdmin
      .from("products")
      .update({ active: input.active })
      .eq("id", input.id);
    if (error) throw error;

    revalidateCatalog();
    return { ok: true };
  } catch (err) {
    console.error("toggleProductActive failed", err);
    return { ok: false, error: "No pudimos cambiar el estado del producto." };
  }
}

export async function deleteProduct(id: string): Promise<SimpleResult> {
  await requireStaff({ roles: ["admin"] });

  if (isDemoMode()) {
    const product = DEMO_PRODUCTS.find((p) => p.id === id);
    if (!product) return { ok: false, error: "Producto no encontrado" };
    product.active = false;
    revalidateCatalog();
    return { ok: true };
  }

  try {
    // Soft delete: order_items referencia productos pasados; el hard delete rompería la auditoría histórica.
    const { error } = await supabaseAdmin
      .from("products")
      .update({ active: false })
      .eq("id", id);
    if (error) throw error;

    revalidateCatalog();
    return { ok: true };
  } catch (err) {
    console.error("deleteProduct failed", err);
    return { ok: false, error: "No pudimos eliminar el producto." };
  }
}
