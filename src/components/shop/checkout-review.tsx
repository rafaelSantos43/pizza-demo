"use client";

import { Bike, MapPin, Store } from "lucide-react";
import { useEffect, useState } from "react";

import type { CartItem } from "@/features/cart/types";
import { formatCop } from "@/lib/format";

// Shape mínima de los datos que el review necesita. No importamos
// `CheckoutFormValues` de checkout-form para evitar dependencia circular
// y porque el review es read-only sobre estos campos.
export interface CheckoutReviewValues {
  customerName: string;
  deliveryType: "delivery" | "pickup";
  housingType: "casa" | "edificio" | "conjunto";
  street: string;
  complex_name?: string;
  tower?: string;
  apartment?: string;
  neighborhood?: string;
  references?: string;
  phone?: string;
}

interface CheckoutReviewProps {
  cartItems: CartItem[];
  total: number;
  values: CheckoutReviewValues;
  proofFile: File | null;
  paymentLabel: string;
  businessAddress: string | null;
}

function formatAddressLine(values: CheckoutReviewValues): string {
  const { housingType, street, complex_name, tower, apartment, neighborhood } =
    values;
  if (housingType === "casa") {
    return [street, neighborhood].filter(Boolean).join(", ");
  }
  if (housingType === "edificio") {
    const block = [complex_name, apartment ? `Apto ${apartment}` : null]
      .filter(Boolean)
      .join(" ");
    return [street, block, neighborhood].filter(Boolean).join(", ");
  }
  // conjunto
  const block = [
    complex_name,
    tower ? `Torre ${tower}` : null,
    apartment ? `Apto ${apartment}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return [street, block, neighborhood].filter(Boolean).join(", ");
}

export function CheckoutReview({
  cartItems,
  total,
  values,
  proofFile,
  paymentLabel,
  businessAddress,
}: CheckoutReviewProps) {
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!proofFile) {
      setProofUrl(null);
      return;
    }
    const url = URL.createObjectURL(proofFile);
    setProofUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [proofFile]);

  const isPickup = values.deliveryType === "pickup";
  const addressLine = isPickup ? "" : formatAddressLine(values);

  return (
    <div className="flex flex-col gap-5">
      {/* Productos */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground">Productos</h3>
        <ul className="flex flex-col gap-3">
          {cartItems.map((it, idx) => (
            <li
              key={idx}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {it.qty} × {it.productName}
                </p>
                <p className="text-xs text-muted-foreground">{it.sizeLabel}</p>
                {it.addonLabel ? (
                  <p className="text-xs text-muted-foreground">
                    Estilo: {it.addonLabel}
                  </p>
                ) : null}
                {it.flavors.length >= 1 ? (
                  <p className="text-xs text-muted-foreground">
                    {it.flavors.map((f) => f.name).join(" · ")}
                  </p>
                ) : null}
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {formatCop(it.unitPriceCents)} c/u
                </p>
              </div>
              <span className="tabular-nums text-foreground">
                {formatCop(it.unitPriceCents * it.qty)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Cliente */}
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">Cliente</h3>
        <p className="text-sm text-foreground">
          {values.customerName}
          {values.phone ? ` · ${values.phone}` : ""}
        </p>
      </section>

      {/* Dirección / Recoger */}
      {isPickup ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Para recoger</h3>
          <div className="flex items-start gap-2 text-sm text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{businessAddress ?? "—"}</span>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Dirección</h3>
          <p className="text-sm text-foreground">{addressLine}</p>
          {values.references ? (
            <p className="text-sm text-muted-foreground">
              Indicaciones: {values.references}
            </p>
          ) : null}
        </section>
      )}

      {/* Pago */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Pago</h3>
        <p className="text-sm text-foreground">{paymentLabel}</p>
        {proofUrl ? (
          <div className="overflow-hidden rounded-md border border-border">
            {/* blob URL local — next/image no aplica, usamos <img> directo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofUrl}
              alt="Comprobante de pago"
              className="h-32 w-32 object-cover"
            />
          </div>
        ) : null}
      </section>

      {/* Total */}
      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {formatCop(total)}
          </span>
        </div>
        {isPickup ? (
          <div className="flex items-center gap-2 rounded-md border border-secondary/50 bg-secondary/15 px-3 py-2 text-sm text-foreground">
            <Store className="size-4 shrink-0 text-secondary-foreground" />
            <span className="font-medium">Recoger en el local</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-foreground">
            <Bike className="size-4 shrink-0 text-success" />
            <span className="font-medium">Domicilio incluido</span>
          </div>
        )}
      </section>
    </div>
  );
}
