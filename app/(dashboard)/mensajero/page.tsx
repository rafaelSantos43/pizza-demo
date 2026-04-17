import { Bike } from "lucide-react";
import type { Metadata } from "next";

import { DriverOrdersList } from "@/components/dashboard/driver-orders-list";
import { requireStaff } from "@/features/auth/guards";
import { listOrdersForDriver } from "@/features/orders/queries";

export const metadata: Metadata = {
  title: "Mensajero | Pizza Demo",
};

export default async function MensajeroPage() {
  // En v1 no restringimos por rol: cualquier staff puede ver el estado de la flota.
  const staff = await requireStaff();

  const driverFilter = staff.role === "driver" ? staff.id : null;
  const orders = await listOrdersForDriver(driverFilter);

  const isDriver = staff.role === "driver";
  const title = isDriver ? "Tus pedidos asignados" : "Mensajero";
  const subtitle = isDriver
    ? "Solo tú ves estos pedidos"
    : "Pedidos en ruta — todos los domiciliarios";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>

      {orders.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
          <Bike className="size-12 text-muted-foreground" />
          <p className="font-serif text-2xl text-foreground">
            Sin pedidos en ruta
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {staff.role === "driver"
              ? "Cuando el cajero te asigne un pedido aparecerá aquí."
              : "Aún no hay pedidos asignados a ningún domiciliario."}
          </p>
        </div>
      ) : (
        <DriverOrdersList
          initial={orders}
          viewerRole={staff.role}
          viewerId={staff.id}
        />
      )}
    </div>
  );
}
