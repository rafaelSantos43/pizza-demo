import { CreditCard, MapPin, Phone } from "lucide-react";
import Image from "next/image";

import { StatusBadge, statusLabel } from "@/components/dashboard/status-badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { OrderDetail } from "@/features/orders/types";
import { formatCop } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  PAYMENT_LABELS,
  buildAddressLines,
  formatDateTime,
} from "./format";

export function DetailBody({
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
