import { z } from "zod";

// Solo Colombia: +57 + 10 dígitos. El form UI ya fija el prefijo, pero
// validamos también server-side para que un admin con DevTools no pueda
// guardar un número de otro país sin querer.
const phoneE164 = z
  .string()
  .regex(/^\+57\d{10}$/, "Teléfono debe ser +57 seguido de 10 dígitos");

export const createDriverSchema = z.object({
  email: z.email("Email inválido"),
  display_name: z.string().min(2, "Nombre muy corto").max(80),
  phone: phoneE164,
});

export const updateDriverSchema = z.object({
  id: z.uuid(),
  display_name: z.string().min(2, "Nombre muy corto").max(80),
  phone: phoneE164,
});

export type CreateDriverInput = z.infer<typeof createDriverSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
