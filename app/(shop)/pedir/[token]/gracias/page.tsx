import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { resolveTokenCustomer } from "@/features/order-tokens/verify";
import { getOrderConfirmation } from "@/features/orders/queries";
import type { OrderStatus, PaymentMethod } from "@/features/orders/types";
import { formatCop } from "@/lib/format";

export const metadata: Metadata = {
  title: "Gracias | Pizza Demo",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Recibido",
  awaiting_payment: "Esperando pago",
  payment_approved: "Pago aprobado",
  payment_rejected: "Pago rechazado",
  preparing: "En preparación",
  ready: "Listo",
  on_the_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  bancolombia: "Bancolombia",
  nequi: "Nequi",
  llave: "Llave",
};

function shortId(id: string): string {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8).toUpperCase();
}

export default async function GraciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { token } = await params;
  const { id } = await searchParams;

  if (!id) {
    redirect(`/pedir/${token}`);
  }

  // L04: el orderId viene como query string público. Resolvemos el
  // customer_id desde el token de la ruta y exigimos que el pedido
  // pertenezca a ese cliente. Sin esto, cualquier orderId arbitrario
  // expondría status/total/método de pago de pedidos ajenos.
  const tokenCustomer = await resolveTokenCustomer(token);
  const order = tokenCustomer.ok
    ? await getOrderConfirmation(id, tokenCustomer.customerId)
    : null;

  if (!order) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="font-serif text-3xl text-foreground">
          No encontramos tu pedido
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          Si crees que es un error, escríbenos por WhatsApp.
        </p>
        <Button asChild variant="outline">
          <Link href={`/pedir/${token}`}>Volver</Link>
        </Button>
      </main>
    );
  }

  const isAwaitingProof =
    order.status === "awaiting_payment" && order.needs_proof;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="text-6xl" aria-hidden>
        🍕
      </span>

      <div className="flex flex-col items-center gap-2">
        <h1 className="font-serif text-3xl text-foreground md:text-4xl">
          ¡Gracias!
        </h1>
        <p className="text-base text-muted-foreground md:text-lg">
          Tu pedido <span className="font-medium">#{shortId(order.id)}</span>{" "}
          fue recibido.
        </p>
      </div>

      <dl className="grid w-full max-w-md grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-left text-sm">
        <dt className="text-muted-foreground">Estado</dt>
        <dd className="text-right font-medium text-foreground">
          {STATUS_LABEL[order.status]}
        </dd>
        <dt className="text-muted-foreground">Total</dt>
        <dd className="text-right font-medium text-foreground tabular-nums">
          {formatCop(order.total_cents)}
        </dd>
        <dt className="text-muted-foreground">Pago</dt>
        <dd className="text-right font-medium text-foreground">
          {PAYMENT_LABEL[order.payment_method]}
        </dd>
      </dl>

      {order.status === "preparing" ? (
        <p className="max-w-md text-sm text-muted-foreground">
          Tu pedido entró a cocina. Te avisamos por WhatsApp cuando esté en
          camino.
        </p>
      ) : null}

      {order.status === "awaiting_payment" && !isAwaitingProof ? (
        <p className="max-w-md text-sm text-muted-foreground">
          Recibimos tu comprobante. Lo estamos validando, te avisamos por
          WhatsApp.
        </p>
      ) : null}

      {isAwaitingProof ? (
        <p className="max-w-md text-sm text-primary">
          Envía tu comprobante por WhatsApp para confirmar el pago.
        </p>
      ) : null}

      <Button asChild variant="outline">
        <Link href={`/pedir/${token}`}>Volver</Link>
      </Button>
    </main>
  );
}
