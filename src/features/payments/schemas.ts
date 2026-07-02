import { z } from "zod";

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export const ALLOWED_PROOF_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedProofMime = (typeof ALLOWED_PROOF_MIME)[number];

export const uploadProofInputSchema = z.object({
  orderTokenId: z.uuid(),
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= MAX_PROOF_BYTES, {
      message: "Archivo vacío o supera 5 MB",
    })
    .refine(
      (f) => (ALLOWED_PROOF_MIME as readonly string[]).includes(f.type),
      { message: "Formato no permitido (jpg, png o webp)" },
    ),
});

export type UploadProofInput = z.infer<typeof uploadProofInputSchema>;
