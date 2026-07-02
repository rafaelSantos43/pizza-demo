import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendCatalogLinkTwilio,
  upsertCustomerByPhone,
} from "@/features/whatsapp-twilio/greet";
import { sendTwilioText } from "@/features/whatsapp-twilio/sender";
import { getTwilioEnv } from "@/features/whatsapp-twilio/env";
import { verifyTwilioSignature } from "@/features/whatsapp-twilio/verify-signature";
import { signToken } from "@/features/order-tokens/sign";
import { getClientEnv } from "@/lib/env";
import { detectIntent } from "@/features/whatsapp/intents";

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const MENU_ALREADY_SENT_MESSAGE =
  "Ya te envi\u00e9 el men\u00fa hace unos minutos. Ese enlace sigue siendo v\u00e1lido.";
const COURTESY_MESSAGE =
  "\u00a1Con gusto! Si deseas ver nuevamente el men\u00fa escribe MEN\u00da \u{1f355}";

function twiml200(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

async function markSeen(messageSid: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages_seen")
    .upsert(
      { wa_message_id: messageSid },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    )
    .select("wa_message_id");
  if (error) {
    console.error("[twilio] markSeen failed", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function hasRecentUsableMenuToken(customerId: string): Promise<boolean> {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 120 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("order_tokens")
    .select("id")
    .eq("customer_id", customerId)
    .is("used_at", null)
    .gt("expires_at", now.toISOString())
    .gte("created_at", twoHoursAgo)
    .limit(1);
  if (error) {
    console.error("[twilio] recent token lookup failed", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function hasExistingCustomer(phone: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (error) {
    console.error("[twilio] customer existence lookup failed", error);
    return false;
  }
  return Boolean(data);
}

async function sendMenuLinkIfNeeded(
  phone: string,
  profileName?: string,
): Promise<void> {
  const upsert = await upsertCustomerByPhone(phone, profileName);
  if (!upsert.ok) {
    console.error("[twilio] upsert failed", upsert.error);
    return;
  }
  if (await hasRecentUsableMenuToken(upsert.customerId)) {
    await sendTwilioText(phone, MENU_ALREADY_SENT_MESSAGE);
    return;
  }
  const { token } = await signToken(upsert.customerId);
  const link = `${getClientEnv().NEXT_PUBLIC_APP_URL}/pedir/${token}`;
  await sendCatalogLinkTwilio(phone, upsert.name, link);
}

function buildFullUrl(req: Request): string {
  const override = getTwilioEnv().webhookUrlOverride;
  if (override) return override;

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    new URL(req.url).host;
  const path = new URL(req.url).pathname;
  return `${proto}://${host}${path}`;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-twilio-signature");

  const params = Object.fromEntries(new URLSearchParams(raw));
  const fullUrl = buildFullUrl(req);

  if (!verifyTwilioSignature(fullUrl, params, signature)) {
    console.error("[twilio] invalid signature", {
      fullUrl,
      hasSignature: Boolean(signature),
    });
    return new Response("Unauthorized", { status: 401 });
  }

  const from = params.From;
  const messageSid = params.MessageSid;
  if (!from || !messageSid) {
    return twiml200();
  }

  const phone = from.replace(/^whatsapp:/, "");
  const profileName = params.ProfileName?.trim() || undefined;

  const fresh = await markSeen(messageSid);
  if (!fresh) {
    console.log("[twilio] duplicate message, skipping", messageSid);
    return twiml200();
  }

  try {
    const intent = detectIntent(params.Body ?? "");
    if (intent === "greet") {
      await sendMenuLinkIfNeeded(phone, profileName);
    } else if (await hasExistingCustomer(phone)) {
      await sendTwilioText(phone, COURTESY_MESSAGE);
    } else {
      await sendMenuLinkIfNeeded(phone, profileName);
    }
  } catch (err) {
    console.error("[twilio] message handling threw", err);
  }

  return twiml200();
}
