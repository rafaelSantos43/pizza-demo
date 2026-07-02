"use client";

import { Button } from "@/components/ui/button";
import type { ActiveDriver } from "@/features/auth/queries";
import type { OrderDetail } from "@/features/orders/types";
import { cn } from "@/lib/utils";

import { DriverAssignment } from "./driver-assignment";
import {
  actionsForStatus,
  TERMINAL_STATUSES,
  type ActionConfig,
} from "./status-actions";

export function ActionsFooter({
  detail,
  drivers,
  pending,
  onAction,
}: {
  detail: OrderDetail;
  drivers: ActiveDriver[];
  pending: boolean;
  onAction: (action: ActionConfig) => void;
}) {
  const actions = actionsForStatus(detail);
  const showDriver = !TERMINAL_STATUSES.has(detail.status);

  return (
    <div className="border-t border-border bg-card px-5 py-4">
      <div className="flex flex-col gap-3">
        {showDriver ? (
          <DriverAssignment
            detail={detail}
            drivers={drivers}
            disabled={pending}
          />
        ) : null}
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.label}
              variant={action.subtle ? "ghost" : action.variant}
              size="lg"
              className={cn(
                "w-full justify-center text-base",
                action.subtle
                  ? "min-h-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  : "min-h-12",
              )}
              onClick={() => onAction(action)}
              disabled={pending}
            >
              <Icon className="size-5" />
              {action.label}
            </Button>
          );
        })}
        {actions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Sin acciones disponibles para este estado.
          </p>
        ) : null}
      </div>
    </div>
  );
}
