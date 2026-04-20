"use client";

import { Inbox, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { OrderCard } from "@/components/dashboard/order-card";
import { OrderDetailSheet } from "@/components/dashboard/order-detail";
import type { ActiveDriver, CurrentStaff } from "@/features/auth/queries";
import type { OrderSummary } from "@/features/orders/types";
import { createClient } from "@/lib/supabase/client";

interface OrdersBoardProps {
  initial: OrderSummary[];
  staff: CurrentStaff;
  drivers: ActiveDriver[];
}

export function OrdersBoard({ initial, staff, drivers }: OrdersBoardProps) {
  const router = useRouter();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Sin esto los eventos no llegan: el cliente Realtime pasa por anon
      // y la policy `for select to authenticated` los filtra silenciosamente.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel("orders-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          () => {
            startTransition(() => router.refresh());
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
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
