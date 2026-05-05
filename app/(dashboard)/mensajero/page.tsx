import { Bike } from "lucide-react";
import type { Metadata } from "next";

import { DriverOrdersList } from "@/components/dashboard/driver-orders-list";
import { requireStaff } from "@/features/auth/guards";
import { listOrdersForDriver } from "@/features/orders/queries";

export const metadata: Metadata = {
  title: "Mensajero | Pizza Demo",
};

export default async function MensajeroPage() {
  // /mensajero es la vista operativa del domiciliario. Admin ve la flota
  // desde /mensajeros (gestión + pedidos por mensajero).
  const staff = await requireStaff({ roles: ["driver"] });

  // El driver solo ve pedidos en los que puede actuar (ready u on_the_way).
  // Admin viendo /mensajeros sí ve el pipeline completo (sin filtro).
  const orders = await listOrdersForDriver(staff.id, { deliverableOnly: true });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl text-foreground">
          Tus pedidos asignados
        </h1>
        <p className="text-sm text-muted-foreground">
          Solo tú ves estos pedidos
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
          <Bike className="size-12 text-muted-foreground" />
          <p className="font-serif text-2xl text-foreground">
            Sin pedidos en ruta
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Cuando el cajero te asigne un pedido aparecerá aquí.
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
