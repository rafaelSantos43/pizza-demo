import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { isDemoMode } from "@/lib/demo";
import { getServerEnv } from "@/lib/env";

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  // Demo mode: aceptamos cualquier firma para permitir smoke con curl local
  // sin compartir el app secret real de Meta.
  if (isDemoMode()) return true;

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const provided = signatureHeader.slice("sha256=".length);
  const secret = getServerEnv().WHATSAPP_APP_SECRET;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");

  if (provided.length !== computed.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(computed, "hex"),
    );
  } catch {
    return false;
  }
}
