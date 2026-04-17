import { z } from "zod";

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
  notes: z.string().optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

export const createOrderInputSchema = z.object({
  token: z.string().min(1),
  customerName: z.string().min(1),
  addressInput: addressInputSchema,
  items: z.array(orderItemInputSchema).min(1),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentProofPath: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
