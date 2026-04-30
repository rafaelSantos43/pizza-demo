import "server-only";

import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/features/orders/types";

import { downloadMedia } from "./download-media";
import { greetCustomerByPhone } from "./greet";
import { detectIntent } from "./intents";
import {
  webhookPayloadSchema,
  type IncomingMessage,
} from "./parse-payload";
import { sendTemplate, sendTextMessage } from "./sender";

interface HandleResult {
  ok: boolean;
  processed: number;
  skipped: number;
}

const STATUS_LABEL_ES: Record<OrderStatus, string> = {
  new: "registrándose",
  awaiting_payment: "esperando confirmación de pago",
  payment_approved: "con pago aprobado",
  payment_rejected: "con el comprobante rechazado",
  preparing: "en preparación",
  ready: "listo para salir",
  on_the_way: "en camino",
  delivered: "entregado",
  cancelled: "cancelado",
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function extFromMime(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? "bin";
}

function minutesUntil(etaIso: string | null): number | null {
  if (!etaIso) return null;
  const diffMs = new Date(etaIso).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return null;
  return Math.max(0, Math.round(diffMs / 60_000));
}

async function markSeen(waMessageId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages_seen")
    .upsert(
      { wa_message_id: waMessageId },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    )
    .select("wa_message_id");
  if (error) {
    console.error("[whatsapp] markSeen failed", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function getOrCreateCustomerId(phone: string): Promise<string | null> {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (selErr) {
    console.error("[whatsapp] customer select failed", selErr);
    return null;
  }
  if (existing) return (existing as { id: string }).id;

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("customers")
    .insert({ phone })
    .select("id")
    .single();
  if (insErr) {
    console.error("[whatsapp] customer insert failed", insErr);
    return null;
  }
  return (inserted as { id: string }).id;
}

async function handleTextMessage(
  phone: string,
  body: string,
): Promise<void> {
  const intent = detectIntent(body);

  if (intent === "status_inquiry") {
    const customerId = await getOrCreateCustomerId(phone);
    if (!customerId) {
      await greetCustomerByPhone(phone);
      return;
    }
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, eta_at")
      .eq("customer_id", customerId)
      .not("status", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[whatsapp] active order lookup failed", error);
      await greetCustomerByPhone(phone);
      return;
    }
    if (!data) {
      await greetCustomerByPhone(phone);
      return;
    }
    const row = data as { status: OrderStatus; eta_at: string | null };
    const label = STATUS_LABEL_ES[row.status] ?? row.status;
    const min = minutesUntil(row.eta_at);
    const eta = min !== null ? `Llega en ~${min} min ` : "";
    await sendTextMessage(phone, `Tu pedido está ${label}. ${eta}🍕`.trim());
    return;
  }

  // greet o unknown → mandamos el link al catálogo
  await greetCustomerByPhone(phone);
}

async function handleImageMessage(
  phone: string,
  mediaId: string,
): Promise<void> {
  const customerId = await getOrCreateCustomerId(phone);
  if (!customerId) return;

  const { data: orderRow, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id, status")
    .eq("customer_id", customerId)
    .eq("needs_proof", true)
    .eq("status", "awaiting_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderErr) {
    console.error("[whatsapp] order lookup for image failed", orderErr);
    return;
  }
  if (!orderRow) {
    await sendTextMessage(
      phone,
      "Recibimos tu imagen pero no encontramos un pedido pendiente. Si quieres pedir, escríbenos.",
    );
    return;
  }
  const order = orderRow as { id: string; status: OrderStatus };

  const media = await downloadMedia(mediaId);
  if (!media) {
    await sendTextMessage(
      phone,
      "No pudimos descargar tu comprobante. Reenvíalo por favor.",
    );
    return;
  }

  const ext = extFromMime(media.mimeType);
  const path = `orders/${order.id}/${randomUUID()}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from("payment-proofs")
    .upload(path, media.bytes, {
      contentType: media.mimeType,
      cacheControl: "3600",
    });
  if (upErr) {
    console.error("[whatsapp] storage upload failed", upErr);
    await sendTextMessage(
      phone,
      "Tuvimos un problema guardando tu comprobante. Reenvíalo por favor.",
    );
    return;
  }

  const { error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      payment_proof_url: path,
      needs_proof: false,
      payment_proof_source: "whatsapp",
    })
    .eq("id", order.id);
  if (updErr) {
    console.error("[whatsapp] order update failed", updErr);
    return;
  }

  // Registramos la asociación como evento (from = to = status actual,
  // actor null = sistema). Útil para auditoría del Camino B del PRD §F9.
  await supabaseAdmin.from("order_status_events").insert({
    order_id: order.id,
    from_status: order.status,
    to_status: order.status,
    actor_id: null,
  });

  await sendTemplate({
    to: phone,
    templateKey: "payment_received",
  });
}

export async function handleIncomingPayload(
  payload: unknown,
): Promise<HandleResult> {
  const parsed = webhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("[whatsapp] payload parse failed", parsed.error.issues);
    return { ok: true, processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const messages: IncomingMessage[] = change.value.messages ?? [];
      for (const msg of messages) {
        try {
          const phone = `+${msg.from}`;
          const fresh = await markSeen(msg.id);
          if (!fresh) {
            skipped++;
            continue;
          }

          if (msg.type === "text" && "text" in msg) {
            await handleTextMessage(phone, msg.text.body);
          } else if (msg.type === "image" && "image" in msg) {
            await handleImageMessage(phone, msg.image.id);
          } else {
            // PRD §F1: audio/foto/raro → bot envía link igual.
            console.log(
              "[whatsapp] unsupported message type, sending greet",
              msg.type,
            );
            await greetCustomerByPhone(phone);
          }
          processed++;
        } catch (err) {
          console.error("[whatsapp] message handler threw", err);
        }
      }
    }
  }

  return { ok: true, processed, skipped };
}
