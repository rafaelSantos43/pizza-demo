import "server-only";

// Aislado del schema central (src/lib/env.ts) a propósito: este módulo
// es de prueba y debe poder eliminarse borrando la carpeta entera.

interface TwilioEnv {
  accountSid: string;
  authToken: string;
  from: string;
  webhookUrlOverride?: string;
}

let cache: TwilioEnv | null = null;

export function getTwilioEnv(): TwilioEnv {
  if (cache) return cache;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const webhookUrlOverride = process.env.TWILIO_WEBHOOK_URL_OVERRIDE;

  const missing: string[] = [];
  if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!from) missing.push("TWILIO_WHATSAPP_FROM");

  if (missing.length > 0) {
    throw new Error(
      `[twilio] missing env vars: ${missing.join(", ")}. ` +
        `Set them in .env.local. See src/features/whatsapp-twilio/README.`,
    );
  }

  cache = {
    accountSid: accountSid as string,
    authToken: authToken as string,
    from: from as string,
    webhookUrlOverride,
  };
  return cache;
}
