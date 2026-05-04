"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";

import { ActivateAudioBanner } from "@/components/dashboard/activate-audio-banner";
import { DriverOrderCard } from "@/components/dashboard/driver-order-card";
import { useAudioContext } from "@/components/dashboard/use-audio-context";
import type { StaffRole } from "@/features/auth/queries";
import type { OrderSummary } from "@/features/orders/types";
import { createClient } from "@/lib/supabase/client";
import { attachRealtimeAuthSync } from "@/lib/supabase/realtime-auth";

interface DriverOrdersListProps {
  initial: OrderSummary[];
  viewerRole: StaffRole;
  viewerId: string;
}

// Beep ~350ms a 880Hz. Mismo perfil que el del panel del cajero para que
// el cajero/driver compartan la misma señal sonora si están juntos en el local.
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

export function DriverOrdersList({
  initial,
  viewerRole,
  viewerId,
}: DriverOrdersListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Solo el driver propio recibe alertas sonoras; el admin viendo la
  // flota desde /mensajeros NO oye beeps por cada asignación ajena.
  const isDriver = viewerRole === "driver";
  const { ctxRef: audioCtxRef, isUnlocked: audioUnlocked, unlock: unlockAudio } =
    useAudioContext();

  useEffect(() => {
    const supabase = createClient();
    // Mantiene `realtime.setAuth` sincronizado con la sesión, incluyendo
    // refreshes de token durante turnos largos. Ver L05.
    const authHandle = attachRealtimeAuthSync(supabase);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    function notifyAssigned(orderId: string): void {
      if (audioCtxRef.current) {
        try {
          playBeep(audioCtxRef.current);
        } catch {
          // contexto cerrado o suspendido: ignorar
        }
      }
      toast(
        "🛵 Te asignaron un pedido",
        {
          id: orderId,
          duration: Infinity,
          action: {
            label: "Visto",
            onClick: () => toast.dismiss(orderId),
          },
        },
      );
    }

    (async () => {
      // Esperamos al setAuth inicial: si subscribimos antes, el canal
      // se conecta como `anon`, RLS filtra todos los eventos
      // silenciosamente y la lista no se actualiza en tiempo real.
      await authHandle.ready;
      if (cancelled) return;

      channel = supabase
        .channel("driver-orders-feed")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          (payload) => {
            const row = payload.new as { id: string; driver_id: string | null };
            if (isDriver && row.driver_id === viewerId) {
              notifyAssigned(row.id);
            }
            startTransition(() => router.refresh());
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders" },
          (payload) => {
            const newRow = payload.new as { id: string; driver_id: string | null };
            const oldRow = payload.old as { driver_id: string | null };
            // Solo notificar transición a "asignado a mí" — no en cada
            // update de status del pedido, no si ya estaba mío antes.
            const becameMine =
              newRow.driver_id === viewerId &&
              oldRow.driver_id !== viewerId;
            if (isDriver && becameMine) {
              notifyAssigned(newRow.id);
            }
            startTransition(() => router.refresh());
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "orders" },
          () => {
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
  }, [router, isDriver, viewerId, audioCtxRef]);

  return (
    <>
      {isDriver ? (
        <ActivateAudioBanner
          isUnlocked={audioUnlocked}
          onActivate={unlockAudio}
        />
      ) : null}

      {isPending ? (
        <div className="pointer-events-none fixed top-3 right-3 z-40 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm ring-1 ring-border">
          <Loader2 className="size-3.5 animate-spin" />
          Actualizando…
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        {initial.map((order) => (
          <DriverOrderCard
            key={order.id}
            order={order}
            viewerRole={viewerRole}
          />
        ))}
      </div>
    </>
  );
}
