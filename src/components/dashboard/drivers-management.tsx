"use client";

import { Bike, Mail, Pencil, Phone, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DriverFormSheet } from "@/components/dashboard/driver-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toggleDriverActive } from "@/features/staff/actions";
import type { DriverRow } from "@/features/staff/queries";

// ─── Tipos y helpers ────────────────────────────────────────────────

interface DriversManagementProps {
  drivers: DriverRow[];
  isCreating: boolean;
  onCloseCreate: () => void;
  onOpenCreate: () => void;
}

function driverLabel(d: DriverRow): string {
  return d.display_name?.trim() || d.email || "Mensajero sin nombre";
}

// ─── Componente principal ───────────────────────────────────────────

export function DriversManagement({
  drivers,
  isCreating,
  onCloseCreate,
  onOpenCreate,
}: DriversManagementProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const editing = editingId ? drivers.find((d) => d.id === editingId) : null;

  function handleToggleActive(driver: DriverRow) {
    const nextActive = !driver.active;
    const name = driverLabel(driver);
    if (nextActive) {
      const ok = window.confirm(
        `Vas a reactivar a ${name}. Podrá iniciar sesión de nuevo. ¿Continuar?`,
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `Vas a desactivar a ${name}. No podrá iniciar sesión hasta reactivarlo. ¿Continuar?`,
      );
      if (!ok) return;
    }

    setPendingId(driver.id);
    startTransition(async () => {
      const res = await toggleDriverActive(driver.id);
      setPendingId(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const baseMsg = nextActive ? "Activado" : "Desactivado";
      const warning =
        !nextActive && driver.active_orders_count > 0
          ? ` · Tiene ${driver.active_orders_count} pedido${
              driver.active_orders_count === 1 ? "" : "s"
            } activo${
              driver.active_orders_count === 1 ? "" : "s"
            } que sigue${driver.active_orders_count === 1 ? "" : "n"} asignado${
              driver.active_orders_count === 1 ? "" : "s"
            }.`
          : "";
      toast.success(`${baseMsg}${warning}`);
      router.refresh();
    });
  }

  if (drivers.length === 0) {
    return (
      <>
        <EmptyState onCreate={onOpenCreate} />
        <DriverFormSheet
          mode="create"
          open={isCreating}
          onClose={onCloseCreate}
        />
      </>
    );
  }

  return (
    <>
      <MobileList
        drivers={drivers}
        pendingId={pendingId}
        onEdit={setEditingId}
        onToggleActive={handleToggleActive}
      />
      <DesktopTable
        drivers={drivers}
        pendingId={pendingId}
        onEdit={setEditingId}
        onToggleActive={handleToggleActive}
      />

      <DriverFormSheet
        mode="create"
        open={isCreating}
        onClose={onCloseCreate}
      />
      <DriverFormSheet
        mode="edit"
        open={editing !== null && editing !== undefined}
        onClose={() => setEditingId(null)}
        initial={
          editing
            ? {
                id: editing.id,
                email: editing.email,
                display_name: editing.display_name,
                phone: editing.phone,
              }
            : undefined
        }
      />
    </>
  );
}

// ─── Subcomponentes de presentación ─────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-secondary/60 text-secondary-foreground">
        <Bike className="size-7" />
      </div>
      <h2 className="font-serif text-xl text-foreground">
        Aún no tienes mensajeros
      </h2>
      <p className="max-w-xs text-sm text-foreground/80">
        Crea la primera cuenta para asignar pedidos y notificarles por correo.
      </p>
      <Button onClick={onCreate} className="mt-2 min-h-11">
        <Plus className="size-4" />
        Agregar mensajero
      </Button>
    </Card>
  );
}

interface ListProps {
  drivers: DriverRow[];
  pendingId: string | null;
  onEdit: (id: string) => void;
  onToggleActive: (driver: DriverRow) => void;
}

function MobileList({
  drivers,
  pendingId,
  onEdit,
  onToggleActive,
}: ListProps) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {drivers.map((d) => {
        const busy = pendingId === d.id;
        return (
          <Card key={d.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-serif text-lg text-foreground">
                  {driverLabel(d)}
                </p>
                <Badge
                  variant={d.active ? "secondary" : "outline"}
                  className={
                    d.active ? "" : "text-muted-foreground"
                  }
                >
                  {d.active ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <div className="text-right text-sm text-foreground/80">
                <p className="font-medium tabular-nums">
                  {d.active_orders_count}
                </p>
                <p className="text-xs text-muted-foreground">
                  pedido{d.active_orders_count === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-sm text-foreground/80">
              {d.email ? (
                <span className="flex items-center gap-2 break-all">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  {d.email}
                </span>
              ) : null}
              {d.phone ? (
                <a
                  href={`tel:${d.phone}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Phone className="size-4 shrink-0" />
                  {d.phone}
                </a>
              ) : (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-4 shrink-0" />
                  Sin teléfono
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onEdit(d.id)}
                disabled={busy}
                className="min-h-11 flex-1"
              >
                <Pencil className="size-4" />
                Editar
              </Button>
              <Button
                type="button"
                variant={d.active ? "destructive" : "success"}
                onClick={() => onToggleActive(d)}
                disabled={busy}
                className="min-h-11 flex-1"
              >
                {d.active ? "Desactivar" : "Activar"}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DesktopTable({
  drivers,
  pendingId,
  onEdit,
  onToggleActive,
}: ListProps) {
  return (
    <div className="hidden rounded-lg border border-border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Pedidos activos</TableHead>
            <TableHead className="w-[220px] text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drivers.map((d) => {
            const busy = pendingId === d.id;
            return (
              <TableRow key={d.id}>
                <TableCell className="font-medium text-foreground">
                  {driverLabel(d)}
                </TableCell>
                <TableCell className="text-foreground/80">
                  {d.email ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {d.phone ? (
                    <a
                      href={`tel:${d.phone}`}
                      className="text-primary hover:underline"
                    >
                      {d.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={d.active ? "secondary" : "outline"}
                    className={
                      d.active ? "" : "text-muted-foreground"
                    }
                  >
                    {d.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.active_orders_count}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(d.id)}
                      disabled={busy}
                      className="min-h-9"
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant={d.active ? "destructive" : "success"}
                      size="sm"
                      onClick={() => onToggleActive(d)}
                      disabled={busy}
                      className="min-h-9"
                    >
                      {d.active ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
