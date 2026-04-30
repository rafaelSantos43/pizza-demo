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

// La hora del pedido se inyecta en cada mensaje para que un cliente con
// VARIOS pedidos activos pueda distinguir cuál está siendo notificado
// ("tu pedido de las 7:50 PM está listo"). PRD §F6 no lo especifica
// pero es lo natural para que las notificaciones no se confundan.
const hourFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/Bogota",
});

function formatOrderHour(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return hourFormatter.format(new Date(iso));
  } catch {
    return null;
  }
}

// Mensajes en español neutral; replican lo que el PRD §F6 espera ver al
// cliente. La hora se inserta dinámicamente arriba.
function messageForStatus(
  toStatus: OrderStatus,
  hour: string | null,
): string | null {
  const tag = hour ? ` de las ${hour}` : "";
  switch (toStatus) {
    case "payment_approved":
      return `Pago aprobado ✅ Arrancamos tu pedido${tag} 🍕`;
    case "preparing":
      return `Tu pedido${tag} está en preparación 🍕`;
    case "ready":
      return `Tu pedido${tag} está listo, sale en minutos 🛵`;
    case "on_the_way":
      return `Tu pedido${tag} está en camino 🚗`;
    case "delivered":
      return `Tu pedido${tag} fue entregado ✅ ¡Gracias por preferirnos!`;
    case "payment_rejected":
      return (
        `No pudimos validar el comprobante de tu pedido${tag} 🙏 ` +
        `¿Podrías enviarnos uno nuevo? Responde a este chat con la foto.`
      );
    default:
      // Estados sin notificación al cliente (new, awaiting_payment, cancelled).
      return null;
  }
}

interface OrderRow {
  created_at: string | null;
  customer: { phone: string | null } | null;
}

async function getOrderForNotification(
  orderId: string,
): Promise<OrderRow | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("created_at, customer:customers(phone)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[notifications] order lookup failed", error);
    return null;
  }
  return (data as unknown as OrderRow | null) ?? null;
}

export async function sendOrderUpdate(
  orderId: string,
  toStatus: OrderStatus,
): Promise<SendResult> {
  const order = await getOrderForNotification(orderId);
  if (!order) return { ok: false, error: "order not found" };

  const phone = order.customer?.phone ?? null;
  if (!phone) return { ok: false, error: "no phone for order" };

  const hour = formatOrderHour(order.created_at);
  const message = messageForStatus(toStatus, hour);
  // Estado sin notificación mapeada — no es error, ese flujo no avisa.
  if (!message) return { ok: true };

  return await sendTwilioText(phone, message);
}

export async function sendOrderDelayApology(
  orderId: string,
): Promise<SendResult> {
  const order = await getOrderForNotification(orderId);
  if (!order) return { ok: false, error: "order not found" };

  const phone = order.customer?.phone ?? null;
  if (!phone) return { ok: false, error: "no phone for order" };

  const hour = formatOrderHour(order.created_at);
  const tag = hour ? ` de las ${hour}` : "";
  const message =
    `Disculpa la demora con tu pedido${tag} 🙏 ` +
    `Está tomando un poco más, ya va saliendo.`;

  return await sendTwilioText(phone, message);
}
