"use server";

import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  uploadProofInputSchema,
  type AllowedProofMime,
} from "./schemas";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const EXT_BY_MIME: Record<AllowedProofMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadPaymentProof(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const raw = {
    orderTokenId: formData.get("orderTokenId"),
    file: formData.get("file"),
  };
  const parsed = uploadProofInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Archivo inválido" };
  }
  const { orderTokenId, file } = parsed.data;

  try {
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from("order_tokens")
      .select("id, expires_at, used_at")
      .eq("id", orderTokenId)
      .maybeSingle();
    if (tokenErr) throw tokenErr;
    if (!tokenRow) return { ok: false, error: "Enlace no encontrado" };

    const row = tokenRow as {
      id: string;
      expires_at: string;
      used_at: string | null;
    };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false, error: "El enlace expiró" };
    }
    // L02-L03: token consumido por createOrder no puede aceptar más uploads;
    // de lo contrario se acumulan archivos huérfanos en Storage que nunca
    // quedan asociados a un pedido.
    if (row.used_at) {
      return { ok: false, error: "Enlace ya usado" };
    }

    const mime = file.type as AllowedProofMime;
    const ext = EXT_BY_MIME[mime];
    const path = `pending/${orderTokenId}/${randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("payment-proofs")
      .upload(path, file, {
        contentType: mime,
        cacheControl: "3600",
      });
    if (uploadErr) throw uploadErr;

    return { ok: true, data: { path } };
  } catch (err) {
    console.error("uploadPaymentProof failed", err);
    return { ok: false, error: "No pudimos subir el comprobante." };
  }
}
