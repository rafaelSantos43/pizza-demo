"use client";

import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Loader2,
  MapPin,
  Phone,
  Truck,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge, statusLabel } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ActiveDriver, CurrentStaff } from "@/features/auth/queries";
import {
  approvePayment,
  assignDriver,
  rejectPayment,
  transitionOrder,
} from "@/features/orders/actions";
import { getOrderDetailAction } from "@/features/orders/detail-action";
import type {
  OrderDetail,
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

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
});

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return dateTimeFormatter.format(new Date(iso));
  } catch {
    return "—";
  }
}

function buildAddressLines(detail: OrderDetail): string[] {
  const a = detail.address;
  const lines: string[] = [a.street];
  const lvl2 = [a.complex_name, a.tower, a.apartment]
    .filter((v): v is string => Boolean(v && v.trim().length))
    .join(" · ");
  if (lvl2) lines.push(lvl2);
  if (a.neighborhood || a.zone) {
    lines.push(
      [a.neighborhood, a.zone].filter(Boolean).join(" · "),
    );
  }
  if (a.references) lines.push(a.references);
  return lines;
}

interface ActionConfig {
  label: string;
  icon: typeof CheckCircle2;
  variant: "default" | "destructive";
  needsConfirm?: string;
  run: () => Promise<{ ok: boolean; error?: string }>;
  successMessage: string;
}

