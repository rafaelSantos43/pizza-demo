import "server-only";

import { getTwilioEnv } from "./env";

interface SendResult {
  ok: boolean;
  error?: string;
  sid?: string;
}

function ensureWhatsAppPrefix(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

export async function sendTwilioText(
  to: string,
  body: string,
): Promise<SendResult> {
  const env = getTwilioEnv();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Messages.json`;

  const form = new URLSearchParams();
  form.set("From", ensureWhatsAppPrefix(env.from));
  form.set("To", ensureWhatsAppPrefix(to));
  form.set("Body", body);

  const basic = Buffer.from(`${env.accountSid}:${env.authToken}`).toString(
    "base64",
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[twilio] sendTwilioText non-2xx", res.status, errBody);
      return { ok: false, error: `HTTP ${res.status}: ${errBody}` };
    }

    const json = (await res.json()) as { sid?: string };
    return { ok: true, sid: json.sid };
  } catch (err) {
    console.error("[twilio] sendTwilioText threw", err);
    return { ok: false, error: (err as Error).message };
  }
}
