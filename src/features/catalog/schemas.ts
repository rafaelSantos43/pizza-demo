import { z } from "zod";

export const PIZZA_SIZES = [
  "personal",
  "pequena",
  "mediana",
  "grande",
  "familiar",
] as const;

export const PRODUCT_CATEGORIES = ["pizza", "bebida", "adicional"] as const;

export const productSizeInputSchema = z.object({
  size: z.enum(PIZZA_SIZES),
  price_cents: z.int().min(0).max(10_000_000),
});

export const productInputSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(PRODUCT_CATEGORIES).default("pizza"),
  description: z.string().max(280).optional().nullable(),
  image_url: z.url().optional().nullable(),
  max_flavors: z.int().min(1).max(4),
  min_size_for_multiflavor: z.enum(PIZZA_SIZES).optional().nullable(),
  sizes: z
    .array(productSizeInputSchema)
    .length(5)
    .refine(
      (arr) => new Set(arr.map((s) => s.size)).size === 5,
      { message: "Debes definir los 5 tamaños sin repetir." },
    ),
});

export const productUpdateInputSchema = productInputSchema.extend({
  id: z.uuid(),
  active: z.boolean().optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;
