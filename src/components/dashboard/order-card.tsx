"use client";

import { AlertTriangle, Clock, FileWarning } from "lucide-react";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import type { OrderSummary } from "@/features/orders/types";
import { formatCop } from "@/lib/format";
import { cn } from "@/lib/utils";

const timeFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Bogota",
});

function formatTime(iso: string): string {
  try {
    return timeFormatter.format(new Date(iso));
  } catch {
    return "";
  }
}

function shortAddress(address: OrderSummary["address"]): string {
  const parts = [address.street, address.neighborhood, address.zone].filter(
    (p): p is string => Boolean(p && p.trim().length > 0),
  );
  return parts.join(" · ");
}

interface OrderCardProps {
  order: OrderSummary;
  onSelect: (id: string) => void;
}

export function OrderCard({ order, onSelect }: OrderCardProps) {
  const customerName = order.customer.name?.trim() || "Cliente sin nombre";
  const address = shortAddress(order.address);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(order.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(order.id);
        }
      }}
      className={cn(
        "min-h-[44px] cursor-pointer gap-3 p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        order.delayed && "border-destructive/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <StatusBadge status={order.status} delayed={order.delayed} />
        <span className="font-mono text-xs text-muted-foreground">
          #{order.id.slice(0, 8)}
        </span>
      </div>

      <div>
        <p className="font-medium text-foreground">{customerName}</p>
        <p className="text-sm text-muted-foreground">{order.customer.phone}</p>
      </div>

      {address ? (
        <p className="line-clamp-2 text-sm text-foreground/80">{address}</p>
      ) : null}

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {order.item_count} {order.item_count === 1 ? "ítem" : "ítems"} ·{" "}
          <span className="font-medium text-foreground">
            {formatCop(order.total_cents)}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {formatTime(order.created_at)}
        </span>
      </div>

      {order.needs_proof && order.status === "awaiting_payment" ? (
        <ProofWaitingBadge createdAt={order.created_at} />
      ) : null}
    </Card>
  );
}

// Gradación visual del tiempo que un pedido lleva sin comprobante:
//   0–4 min  → amarillo "Necesita comprobante"
//   5–29 min → naranja  "Esperando comprobante (N min)" — coincide con el
//              recordatorio automático que dispara pg_cron a los 5 min
//   30+ min  → rojo     "Sin comprobante hace N min" — señal al cajero de
//              evaluar si abandona el pedido (no auto-cancel)
// U01: el reloj se actualiza con `setInterval` cada 60 segundos para
// que pedidos sin cambios de estado (que NO disparan eventos Realtime)
// igual avancen visualmente del amarillo al naranja al rojo. El interval
// vive dentro del badge para que solo los pedidos en awaiting_payment +
// needs_proof re-renderen, no todo el panel.
function ProofWaitingBadge({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const ageMin = Math.max(
    0,
    Math.floor((now - new Date(createdAt).getTime()) / 60_000),
  );

  if (ageMin >= 30) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3.5" />
        Sin comprobante hace {ageMin} min
      </span>
    );
  }
  if (ageMin >= 5) {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-900">
        <Clock className="size-3.5" />
        Esperando comprobante ({ageMin} min)
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
      <FileWarning className="size-3.5" />
      Necesita comprobante
    </span>
  );
}
