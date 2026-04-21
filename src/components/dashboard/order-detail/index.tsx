"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ActiveDriver, CurrentStaff } from "@/features/auth/queries";
import { getOrderDetailAction } from "@/features/orders/detail-action";
import type { OrderDetail } from "@/features/orders/types";

import { ActionsFooter } from "./actions-footer";
import { DetailBody } from "./detail-body";
import type { ActionConfig } from "./status-actions";

interface OrderDetailSheetProps {
  orderId: string | null;
  onClose: () => void;
  staff: CurrentStaff;
  drivers: ActiveDriver[];
}

export function OrderDetailSheet({
  orderId,
  onClose,
  staff: _staff,
  drivers,
}: OrderDetailSheetProps) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      setProofUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrderDetailAction(orderId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setDetail(res.detail);
          setProofUrl(res.proofUrl);
        } else {
          setError(res.error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  function handleAction(action: ActionConfig) {
    if (action.needsConfirm && !window.confirm(action.needsConfirm)) {
      return;
    }
    startTransition(async () => {
      const result = await action.run();
      if (result.ok) {
        toast.success(action.successMessage);
        onClose();
      } else {
        toast.error(result.error ?? "No se pudo completar la acción");
      }
    });
  }

  const open = orderId !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-serif text-2xl text-foreground">
            Pedido {orderId ? `#${orderId.slice(0, 8)}` : ""}
          </SheetTitle>
          <SheetDescription>Detalle y acciones del pedido</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" />
              Cargando…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <AlertCircle className="size-8 text-destructive" />
              <p>{error}</p>
            </div>
          ) : detail ? (
            <DetailBody detail={detail} proofUrl={proofUrl} />
          ) : null}
        </div>

        {detail && !loading && !error ? (
          <ActionsFooter
            detail={detail}
            drivers={drivers}
            pending={pending}
            onAction={handleAction}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
