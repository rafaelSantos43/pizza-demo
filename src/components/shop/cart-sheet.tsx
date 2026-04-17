"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CartItem } from "@/features/cart/types";
import { formatCop } from "@/lib/format";

interface CartSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  items: CartItem[];
  token: string;
  onRemove: (index: number) => void;
  onClear: () => void;
}

export function CartSheet({
  open,
  onOpenChange,
  items,
  token,
  onRemove,
  onClear,
}: CartSheetProps) {
  const router = useRouter();
  const total = items.reduce(
    (sum, it) => sum + it.unitPriceCents * it.qty,
    0,
  );

  function handleCheckout() {
    onOpenChange(false);
    router.push(`/pedir/${token}/checkout`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[80dvh] w-full max-w-none p-0 sm:max-w-none md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[28rem] md:max-w-[28rem] md:border-l"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-serif text-xl text-foreground">
            Tu carrito
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="text-5xl" aria-hidden>
              🍕
            </span>
            <p className="text-base text-muted-foreground">
              Tu carrito está vacío
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Seguir explorando
            </Button>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-5 py-4">
              {items.map((it, idx) => (
                <li key={idx} className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">
                        {it.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {it.sizeLabel}
                        {it.flavors.length > 0
                          ? ` · ${it.flavors.map((f) => f.name).join(" · ")}`
                          : ""}
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-foreground">
                        {it.qty} × {formatCop(it.unitPriceCents)} ={" "}
                        <span className="font-medium">
                          {formatCop(it.unitPriceCents * it.qty)}
                        </span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemove(idx)}
                      aria-label={`Quitar ${it.productName}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Separator className="mt-3" />
                </li>
              ))}
            </ul>

            <div
              className="border-t border-border px-5 pt-4 pb-5"
              style={{
                paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
              }}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-serif text-2xl text-foreground tabular-nums">
                  {formatCop(total)}
                </span>
              </div>
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                onClick={handleCheckout}
              >
                Ir al pago
              </Button>
              <button
                type="button"
                onClick={onClear}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Vaciar carrito
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
