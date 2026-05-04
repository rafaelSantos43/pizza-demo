"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { DriverOrderCard } from "@/components/dashboard/driver-order-card";
import type { StaffRole } from "@/features/auth/queries";
import type { OrderSummary } from "@/features/orders/types";
import { createClient } from "@/lib/supabase/client";
import { attachRealtimeAuthSync } from "@/lib/supabase/realtime-auth";

interface DriverOrdersListProps {
  initial: OrderSummary[];
  viewerRole: StaffRole;
  viewerId: string;
}

export function DriverOrdersList({
  initial,
  viewerRole,
}: DriverOrdersListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
      // silenciosamente y la lista no se actualiza en tiempo real.
      await authHandle.ready;
      if (cancelled) return;

      channel = supabase
        .channel("driver-orders-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          () => {
            startTransition(() => {
              router.refresh();
            });
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
