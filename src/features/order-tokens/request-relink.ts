"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendCatalogLinkTwilio } from "@/features/whatsapp-twilio/greet";
import { getClientEnv } from "@/lib/env";

import { getCustomerIdFromExpiredToken } from "./verify";
import { signToken } from "./sign";

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

  const { data: customer, error: custErr } = await supabaseAdmin
    .from("customers")
    .select("phone, name")
    .eq("id", resolved.customerId)
    .maybeSingle();

  if (custErr || !customer) {
    console.error("[relink] customer lookup failed", custErr);
    return { ok: false, error: "send_failed" };
  }
  const customerRow = customer as { phone: string; name: string | null };

  const { token } = await signToken(resolved.customerId);
  const link = `${getClientEnv().NEXT_PUBLIC_APP_URL}/pedir/${token}`;

  const sent = await sendCatalogLinkTwilio(
    customerRow.phone,
    customerRow.name,
    link,
  );
  if (!sent.ok) return { ok: false, error: "send_failed" };

  return { ok: true };
}
