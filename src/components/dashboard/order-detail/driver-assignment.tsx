"use client";

import { AlertCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { statusLabel } from "@/components/dashboard/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActiveDriver } from "@/features/auth/queries";
import { assignDriver } from "@/features/orders/actions";
import type { OrderDetail } from "@/features/orders/types";

const UNASSIGNED_VALUE = "__unassigned__";

const ASSIGNABLE_STATUSES = [
  "payment_approved",
  "preparing",
  "ready",
  "on_the_way",
];

export function DriverAssignment({
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
