import "server-only";

import { getClientEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signToken } from "@/features/order-tokens/sign";

import { sendTwilioText } from "./sender";

interface GreetResult {
  ok: boolean;
  tokenIssued?: boolean;
  error?: string;
}

// Versión Twilio del greet. Reusa la misma lógica de upsert de customer y
// firma de token que el greet de Meta, pero envía texto plano (el sandbox
// de Twilio no requiere plantillas aprobadas).
export async function greetCustomerByPhoneTwilio(
  phoneE164: string,
  customerName?: string,
): Promise<GreetResult> {
  try {
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
      if (!row.name && customerName) {
        const { error: updErr } = await supabaseAdmin
          .from("customers")
          .update({ name: customerName })
          .eq("id", customerId);
        if (updErr) throw updErr;
        resolvedName = customerName;
      }
    } else {
      const insertPayload: { phone: string; name?: string } = {
        phone: phoneE164,
      };
      if (customerName) insertPayload.name = customerName;

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("customers")
        .insert(insertPayload)
        .select("id, name")
        .single();
      if (insertErr) throw insertErr;
      const row = inserted as { id: string; name: string | null };
      customerId = row.id;
      resolvedName = row.name;
    }

    const { token } = await signToken(customerId);
    const link = `${getClientEnv().NEXT_PUBLIC_APP_URL}/pedir/${token}`;
    const name = resolvedName ?? customerName ?? "amigo";

    const body =
      `¡Hola ${name}! 🍕 Aquí está nuestro menú:\n${link}\n\n` +
      `El link es solo para ti y expira en 2 horas.\n\n` +
      `Si la página no carga, copia el link y ábrelo en tu navegador (Safari o Chrome).`;

    const result = await sendTwilioText(phoneE164, body);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, tokenIssued: true };
  } catch (err) {
    console.error("[twilio] greetCustomerByPhoneTwilio failed", err);
    return { ok: false, error: (err as Error).message };
  }
}

// Variante por customerId: lee phone/name del customer y reusa el greet
// existente. Para el flujo de "pedir nuevo link" desde un token expirado.
export async function relinkCustomerTwilio(
  customerId: string,
): Promise<GreetResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("phone, name")
      .eq("id", customerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "customer_not_found" };

    const row = data as { phone: string; name: string | null };
    return await greetCustomerByPhoneTwilio(row.phone, row.name ?? undefined);
  } catch (err) {
    console.error("[twilio] relinkCustomerTwilio failed", err);
    return { ok: false, error: (err as Error).message };
  }
}
