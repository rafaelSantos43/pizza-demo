import type { Metadata } from "next";
import Link from "next/link";

import { OrdersBoard } from "@/components/dashboard/orders-board";
import { requireStaff } from "@/features/auth/guards";
import { listActiveDrivers } from "@/features/auth/queries";
import { listActiveOrders } from "@/features/orders/queries";
import type { OrderStatus, OrderSummary } from "@/features/orders/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pedidos | Pizza Demo",
};

type FilterKey =
  | "all"
  | "awaiting_payment"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delayed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "awaiting_payment", label: "Esperando pago" },
  { key: "preparing", label: "En preparación" },
  { key: "ready", label: "Listos" },
  { key: "on_the_way", label: "En camino" },
  { key: "delayed", label: "Retrasados" },
];

const STATUS_BY_FILTER: Partial<Record<FilterKey, OrderStatus>> = {
  awaiting_payment: "awaiting_payment",
  preparing: "preparing",
  ready: "ready",
  on_the_way: "on_the_way",
};

function applyFilter(orders: OrderSummary[], filter: FilterKey): OrderSummary[] {
  if (filter === "all") return orders;
  if (filter === "delayed") return orders.filter((o) => o.delayed);
  const status = STATUS_BY_FILTER[filter];
  return status ? orders.filter((o) => o.status === status) : orders;
}

function isFilterKey(value: string | undefined): value is FilterKey {
  return (
    value === "all" ||
    value === "awaiting_payment" ||
    value === "preparing" ||
    value === "ready" ||
    value === "on_the_way" ||
    value === "delayed"
  );
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const [{ filter: filterParam }, staff, allOrders, drivers] = await Promise.all([
    searchParams,
    requireStaff(),
    listActiveOrders(),
    listActiveDrivers(),
  ]);

  const filter: FilterKey = isFilterKey(filterParam) ? filterParam : "all";
  const orders = applyFilter(allOrders, filter);

  const pendingCount = allOrders.filter(
    (o) => o.status === "awaiting_payment" || o.status === "new",
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl text-foreground">
          Pedidos activos
        </h1>
        <p className="text-sm text-muted-foreground">
          {pendingCount} {pendingCount === 1 ? "pendiente" : "pendientes"} ·{" "}
          {allOrders.length} en curso
        </p>
      </header>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filtros de pedidos"
      >
        {FILTERS.map((f) => {
          const isActive = f.key === filter;
          const href = f.key === "all" ? "/pedidos" : `/pedidos?filter=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-secondary bg-secondary text-secondary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <OrdersBoard initial={orders} staff={staff} drivers={drivers} />
    </div>
  );
}
