import "server-only";

import { getServerEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/features/orders/types";

import { TEMPLATES, templateForStatus, type TemplateKey } from "./templates";

interface SendResult {
  ok: boolean;
  error?: string;
}

function normalizePhone(phoneE164: string): string {
  return phoneE164.startsWith("+") ? phoneE164.slice(1) : phoneE164;
}

function graphMessagesUrl(): string {
  const env = getServerEnv();
  return `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

export async function sendTemplate(input: {
  to: string;
  templateKey: TemplateKey;
  params?: string[];
}): Promise<SendResult> {
  const { to, templateKey, params = [] } = input;

  const spec = TEMPLATES[templateKey];
  if (params.length !== spec.bodyParams) {
    return {
      ok: false,
      error: `Template ${spec.name} expects ${spec.bodyParams} params, got ${params.length}`,
    };
  }

  const env = getServerEnv();
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "template",
    template: {
      name: spec.name,
      language: { code: spec.language },
    },
  };

  if (spec.bodyParams > 0) {
    (body.template as Record<string, unknown>).components = [
      {
        type: "body",
        parameters: params.map((text) => ({ type: "text", text })),
      },
    ];
  }

  try {
    const res = await fetch(graphMessagesUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[whatsapp] sendTemplate non-2xx", res.status, errBody);
      return { ok: false, error: `HTTP ${res.status}: ${errBody}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[whatsapp] sendTemplate threw", err);
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendTextMessage(
  to: string,
  body: string,
): Promise<SendResult> {
  const env = getServerEnv();
  const payload = {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "text",
    text: { body },
  };

  try {
    const res = await fetch(graphMessagesUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("[whatsapp] sendTextMessage non-2xx", res.status, errBody);
      return { ok: false, error: `HTTP ${res.status}: ${errBody}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[whatsapp] sendTextMessage threw", err);
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendOrderStatusTemplate(
  orderId: string,
  toStatus: OrderStatus,
): Promise<SendResult> {
  const templateKey = templateForStatus(toStatus);
  if (!templateKey) return { ok: true };

  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("customer:customers(phone, name)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;

    const row = data as unknown as {
      customer: { phone: string; name: string | null } | null;
    } | null;
    const phone = row?.customer?.phone;
    if (!phone) return { ok: false, error: "no phone for order" };

    return await sendTemplate({ to: phone, templateKey });
  } catch (err) {
    console.error("[whatsapp] sendOrderStatusTemplate failed", err);
    return { ok: false, error: (err as Error).message };
  }
}
