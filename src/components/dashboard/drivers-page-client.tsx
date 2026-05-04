"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import {
  DriversFlota,
  type DriverWithOrders,
} from "@/components/dashboard/drivers-flota";
import { DriversManagement } from "@/components/dashboard/drivers-management";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DriverRow } from "@/features/staff/queries";

// ─── Props ──────────────────────────────────────────────────────────

interface DriversPageClientProps {
  drivers: DriverRow[];
  fleet: DriverWithOrders[];
  viewerId: string;
}

// El header con CTA "Agregar mensajero" comparte estado con el sheet de
// creación que vive dentro del tab "Gestión", así que la página entera es
// un solo Client component con un único trigger del modo "create".
export function DriversPageClient({
  drivers,
  fleet,
  viewerId,
}: DriversPageClientProps) {
  const [isCreating, setIsCreating] = useState(false);

  return (
    <>
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl text-foreground">Mensajeros</h1>
          <p className="text-sm text-foreground/80">
            Gestiona las cuentas y mira los pedidos asignados a cada uno.
          </p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="min-h-11 self-start md:self-auto"
        >
          <Plus className="size-4" />
          Agregar mensajero
        </Button>
      </header>

      <Tabs defaultValue="gestion" className="w-full">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="gestion">Gestión</TabsTrigger>
          <TabsTrigger value="flota">Pedidos por mensajero</TabsTrigger>
        </TabsList>

        <TabsContent value="gestion" className="flex flex-col gap-4">
          <DriversManagement
            drivers={drivers}
            isCreating={isCreating}
            onCloseCreate={() => setIsCreating(false)}
            onOpenCreate={() => setIsCreating(true)}
          />
        </TabsContent>

        <TabsContent value="flota" className="flex flex-col gap-4">
          <DriversFlota drivers={fleet} viewerId={viewerId} />
        </TabsContent>
      </Tabs>
    </>
  );
}
