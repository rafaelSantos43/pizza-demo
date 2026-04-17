"use server";

import { randomUUID } from "node:crypto";

import { isDemoMode } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  ALLOWED_PROOF_MIME,
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

  if (isDemoMode()) {
    console.log("[payments:demo] uploadPaymentProof", {
      orderTokenId,
      mime: file.type,
      size: file.size,
    });
    return { ok: true, data: { path: `demo/${orderTokenId}/proof.png` } };
  }

  try {
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from("order_tokens")
      .select("id, expires_at")
      .eq("id", orderTokenId)
      .maybeSingle();
    if (tokenErr) throw tokenErr;
    if (!tokenRow) return { ok: false, error: "Enlace no encontrado" };

    const row = tokenRow as { id: string; expires_at: string };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false, error: "El enlace expiró" };
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
