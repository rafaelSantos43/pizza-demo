import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/features/orders/types";

// ⚠️ Punto de aislamiento: este es el ÚNICO archivo del proyecto que
// importa el sender de Twilio para notificaciones al cliente. Cuando
// Meta Cloud API vuelva (o cuando se compre un número Twilio dedicado),
// reemplaza este archivo con llamadas a `sendOrderStatusTemplate` de
// `@/features/whatsapp/sender` y borra `src/features/whatsapp-twilio/`
// completo. El resto del código (transitionOrder, delay-alerts) no
// cambia: importa de aquí.
import { sendTwilioText } from "@/features/whatsapp-twilio/sender";

interface SendResult {
  ok: boolean;
  error?: string;
}

// Textos en español neutral; replican lo que el PRD §F6 espera ver al
// cliente. Los emojis siguen el estilo del greet inicial.
const STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
  payment_approved: "Pago aprobado ✅ Arrancamos tu pedido 🍕",
  preparing: "Tu pedido está en preparación 🍕",
  ready: "Tu pedido está listo, sale en minutos 🛵",
  on_the_way: "Tu pedido está en camino 🚗",
  delivered: "Entregado ✅ ¡Gracias por preferirnos!",
  payment_rejected:
    "No pudimos validar tu comprobante 🙏 ¿Podrías enviarnos uno nuevo? Puedes responder a este chat con la foto o usar el link del pedido.",
};

const DELAY_APOLOGY_MESSAGE =
  "Disculpa la demora 🙏 Tu pedido está tomando un poco más, ya va saliendo.";

async function getOrderPhone(orderId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("customer:customers(phone)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[notifications] phone lookup failed", error);
    return null;
  }
  const row = data as unknown as {
    customer: { phone: string | null } | null;
  } | null;
  return row?.customer?.phone ?? null;
}

export async function sendOrderUpdate(
  orderId: string,
  toStatus: OrderStatus,
): Promise<SendResult> {
  const message = STATUS_MESSAGES[toStatus];
  // Estado sin notificación mapeada (new, awaiting_payment, cancelled).
  // No es error — ese flujo no debe avisar al cliente.
  if (!message) return { ok: true };

  const phone = await getOrderPhone(orderId);
  if (!phone) return { ok: false, error: "no phone for order" };

  return await sendTwilioText(phone, message);
}

export async function sendOrderDelayApology(
  orderId: string,
): Promise<SendResult> {
  const phone = await getOrderPhone(orderId);
  if (!phone) return { ok: false, error: "no phone for order" };
  return await sendTwilioText(phone, DELAY_APOLOGY_MESSAGE);
}