function actionsForStatus(
  detail: OrderDetail,
): ActionConfig[] {
  const orderId = detail.id;
  const actions: ActionConfig[] = [];

  if (detail.status === "awaiting_payment") {
    actions.push({
      label: "Aprobar pago",
      icon: CheckCircle2,
      variant: "default",
      run: async () => {
        const r = await approvePayment(orderId);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      successMessage: "Pago aprobado",
    });
    actions.push({
      label: "Rechazar comprobante",
      icon: X,
      variant: "destructive",
      needsConfirm: "¿Rechazar el comprobante? Se le pedirá uno nuevo al cliente.",
      run: async () => {
        const r = await rejectPayment(orderId);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      successMessage: "Comprobante rechazado",
    });
  }

  if (detail.status === "new" || detail.status === "payment_approved") {
    actions.push({
      label: "Marcar en preparación",
      icon: ChefHat,
      variant: "default",
      run: async () => {
        const r = await transitionOrder({
          orderId,
          toStatus: "preparing",
        });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      successMessage: "Pedido en preparación",
    });
  }

  if (detail.status === "preparing") {
    actions.push({
      label: "Marcar listo",
      icon: CheckCircle2,
      variant: "default",
      run: async () => {
        const r = await transitionOrder({ orderId, toStatus: "ready" });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      successMessage: "Pedido listo",
    });
  }

  if (detail.status === "ready") {
    // v1.1 TODO: agregar selector de driver antes de pasar a en_camino.
    // En v1 dejamos el botón sin asignación obligatoria.
    actions.push({
      label: "Marcar en camino",
      icon: Truck,
      variant: "default",
      run: async () => {
        const r = await transitionOrder({
          orderId,
          toStatus: "on_the_way",
        });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      successMessage: "Pedido en camino",
    });
  }

  if (detail.status === "on_the_way") {
    actions.push({
      label: "Marcar entregado",
      icon: CheckCircle2,
      variant: "default",
      run: async () => {
        const r = await transitionOrder({ orderId, toStatus: "delivered" });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      successMessage: "Pedido entregado",
    });
  }

  const isActive =
    detail.status !== "delivered" && detail.status !== "cancelled";
  if (isActive) {
    actions.push({
      label: "Cancelar pedido",
      icon: Ban,
      variant: "destructive",
      needsConfirm: "¿Seguro que quieres cancelar este pedido?",
      run: async () => {
        const r = await transitionOrder({ orderId, toStatus: "cancelled" });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      successMessage: "Pedido cancelado",
    });
  }

  return actions;
}

interface OrderDetailSheetProps {
  orderId: string | null;
  onClose: () => void;
  staff: CurrentStaff;
  drivers: ActiveDriver[];
}

export function OrderDetailSheet({
  orderId,
  onClose,
  // staff queda disponible si más adelante hace falta gating por rol en acciones
  staff: _staff,
  drivers,
}: OrderDetailSheetProps) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      setProofUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrderDetailAction(orderId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setDetail(res.detail);
          setProofUrl(res.proofUrl);
        } else {
          setError(res.error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  function handleAction(action: ActionConfig) {
    if (action.needsConfirm && !window.confirm(action.needsConfirm)) {
      return;
    }
    startTransition(async () => {
      const result = await action.run();
      if (result.ok) {
        toast.success(action.successMessage);
        onClose();
      } else {
        toast.error(result.error ?? "No se pudo completar la acción");
      }
    });
  }

  const open = orderId !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-serif text-2xl text-foreground">
            Pedido {orderId ? `#${orderId.slice(0, 8)}` : ""}
          </SheetTitle>
          <SheetDescription>Detalle y acciones del pedido</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" />
              Cargando…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <AlertCircle className="size-8 text-destructive" />
              <p>{error}</p>
            </div>
          ) : detail ? (
            <DetailBody detail={detail} proofUrl={proofUrl} />
          ) : null}
        </div>

        {detail && !loading && !error ? (
          <div className="border-t border-border bg-card px-5 py-4">
            <div className="flex flex-col gap-3">
              {detail.status !== "delivered" && detail.status !== "cancelled" ? (
                <DriverAssignment
                  detail={detail}
                  drivers={drivers}
                  disabled={pending}
                />
              ) : null}
              {actionsForStatus(detail).map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.label}
                    variant={action.variant}
                    size="lg"
                    className="min-h-12 w-full justify-center text-base"
                    onClick={() => handleAction(action)}
                    disabled={pending}
                  >
                    <Icon className="size-5" />
                    {action.label}
                  </Button>
                );
              })}
              {actionsForStatus(detail).length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  Sin acciones disponibles para este estado.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  detail,
  proofUrl,
}: {
  detail: OrderDetail;
  proofUrl: string | null;
}) {
  const addressLines = buildAddressLines(detail);
  const customerName = detail.customer.name?.trim() || "Cliente sin nombre";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={detail.status} delayed={detail.delayed} />
        <span className="text-xs text-muted-foreground">
          Creado {formatDateTime(detail.created_at)}
        </span>
      </div>

      <Section title="Cliente">
        <p className="font-medium text-foreground">{customerName}</p>
        <a
          href={`tel:${detail.customer.phone}`}
          className="mt-1 inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Phone className="size-4" />
          {detail.customer.phone}
        </a>
      </Section>

      <Section title="Dirección" icon={MapPin}>
        <div className="space-y-1 text-sm text-foreground">
          {addressLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </Section>

      <Section title="Productos">
        <ul className="divide-y divide-border">
          {detail.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">
                ×{item.qty}
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  {item.product_name ?? "Producto"}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  Tamaño: {item.size}
                </p>
                {item.flavor_names && item.flavor_names.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sabores: {item.flavor_names.join(" / ")}
                  </p>
                ) : null}
                {item.notes ? (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    “{item.notes}”
                  </p>
                ) : null}
              </div>
              <span className="text-sm font-medium text-foreground">
                {formatCop(item.unit_price_cents * item.qty)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="font-serif text-2xl text-foreground">
          {formatCop(detail.total_cents)}
        </span>
      </div>

      <Section title="Pago" icon={CreditCard}>
        <p className="text-sm text-foreground">
          Método: {PAYMENT_LABELS[detail.payment_method]}
        </p>
        {detail.payment_method !== "cash" ? (
          detail.needs_proof || !proofUrl ? (
            <p className="mt-2 text-sm text-amber-700">
              Sin comprobante adjunto.
            </p>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="mt-2 block overflow-hidden rounded-md border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Image
                    src={proofUrl}
                    alt="Comprobante de pago"
                    width={320}
                    height={200}
                    unoptimized
                    className="h-32 w-full object-cover"
                  />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl p-2">
                <DialogTitle className="sr-only">
                  Comprobante de pago
                </DialogTitle>
                <Image
                  src={proofUrl}
                  alt="Comprobante de pago"
                  width={1200}
                  height={1600}
                  unoptimized
                  className="h-auto w-full rounded-md object-contain"
                />
              </DialogContent>
            </Dialog>
          )
        ) : null}
        {detail.payment_approved_at ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Aprobado {formatDateTime(detail.payment_approved_at)}
          </p>
        ) : null}
      </Section>

      <Section title="ETA">
        <p className="text-sm text-foreground">
          {detail.eta_at ? formatDateTime(detail.eta_at) : "—"}
          {detail.delayed ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
              Retrasado
            </span>
          ) : null}
        </p>
      </Section>

      {detail.notes ? (
        <Section title="Notas del cliente">
          <p className="text-sm italic text-foreground">“{detail.notes}”</p>
        </Section>
      ) : null}

      <Section title="Historial">
        <ol className="space-y-2 text-sm">
          {detail.status_events.length === 0 ? (
            <li className="text-muted-foreground">Sin eventos registrados.</li>
          ) : (
            detail.status_events.map((ev, idx) => (
              <li
                key={`${ev.created_at}-${idx}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-foreground">
                  {ev.from_status
                    ? `${statusLabel(ev.from_status)} → ${statusLabel(ev.to_status)}`
                    : statusLabel(ev.to_status)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(ev.created_at)}
                </span>
              </li>
            ))
          )}
        </ol>
      </Section>
    </div>
  );
}

const UNASSIGNED_VALUE = "__unassigned__";

function DriverAssignment({
  detail,
  drivers,
  disabled,
}: {
  detail: OrderDetail;
  drivers: ActiveDriver[];
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<string>(
    detail.driver_id ?? UNASSIGNED_VALUE,
  );

  const ASSIGNABLE_STATUSES = [
    "payment_approved",
    "preparing",
    "ready",
    "on_the_way",
  ];
  const canAssign = ASSIGNABLE_STATUSES.includes(detail.status);

  if (drivers.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Aún no hay domiciliarios. Crea profiles con role=&apos;driver&apos; en
        Supabase Studio.
      </p>
    );
  }

  function handleChange(next: string) {
    const driverId = next === UNASSIGNED_VALUE ? null : next;
    if (driverId === (detail.driver_id ?? null)) return;

    setValue(next);
    startTransition(async () => {
      const res = await assignDriver({ orderId: detail.id, driverId });
      if (res.ok) {
        toast.success(driverId ? "Domiciliario asignado" : "Sin asignar");
      } else {
        toast.error(res.error ?? "No se pudo asignar al domiciliario");
        setValue(detail.driver_id ?? UNASSIGNED_VALUE);
      }
    });
  }

  const label = detail.driver_id ? "Reasignar mensajero" : "Asignar mensajero";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {!canAssign && (
        <div className="rounded-md bg-amber-50 px-3 py-2 flex gap-2 items-start">
          <AlertCircle className="size-4 mt-0.5 text-amber-700 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            {detail.status === "awaiting_payment"
              ? "Aprueba el comprobante de pago antes de asignar."
              : `No se puede asignar en estado "${statusLabel(detail.status)}".`}
          </p>
        </div>
      )}
      <Select
        value={value}
        onValueChange={handleChange}
        disabled={disabled || pending || !canAssign}
      >
        <SelectTrigger className="h-11 w-full">
          <SelectValue placeholder="Selecciona un domiciliario" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED_VALUE}>Sin asignar</SelectItem>
          {drivers.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        <h3 className={cn("text-xs font-semibold uppercase tracking-wide text-muted-foreground")}>
          {title}
        </h3>
      </div>
      <Separator />
      <div>{children}</div>
    </section>
  );
}
