"use client";

import { Info, Minus, Plus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  SIZE_INFO,
  SIZE_LABEL,
  SIZE_ORDER,
  type PizzaSize,
  type Product,
} from "@/features/catalog/types";
import type { CartFlavor, CartItem } from "@/features/cart/types";
import { cn } from "@/lib/utils";
import { formatCop } from "@/lib/format";

// ─── Tipos y helpers de precio/tamaño ──────────────────────────────

interface PizzaBuilderProps {
  product: Product;
  allProducts: Product[];
  onAdd: (item: CartItem) => void;
}

function sizeIsAtLeast(size: PizzaSize, min: PizzaSize): boolean {
  return SIZE_ORDER.indexOf(size) >= SIZE_ORDER.indexOf(min);
}

function priceForFlavor(p: Product, size: PizzaSize): number | null {
  return p.sizes.find((s) => s.size === size)?.price_cents ?? null;
}

// ─── Componente: estado del builder y cálculo de precio ────────────

export function PizzaBuilder({
  product,
  allProducts,
  onAdd,
}: PizzaBuilderProps) {
  const initialSize: PizzaSize | null = product.sizes[0]?.size ?? null;

  const [selectedSize, setSelectedSize] = useState<PizzaSize | null>(
    initialSize,
  );
  const [selectedFlavors, setSelectedFlavors] = useState<CartFlavor[]>([]);
  const [qty, setQty] = useState<number>(1);

  const sizeRow = selectedSize
    ? product.sizes.find((s) => s.size === selectedSize)
    : null;
  const basePrice = sizeRow?.price_cents ?? null;

  const supportsMultiflavor =
    product.max_flavors > 1 &&
    !!product.min_size_for_multiflavor &&
    !!selectedSize &&
    sizeIsAtLeast(selectedSize, product.min_size_for_multiflavor);

  const flavorChoices = product.category
    ? allProducts.filter(
        (p) => p.category === product.category && p.id !== product.id,
      )
    : [];

  const flavorPricesAtSize: (number | null)[] =
    selectedSize && selectedFlavors.length > 0
      ? selectedFlavors.map((f) => {
          const p = allProducts.find((x) => x.id === f.productId);
          return p ? priceForFlavor(p, selectedSize) : null;
        })
      : [];

  const someFlavorMissingSize = flavorPricesAtSize.some((p) => p === null);

  // Mitad y mitad: el precio del item es el MÁS ALTO entre el base y
  // los sabores combinados. El cliente ve la regla en el resumen del
  // checkout. Backend recalcula igual con precios de DB.
  const unitPrice: number | null =
    basePrice === null
      ? null
      : selectedFlavors.length === 0
        ? basePrice
        : someFlavorMissingSize
          ? null
          : Math.max(
              basePrice,
              ...(flavorPricesAtSize as number[]),
            );

  function toggleFlavor(p: Product) {
    setSelectedFlavors((prev) => {
      if (prev.some((f) => f.productId === p.id)) {
        return prev.filter((f) => f.productId !== p.id);
      }
      if (prev.length >= product.max_flavors) {
        return prev;
      }
      return [...prev, { productId: p.id, name: p.name }];
    });
  }

  function handleAdd() {
    if (!selectedSize || unitPrice === null) return;
    const item: CartItem = {
      productId: product.id,
      productName: product.name,
      size: selectedSize,
      sizeLabel: SIZE_LABEL[selectedSize],
      qty,
      unitPriceCents: unitPrice,
      flavors: supportsMultiflavor
        ? selectedFlavors.map((f) => ({ productId: f.productId, name: f.name }))
        : [],
      notes: "",
    };
    onAdd(item);
  }

  const totalCents = unitPrice !== null ? unitPrice * qty : 0;
  const minMultiLabel = product.min_size_for_multiflavor
    ? SIZE_LABEL[product.min_size_for_multiflavor]
    : null;

  const cannotAdd = !selectedSize || unitPrice === null;

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[32dvh] w-full shrink-0 bg-muted md:h-56">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(min-width: 768px) 28rem, 100vw"
            className="object-cover"
            unoptimized
            priority
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-7xl">
            <span aria-hidden>🍕</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-40">
        <h2 className="font-serif text-2xl text-foreground">{product.name}</h2>
        {product.description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {product.description}
          </p>
        ) : null}

        <Separator className="my-5" />

        <section>
          <div className="flex items-baseline justify-between">
            <h3 className="font-serif text-lg text-foreground">
              Selector de tamaño
            </h3>
            <span className="text-xs tracking-wider text-muted-foreground uppercase">
              Obligatorio
            </span>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {product.sizes.map((s) => {
              const active = s.size === selectedSize;
              const info = SIZE_INFO[s.size];
              return (
                <button
                  type="button"
                  key={s.size}
                  onClick={() => {
                    setSelectedSize(s.size);
                    if (
                      product.min_size_for_multiflavor &&
                      !sizeIsAtLeast(s.size, product.min_size_for_multiflavor)
                    ) {
                      setSelectedFlavors([]);
                    }
                  }}
                  className={cn(
                    "flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "border border-border bg-background text-foreground hover:bg-accent",
                  )}
                >
                  <span className="leading-tight">{SIZE_LABEL[s.size]}</span>
                  <span className="text-[11px] leading-tight opacity-70">
                    {info.porciones} porc · {info.diametro_cm} cm
                  </span>
                  <span className="text-xs tabular-nums opacity-90">
                    {formatCop(s.price_cents)}
                  </span>
                </button>
              );
            })}
          </div>

          {product.max_flavors > 1 && minMultiLabel ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-primary italic">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Mitad y mitad disponible desde el tamaño {minMultiLabel}. El
                precio toma el valor más alto entre los sabores.
              </span>
            </p>
          ) : null}
        </section>

        {supportsMultiflavor && flavorChoices.length > 0 ? (
          <section className="mt-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-lg text-foreground">
                Selecciona tus sabores
              </h3>
              <Badge variant="secondary" className="tracking-wider uppercase">
                Hasta {product.max_flavors} sabores
              </Badge>
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {flavorChoices.map((p) => {
                const checked = selectedFlavors.some(
                  (f) => f.productId === p.id,
                );
                const disabled =
                  !checked && selectedFlavors.length >= product.max_flavors;
                return (
                  <li key={p.id}>
                    <label
                      className={cn(
                        "flex items-center gap-3 rounded-lg border border-border p-3 transition-colors",
                        checked
                          ? "border-primary bg-accent"
                          : "bg-background",
                        disabled && "opacity-50",
                      )}
                    >
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                        {p.image_url ? (
                          <Image
                            src={p.image_url}
                            alt={p.name}
                            fill
                            sizes="48px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl">
                            <span aria-hidden>🍕</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{p.name}</p>
                        {p.description ? (
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {p.description}
                          </p>
                        ) : null}
                      </div>
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => toggleFlavor(p)}
                        aria-label={`Sabor ${p.name}`}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 border-t border-border bg-background px-5 pt-4 pb-5"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Cantidad</span>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Restar"
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-6 text-center font-medium tabular-nums">
              {qty}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              aria-label="Sumar"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {someFlavorMissingSize ? (
          <p className="mb-2 text-xs text-destructive">
            Un sabor no está disponible en este tamaño.
          </p>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="h-12 w-full justify-between text-base"
          disabled={cannotAdd}
          onClick={handleAdd}
        >
          <span>Agregar al carrito</span>
          <span className="tabular-nums">{formatCop(totalCents)}</span>
        </Button>
      </div>
    </div>
  );
}
