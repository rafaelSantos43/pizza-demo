"use client";

import { Bike } from "lucide-react";

import { DriverOrdersList } from "@/components/dashboard/driver-orders-list";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { OrderSummary } from "@/features/orders/types";

// ─── Tipos ─────────────────────────────────────────────────────────

export interface DriverWithOrders {
  id: string;
  displayName: string;
  orders: OrderSummary[];
}

interface DriversFlotaProps {
  drivers: DriverWithOrders[];
  viewerId: string;
}

// ─── Componente: acordeón con pedidos por mensajero ────────────────

export function DriversFlota({ drivers, viewerId }: DriversFlotaProps) {
  if (drivers.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-secondary/60 text-secondary-foreground">
          <Bike className="size-7" />
        </div>
        <h2 className="font-serif text-xl text-foreground">
          Sin mensajeros activos
        </h2>
        <p className="max-w-xs text-sm text-foreground/80">
          Activa al menos un mensajero en la pestaña Gestión para ver pedidos
          aquí.
        </p>
      </Card>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Accordion type="multiple" className="px-3 md:px-4">
        {drivers.map((d) => {
          const count = d.orders.length;
          const hasOrders = count > 0;

          if (!hasOrders) {
            // Sin pedidos: header estático no expandible. Mantiene el layout
            // alineado con los items expandibles para que la columna derecha
            // siga dando feedback visual del estado del mensajero.
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 border-b py-4 last:border-b-0"
              >
                <span className="font-medium text-foreground">
                  {d.displayName}
                </span>
                <span className="text-sm text-muted-foreground">
                  Sin pedidos asignados
                </span>
              </div>
            );
          }

          return (
            <AccordionItem key={d.id} value={d.id}>
              <AccordionTrigger className="py-4">
                <span className="flex flex-1 items-center justify-between gap-3 pr-2">
                  <span className="font-medium text-foreground">
                    {d.displayName}
                  </span>
                  <Badge variant="secondary">
                    {count} pedido{count === 1 ? "" : "s"}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="pt-1 pb-2">
                  <DriverOrdersList
                    initial={d.orders}
                    viewerRole="admin"
                    viewerId={viewerId}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
