import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env";

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
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
