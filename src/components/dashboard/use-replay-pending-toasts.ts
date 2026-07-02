"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import type { OrderSummary } from "@/features/orders/types";

const ALERTING_STATUSES = new Set<string>(["new", "awaiting_payment"]);

const REPLAY_WINDOW_MS = 10 * 60_000;

const hourFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/Bogota",
});

function formatCOP(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatHour(iso: string): string {
  try {
    return hourFormatter.format(new Date(iso));
  } catch {
    return "";
  }
}

// U02: cuando el panel monta (incluyendo tras un F5), reconstruimos los
// toasts persistentes para los pedidos en estados de alerta que llegaron
// hace poco. Sin este replay el cajero pierde la señal visual al refrescar.
//
// Filtros:
//  - Solo `new` / `awaiting_payment` (los que disparan toast en INSERT).
//  - Solo pedidos con `created_at > now - 10min`. Más viejos se asumen ya
//    "vistos" — replicarlos al refrescar es ruido para el cajero.
//
// Se omite el beep deliberadamente: el cajero recién enfocó la pantalla.
export function useReplayPendingOrderToasts(initial: OrderSummary[]): void {
  useEffect(() => {
    const cutoff = Date.now() - REPLAY_WINDOW_MS;
    for (const order of initial) {
      if (!ALERTING_STATUSES.has(order.status)) continue;
      if (new Date(order.created_at).getTime() < cutoff) continue;
      const hour = formatHour(order.created_at);
      const tag = hour ? ` · ${hour}` : "";
      toast(
        `🍕 Pedido pendiente · ${formatCOP(order.total_cents)}${tag}`,
        {
          id: order.id,
          duration: Infinity,
          action: {
            label: "Visto",
            onClick: () => toast.dismiss(order.id),
          },
        },
      );
    }
    // initial es estable para esta instancia del board; el effect debe
    // correr una vez al mount y nada más.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
