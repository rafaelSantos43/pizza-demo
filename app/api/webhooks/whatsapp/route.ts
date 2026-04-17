import { isDemoMode } from "@/lib/demo";
import { getServerEnv } from "@/lib/env";
import { handleIncomingPayload } from "@/features/whatsapp/handle-incoming";
import { verifyMetaSignature } from "@/features/whatsapp/verify-signature";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  if (mode !== "subscribe") {
    return new Response("Forbidden", { status: 403 });
  }

  if (isDemoMode()) {
    return new Response(challenge, { status: 200 });
  }

  const expected = getServerEnv().WHATSAPP_VERIFY_TOKEN;
  if (token !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

export async function POST(req: Request) {
  // Body raw como string es necesario para verificar HMAC byte a byte
  // antes de parsear JSON.
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(raw, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error("[whatsapp] invalid JSON in webhook", err);
    // Meta reintenta agresivo si recibe ≠2xx → siempre devolvemos 200.
    return Response.json({ ok: true });
  }

  try {
    await handleIncomingPayload(payload);
  } catch (err) {
    console.error("[whatsapp] handleIncomingPayload threw", err);
  }

  return Response.json({ ok: true });
}
