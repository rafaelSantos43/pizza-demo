import { supabaseAdmin } from "@/lib/supabase/admin";
import { greetCustomerByPhoneTwilio } from "@/features/whatsapp-twilio/greet";
import { getTwilioEnv } from "@/features/whatsapp-twilio/env";
import { verifyTwilioSignature } from "@/features/whatsapp-twilio/verify-signature";

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml200(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

// Reusa la tabla de dedupe de Meta. Los SIDs de Twilio (SMxxx / MMxxx)
// no chocan con los IDs de Meta (wamid.xxx), así que comparten tabla sin riesgo.
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

function buildFullUrl(req: Request): string {
  // Detrás de ngrok / proxy, req.url puede ser localhost. Twilio firma con
  // la URL pública configurada en el sandbox. Permitimos override explícito
  // y si no lo hay reconstruimos desde X-Forwarded-*.
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
    // MVP de prueba: cualquier mensaje entrante → saludo + link al catálogo.
    // Si quieres replicar también el intent "¿ya viene?", se hace en otro paso.
    await greetCustomerByPhoneTwilio(phone, profileName);
  } catch (err) {
    console.error("[twilio] greet threw", err);
  }

  return twiml200();
}
