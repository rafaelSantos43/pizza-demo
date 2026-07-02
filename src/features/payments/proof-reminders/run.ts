import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
// Twilio mientras Meta Cloud API esté pausado. Cuando vuelva, swap por
// `sendTemplate({ to, templateKey: "proof_reminder" })` de @/features/whatsapp/sender
// (requiere aprobar template `pf_proof_reminder` en Meta primero).
import { sendTwilioText } from "@/features/whatsapp-twilio/sender";

// Mientras Twilio sandbox sea el sender activo, el camino B (cliente
// manda foto por WhatsApp) está bloqueado: createOrder server-side
// fuerza camino A (upload web). En flujo normal este cron NO encuentra
// candidatos. Sigue corriendo por defense-in-depth y para datos legacy.
// Cuando vuelva Meta y se reactive camino B, el copy puede volver a
// "Recuerda enviarme tu comprobante" porque el webhook lo procesará.
const REMINDER_BODY =
  "Tu pedido sigue pendiente del comprobante 📸. Si necesitas ayuda, contacta al restaurante.";

export interface RunProofRemindersResult {
  ok: boolean;
  processed: number;
  errors: number;
}

interface CandidateRow {
  id: string;
  customer: { phone: string | null } | null;
}

export async function runProofReminders(): Promise<RunProofRemindersResult> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("orders")
    .select("id, customer:customers(phone)")
    .eq("status", "awaiting_payment")
    .eq("needs_proof", true)
    .is("proof_reminder_sent_at", null)
    .lt("created_at", fiveMinAgo);

  if (error) {
    console.error("[proof-reminders] candidate query failed", error);
    return { ok: false, processed: 0, errors: 1 };
  }

  const candidates = (rows ?? []) as unknown as CandidateRow[];
  let processed = 0;
  let errors = 0;

  for (const row of candidates) {
    try {
      const phone = row.customer?.phone ?? null;
      if (!phone) {
        console.warn("[proof-reminders] order missing phone, skipping", row.id);
        continue;
      }

      // Marca antes de enviar. La guardia `is null` en el WHERE es la
      // protección contra doble proceso si dos crons corren a la vez:
      // si afecta 0 filas, otro proceso se la llevó.
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("orders")
        .update({ proof_reminder_sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("proof_reminder_sent_at", null)
        .select("id");

      if (updErr) {
        console.error("[proof-reminders] update failed", row.id, updErr);
        errors++;
        continue;
      }

      if (!updated || updated.length === 0) {
        continue;
      }

      // Si el send falla NO revertimos el flag (mismo criterio que F8):
      // evita ráfagas si el sender está intermitente. El cajero ve el
      // pedido en el panel igual.
      const result = await sendTwilioText(phone, REMINDER_BODY);

      if (!result.ok) {
        console.error(
          "[proof-reminders] sendTwilioText failed",
          row.id,
          result.error,
        );
        errors++;
      }

      processed++;
    } catch (err) {
      console.error("[proof-reminders] iteration threw", row.id, err);
      errors++;
    }
  }

  return { ok: true, processed, errors };
}
