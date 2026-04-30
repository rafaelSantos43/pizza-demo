"use client";

import { Inbox, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { OrderCard } from "@/components/dashboard/order-card";
import { OrderDetailSheet } from "@/components/dashboard/order-detail";
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

// Beep generado con Web Audio API: ~350ms a 880Hz con envelope para no asustar.
// Sin archivos en /public; falla silenciosa si el browser bloquea el contexto.
function playBeep(ctx: AudioContext): void {
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
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Autoplay policy: el AudioContext se debe crear/usar dentro del primer
  // gesto del usuario. Lo inicializamos al primer pointerdown/keydown.
  useEffect(() => {
    function unlock(): void {
      if (audioCtxRef.current) return;
      try {
        audioCtxRef.current = new AudioContext();
      } catch {
        audioCtxRef.current = null;
      }
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    // Mantiene `realtime.setAuth` sincronizado con la sesión, incluyendo
    // refreshes de token durante turnos largos. Ver L05.
    const detachAuthSync = attachRealtimeAuthSync(supabase);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Pequeño microtask para garantizar que el setAuth inicial del
      // helper se haya enviado antes de subscribirse al canal.
      await Promise.resolve();
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
            };
            if (ALERTING_STATUSES.has(row.status)) {
              if (audioCtxRef.current) {
                try {
                  playBeep(audioCtxRef.current);
                } catch {
                  // contexto cerrado o suspendido: ignorar
                }
              }
              toast(`🍕 ¡Pedido nuevo! ${formatCOP(row.total_cents)}`, {
                id: row.id,
                duration: Infinity,
                action: {
                  label: "Visto",
                  onClick: () => toast.dismiss(row.id),
                },
              });
            }
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
      detachAuthSync();
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  if (initial.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
        <Inbox className="size-10 text-muted-foreground" />
        <p className="font-serif text-xl text-foreground">
          No hay pedidos activos
        </p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Cuando llegue uno nuevo aparecerá aquí automáticamente.
        </p>
      </div>
    );
  }

  return (
    <>
      {isPending ? (
        <div className="pointer-events-none fixed top-3 right-3 z-40 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm ring-1 ring-border">
          <Loader2 className="size-3.5 animate-spin" />
          Actualizando…
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {initial.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onSelect={setSelectedOrderId}
          />
        ))}
      </div>

      <OrderDetailSheet
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        staff={staff}
        drivers={drivers}
      />
    </>
  );
}
