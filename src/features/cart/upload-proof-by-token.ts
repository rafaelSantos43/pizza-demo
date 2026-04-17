"use server";

import { verifyToken } from "@/features/order-tokens/verify";
import { uploadPaymentProof } from "@/features/payments/upload-proof";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Wrapper que el cliente llama con el token opaco. Resolvemos tokenId server-side
// porque uploadPaymentProof requiere el UUID del token (el cliente no debería
// conocerlo). verifyToken NO marca used_at, así que es seguro llamarlo aquí
// antes del createOrder real.
export async function uploadProofByToken(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const token = formData.get("token");
  const file = formData.get("file");

  if (typeof token !== "string" || !token) {
    return { ok: false, error: "Enlace inválido" };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "Archivo inválido" };
  }

  const verify = await verifyToken(token);
  if (!verify.ok) {
    return { ok: false, error: "El enlace no es válido o expiró" };
  }

  const forwarded = new FormData();
  forwarded.set("orderTokenId", verify.tokenId);
  forwarded.set("file", file);

  return uploadPaymentProof(forwarded);
}
