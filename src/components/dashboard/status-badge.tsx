import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import type { OrderStatus } from "@/features/orders/types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Nuevo",
  awaiting_payment: "Esperando pago",
  payment_approved: "Pago aprobado",
  payment_rejected: "Pago rechazado",
  preparing: "En preparación",
  ready: "Listo",
  on_the_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const badge = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      status: {
        new: "bg-primary/15 text-primary",
        awaiting_payment: "bg-amber-100 text-amber-900",
        payment_approved: "bg-emerald-100 text-emerald-900",
        payment_rejected: "bg-destructive/15 text-destructive",
        preparing: "bg-secondary text-secondary-foreground",
        ready: "bg-emerald-100 text-emerald-900",
        on_the_way: "bg-sky-100 text-sky-900",
        delivered: "bg-muted text-muted-foreground",
        cancelled: "bg-muted text-muted-foreground line-through",
      },
    },
    defaultVariants: { status: "new" },
  },
);

interface StatusBadgeProps {
  status: OrderStatus;
  delayed?: boolean;
  className?: string;
}

export function StatusBadge({ status, delayed, className }: StatusBadgeProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className={badge({ status })}>{STATUS_LABELS[status]}</span>
      {delayed ? (
        <span className="inline-flex items-center rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
          Retrasado
        </span>
      ) : null}
    </div>
  );
}

export function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}
