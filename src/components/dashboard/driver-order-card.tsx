"use client";

import { Loader2, MapPin, Phone, Truck, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StaffRole } from "@/features/auth/queries";
import { transitionOrder } from "@/features/orders/actions";
import type {
  OrderSummary,
  OrderStatus,
  PaymentMethod,
} from "@/features/orders/types";
import { formatCop } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  bancolombia: "Bancolombia",
  nequi: "Nequi",
  llave: "Llave",
};

const timeFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Bogota",
});

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return timeFormatter.format(new Date(iso));
  } catch {
    return null;
  }
}

function buildMapsHref(address: OrderSummary["address"]): string {
  // Single-tenant v1: hardcode "Medellín, Colombia". Si llega multi-ciudad
  // se mueve a settings.
  const parts = [
    address.street,
    address.complex_name,
    address.neighborhood,
  ].filter((p): p is string => Boolean(p && p.trim().length > 0));
  const query = encodeURIComponent(`${parts.join(", ")}, Medellín, Colombia`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

interface DriverOrderCardProps {
  order: OrderSummary;
  viewerRole: StaffRole;
}

export function DriverOrderCard({ order, viewerRole }: DriverOrderCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const customerName = order.customer.name?.trim() || "Cliente sin nombre";
  const eta = formatTime(order.eta_at);
  const mapsHref = buildMapsHref(order.address);
  const secondary = [
    order.address.complex_name,
    order.address.neighborhood,
    order.address.zone,
  ]
    .filter((p): p is string => Boolean(p && p.trim().length > 0))
    .join(" · ");

  function handleAdvance(toStatus: OrderStatus, successMessage: string) {
    if (toStatus === "delivered" && !window.confirm("¿Confirmar entrega?")) {
      return;
    }
    startTransition(async () => {
      const res = await transitionOrder({ orderId: order.id, toStatus });
      if (res.ok) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo actualizar el pedido");
      }
    });
  }

  const showSalgo = order.status === "ready";
  const showEntregado = order.status === "on_the_way";

  return (
    <Card
      className={cn(
        "relative gap-4 p-5",
        order.delayed && "border-destructive/60",
      )}
    >
      {order.delayed ? (
        <span className="w-fit rounded-full bg-destructive px-2 py-1 text-xs font-semibold uppercase tracking-wider text-destructive-foreground">
          Retrasado
        </span>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Driver: por filtro de la query solo ve ready/on_the_way; el
            badge de estado es redundante (el botón visible — "Salgo" o
            "Entregado" — ya implica el estado).
            Admin viendo flota: sí lo necesita para ver pipeline.
          */}
          {viewerRole !== "driver" ? (
            <StatusBadge status={order.status} delayed={order.delayed} />
          ) : null}
          {eta ? (
            <span className="text-sm text-muted-foreground">
              Llega {eta}
            </span>
          ) : null}
        </div>
        {viewerRole !== "driver" ? (
          <span className="font-mono text-xs text-muted-foreground">
            #{order.driver_id?.slice(0, 8) ?? "—"}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-foreground">{customerName}</p>
        <a
          href={`tel:${order.customer.phone}`}
          className="inline-flex w-fit min-h-11 items-center gap-2 text-primary hover:underline"
        >
          <Phone className="size-4" />
          <span className="text-base">{order.customer.phone}</span>
        </a>
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-serif text-xl text-foreground">
          {order.address.street}
        </p>
        {secondary ? (
          <p className="text-sm text-muted-foreground">{secondary}</p>
        ) : null}
      </div>

      <Button
        asChild
        variant="outline"
        size="lg"
        className="min-h-12 w-full justify-center text-base"
      >
        <a href={mapsHref} target="_blank" rel="noopener noreferrer">
          <MapPin className="size-5" />
          Abrir en Google Maps
        </a>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {order.item_count} {order.item_count === 1 ? "ítem" : "ítems"} ·{" "}
          <span className="font-medium text-foreground">
            {formatCop(order.total_cents)}
          </span>
        </span>
        <Badge
          variant={order.payment_method === "cash" ? "secondary" : "outline"}
        >
          {PAYMENT_LABELS[order.payment_method]}
        </Badge>
      </div>

      {showSalgo || showEntregado ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {showSalgo ? (
            <Button
              variant="success"
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={pending}
              onClick={() => handleAdvance("on_the_way", "En camino")}
            >
              {pending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Truck className="size-5" />
              )}
              Salgo
            </Button>
          ) : null}
          {showEntregado ? (
            <Button
              variant="success"
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={pending}
              onClick={() => handleAdvance("delivered", "Pedido entregado")}
            >
              {pending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-5" />
              )}
              Entregado
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
