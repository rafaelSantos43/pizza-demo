import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

import { sendTemplate } from "./sender";

interface SendResult {
  ok: boolean;
  error?: string;
}

type UpsertCustomerResult =
  | { ok: true; customerId: string; name: string | null }
  | { ok: false; error: string };

export async function upsertCustomerByPhoneMeta(
  phoneE164: string,
  customerName?: string,
): Promise<UpsertCustomerResult> {
  try {
    const { data: existing, error: selectErr } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("phone", phoneE164)
      .maybeSingle();
    if (selectErr) throw selectErr;

    if (existing) {
      const row = existing as { id: string; name: string | null };
      let resolvedName = row.name;
      // Solo seteamos name si no había uno (no sobreescribir lo registrado).
      if (!row.name && customerName) {
        const { error: updErr } = await supabaseAdmin
          .from("customers")
          .update({ name: customerName })
          .eq("id", row.id);
        if (updErr) throw updErr;
        resolvedName = customerName;
      }
      return { ok: true, customerId: row.id, name: resolvedName };
    }

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
    return { ok: true, customerId: row.id, name: row.name };
  } catch (err) {
    console.error("[whatsapp] upsertCustomerByPhoneMeta failed", err);
    return { ok: false, error: (err as Error).message };
  }
}

// Sender puro: el caller construye el link (firma token + arma URL) y lo
// pasa ya listo. Mantener este módulo sin importar `order-tokens` separa
// transporte de dominio (mismo patrón que `whatsapp-twilio/greet.ts`).
export async function sendCatalogLinkMeta(
  phoneE164: string,
  name: string | null,
  link: string,
): Promise<SendResult> {
  const result = await sendTemplate({
    to: phoneE164,
    templateKey: "greet",
    params: [name ?? "amigo", link],
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
