import { z } from "zod";

import { ADDON_KEYS, DELIVERY_TYPES } from "@/features/catalog/types";

export const PIZZA_SIZES = [
  "personal",
  "pequena",
  "mediana",
  "grande",
  "familiar",
] as const;

export const PAYMENT_METHODS = [
  "cash",
  "bancolombia",
  "nequi",
  "llave",
] as const;

export const addressInputSchema = z.object({
  street: z.string().min(1),
  complex_name: z.string().optional(),
  tower: z.string().optional(),
  apartment: z.string().optional(),
  neighborhood: z.string().optional(),
  references: z.string().optional(),
  zone: z.string().optional(),
});

export type AddressInput = z.infer<typeof addressInputSchema>;

export const orderItemInputSchema = z.object({
  productId: z.uuid(),
  size: z.enum(PIZZA_SIZES),
  qty: z.number().int().min(1).max(20),
  flavors: z.array(z.uuid()).max(4).optional(),
  addonKey: z.enum(ADDON_KEYS).nullable().optional(),
  notes: z.string().optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

export const createOrderInputSchema = z
  .object({
    token: z.string().min(1),
    customerName: z.string().min(1),
    // Default 'delivery' para preservar compat con callers legacy (tests
    // existentes, payloads viejos). El form actual siempre lo manda explícito.
    deliveryType: z.enum(DELIVERY_TYPES).default("delivery"),
    addressInput: addressInputSchema.optional(),
    items: z.array(orderItemInputSchema).min(1),
    paymentMethod: z.enum(PAYMENT_METHODS),
    paymentProofPath: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) =>
      data.deliveryType === "pickup" ||
      (data.addressInput && data.addressInput.street.length > 0),
    {
      message: "La dirección es obligatoria para pedidos a domicilio.",
      path: ["addressInput"],
    },
  );

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
