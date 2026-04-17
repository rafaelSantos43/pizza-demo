import "server-only";

import { isDemoMode } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplate } from "@/features/whatsapp/sender";

export interface RunDelayAlertsResult {
  ok: boolean;
  processed: number;
  errors: number;
}

interface CandidateRow {
  id: string;
  status: string;
  eta_at: string | null;
  customer_id: string | null;
  customer: { phone: string | null; name: string | null } | null;
}

export async function runDelayAlerts(): Promise<RunDelayAlertsResult> {
  if (isDemoMode()) {
    console.log("[delay-alerts:demo] skip");
    return { ok: true, processed: 0, errors: 0 };
  }

  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, eta_at, customer_id, customer:customers(phone, name)",
    )
    .not("status", "in", "(delivered,cancelled)")
    .is("delay_notified_at", null)
    .not("eta_at", "is", null)
    .lt("eta_at", tenMinAgo);

  if (error) {
    console.error("[delay-alerts] candidate query failed", error);
    return { ok: false, processed: 0, errors: 1 };
  }

  const candidates = (rows ?? []) as unknown as CandidateRow[];
  let processed = 0;
  let errors = 0;

  for (const row of candidates) {
    try {
      const phone = row.customer?.phone ?? null;
      if (!phone) {
        console.warn("[delay-alerts] order missing phone, skipping", row.id);
        continue;
      }

      // El filtro delay_notified_at is null en el UPDATE es la guardia contra
      // doble procesamiento si dos crons corrieran simultáneos. Si afecta 0
      // filas, otro proceso ya se la llevó.
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("orders")
        .update({ delayed: true, delay_notified_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("delay_notified_at", null)
        .select("id");

      if (updErr) {
        console.error("[delay-alerts] update failed", row.id, updErr);
        errors++;
        continue;
      }

      if (!updated || updated.length === 0) {
        continue;
      }

      // El flag delay_notified_at ya cumple la regla "una sola vez por pedido"
      // (PRD §F8). Si el send falla, NO revertimos: reintentos manuales por
      // otro camino. Logear y contar como error del batch.
      const result = await sendTemplate({
        to: phone,
        templateKey: "delay_apology",
      });

      if (!result.ok) {
        console.error("[delay-alerts] sendTemplate failed", row.id, result.error);
        errors++;
      }

      processed++;
    } catch (err) {
      console.error("[delay-alerts] iteration threw", row.id, err);
      errors++;
    }
  }

  return { ok: true, processed, errors };
}
