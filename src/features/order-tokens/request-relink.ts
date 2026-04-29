"use server";

import { z } from "zod";

import { isDemoMode } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { relinkCustomerTwilio } from "@/features/whatsapp-twilio/greet";

import { getCustomerIdFromExpiredToken } from "./verify";

const RATE_LIMIT_PER_HOUR = 3;

const inputSchema = z.object({
  token: z.string().min(1),
});

type RelinkError =
  | "invalid_token"
  | "still_valid"
  | "rate_limited"
  | "send_failed";

export async function requestNewLinkByToken(input: {
  token: string;
}): Promise<{ ok: true } | { ok: false; error: RelinkError }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_token" };

  const resolved = await getCustomerIdFromExpiredToken(parsed.data.token);
  if (!resolved.ok) {
    if (resolved.reason === "still_valid") {
      return { ok: false, error: "still_valid" };
    }
    return { ok: false, error: "invalid_token" };
  }

  if (!isDemoMode()) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await supabaseAdmin
      .from("order_tokens")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", resolved.customerId)
      .gte("created_at", oneHourAgo);

    if (countErr) {
      console.error("[relink] rate-limit query failed", countErr);
      return { ok: false, error: "send_failed" };
    }

    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return { ok: false, error: "rate_limited" };
    }
  }

  const sent = await relinkCustomerTwilio(resolved.customerId);
  if (!sent.ok) return { ok: false, error: "send_failed" };

  return { ok: true };
}
