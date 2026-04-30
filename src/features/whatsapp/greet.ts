import "server-only";

import { getClientEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signToken } from "@/features/order-tokens/sign";

import { sendTemplate } from "./sender";

interface GreetResult {
  ok: boolean;
  tokenIssued?: boolean;
  error?: string;
}

export async function greetCustomerByPhone(
  phoneE164: string,
  customerName?: string,
): Promise<GreetResult> {
  try {
    const upsertPayload: { phone: string; name?: string } = {
      phone: phoneE164,
    };
    if (customerName) upsertPayload.name = customerName;

    const { data: existing, error: selectErr } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("phone", phoneE164)
      .maybeSingle();
    if (selectErr) throw selectErr;

    let customerId: string;
    let resolvedName: string | null = null;

    if (existing) {
      const row = existing as { id: string; name: string | null };
      customerId = row.id;
      resolvedName = row.name;
      // Solo seteamos name si no había uno (no sobreescribir lo registrado).
      if (!row.name && customerName) {
        const { error: updErr } = await supabaseAdmin
          .from("customers")
          .update({ name: customerName })
          .eq("id", customerId);
        if (updErr) throw updErr;
        resolvedName = customerName;
      }
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("customers")
        .insert(upsertPayload)
        .select("id, name")
        .single();
      if (insertErr) throw insertErr;
      const row = inserted as { id: string; name: string | null };
      customerId = row.id;
      resolvedName = row.name;
    }

    const { token } = await signToken(customerId);
    const link = `${getClientEnv().NEXT_PUBLIC_APP_URL}/pedir/${token}`;

    const result = await sendTemplate({
      to: phoneE164,
      templateKey: "greet",
      params: [customerName ?? resolvedName ?? "amigo", link],
    });

    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, tokenIssued: true };
  } catch (err) {
    console.error("[whatsapp] greetCustomerByPhone failed", err);
    return { ok: false, error: (err as Error).message };
  }
}
