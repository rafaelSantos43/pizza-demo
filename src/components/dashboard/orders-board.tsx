"use client";

import { Inbox, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ActivateAudioBanner } from "@/components/dashboard/activate-audio-banner";
import { OrderCard } from "@/components/dashboard/order-card";
import { OrderDetailSheet } from "@/components/dashboard/order-detail";
import { useAudioContext } from "@/components/dashboard/use-audio-context";
import { useReplayPendingOrderToasts } from "@/components/dashboard/use-replay-pending-toasts";
import type { ActiveDriver, CurrentStaff } from "@/features/auth/queries";
import type { OrderSummary } from "@/features/orders/types";
import { createClient } from "@/lib/supabase/client";
import { attachRealtimeAuthSync } from "@/lib/supabase/realtime-auth";

const ALERTING_STATUSES = new Set(["new", "awaiting_payment"]);

function formatCOP(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// U05: hora del pedido para que el cajero distinga 2 pedidos del mismo
// monto que llegan juntos. Mismo formato que `OrderCard` pero en 12h
// (estilo conversacional, igual que las notificaciones al cliente).
const hourFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/Bogota",
});

function formatHour(iso: string): string {
  try {
    return hourFormatter.format(new Date(iso));
  } catch {
    return "";
  }
}

// Beep generado con Web Audio API: ~350ms a 880Hz con envelope para no asustar.
// Sin archivos en /public; falla silenciosa si el browser bloquea el contexto.
//
// resume() defensivo: si el ctx vino de localStorage o estuvo dormido tras
// inactividad larga, queda en estado `suspended` y `osc.start()` corre sin
// emitir audio. El resume() es no-bloqueante; en el caso normal (state=running)
// es no-op y el sonido se reproduce inmediatamente.
function playBeep(ctx: AudioContext): void {
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t0 = ctx.currentTime;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
  osc.start(t0);
  osc.stop(t0 + 0.36);
}

interface OrdersBoardProps {
  initial: OrderSummary[];
  staff: CurrentStaff;
  drivers: ActiveDriver[];
}

export function OrdersBoard({ initial, staff, drivers }: OrdersBoardProps) {
  const router = useRouter();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // U03: AudioContext lazy + banner explícito si el cajero no toca nada.
  const { ctxRef: audioCtxRef, isUnlocked: audioUnlocked, unlock: unlockAudio } =
    useAudioContext();

  // U02: replay de toasts pendientes (encapsulado en su propio hook).
  useReplayPendingOrderToasts(initial);

  useEffect(() => {
    const supabase = createClient();
    // Mantiene `realtime.setAuth` sincronizado con la sesión, incluyendo
    // refreshes de token durante turnos largos. Ver L05.
    const authHandle = attachRealtimeAuthSync(supabase);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Esperamos al setAuth inicial: si subscribimos antes, el canal
      // se conecta como `anon`, RLS filtra todos los eventos
      // silenciosamente y el panel parece no tener Realtime.
      await authHandle.ready;
      if (cancelled) return;

      channel = supabase
        .channel("orders-feed")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          (payload) => {
            const row = payload.new as {
              id: string;
              status: string;
              total_cents: number;
              created_at: string;
              payment_method: string;
            };
            // Cualquier INSERT en `orders` es un pedido nuevo del cliente.
            // Cash entra directo a `preparing`; transferencia/Nequi/Llave
            // a `awaiting_payment`. El cajero necesita oír el beep en
            // ambos casos. ALERTING_STATUSES sigue rigiendo el dismissal
            // del toast en el handler de UPDATE.
            if (audioCtxRef.current) {
              try {
                playBeep(audioCtxRef.current);
              } catch {
                // contexto cerrado o suspendido: ignorar
              }
            }
            const hour = formatHour(row.created_at);
            const hourTag = hour ? ` · ${hour}` : "";
            const actionTag =
              row.payment_method === "cash" ? "Efectivo" : "Validar pago";
            toast(
              `🍕 Pedido nuevo · ${formatCOP(row.total_cents)}${hourTag} · ${actionTag}`,
              {
                id: row.id,
                duration: Infinity,
                action: {
                  label: "Visto",
                  onClick: () => toast.dismiss(row.id),
                },
              },
            );
            startTransition(() => router.refresh());
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders" },
          (payload) => {
            const row = payload.new as { id: string; status: string };
            // Si el cajero ya avanzó el pedido, descartamos la alerta sola.
            if (!ALERTING_STATUSES.has(row.status)) {
              toast.dismiss(row.id);
            }
            startTransition(() => router.refresh());
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "orders" },
          (payload) => {
            const row = payload.old as { id: string };
            toast.dismiss(row.id);
            startTransition(() => router.refresh());
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      authHandle.detach();
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <>
      <ActivateAudioBanner
        isUnlocked={audioUnlocked}
        onActivate={unlockAudio}
      />

      {isPending ? (
        <div className="pointer-events-none fixed top-3 right-3 z-40 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm ring-1 ring-border">
          <Loader2 className="size-3.5 animate-spin" />
          Actualizando…
        </div>
      ) : null}

      {initial.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
          <Inbox className="size-10 text-muted-foreground" />
          <p className="font-serif text-xl text-foreground">
            No hay pedidos activos
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Cuando llegue uno nuevo aparecerá aquí automáticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {initial.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onSelect={setSelectedOrderId}
            />
          ))}
        </div>
      )}

      <OrderDetailSheet
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        staff={staff}
        drivers={drivers}
      />
    </>
  );
}
