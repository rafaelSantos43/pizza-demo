import type { Metadata } from "next";

import { DriversPageClient } from "@/components/dashboard/drivers-page-client";
import type { DriverWithOrders } from "@/components/dashboard/drivers-flota";
import { requireStaff } from "@/features/auth/guards";
import { listOrdersForDriver } from "@/features/orders/queries";
import { listDrivers } from "@/features/staff/queries";

export const metadata: Metadata = {
  title: "Mensajeros | Pizza Demo",
};

export default async function MensajerosPage() {
  const staff = await requireStaff({ roles: ["admin"] });
  const drivers = await listDrivers();

  // Solo cargamos pedidos de mensajeros activos para el tab "flota". Los
  // inactivos ya no operan; mostrarlos confundiría y suma queries inútiles.
  const activeDrivers = drivers.filter((d) => d.active);
  const fleetEntries = await Promise.all(
    activeDrivers.map(async (d): Promise<DriverWithOrders> => {
      const orders = await listOrdersForDriver(d.id);
      return {
        id: d.id,
        displayName:
          d.display_name?.trim() || d.email || "Mensajero sin nombre",
        orders,
      };
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <DriversPageClient
        drivers={drivers}
        fleet={fleetEntries}
        viewerId={staff.id}
      />
    </div>
  );
}
