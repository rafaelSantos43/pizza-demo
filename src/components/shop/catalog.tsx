"use client";

import { Search, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CartSheet } from "@/components/shop/cart-sheet";
import { PizzaBuilder } from "@/components/shop/pizza-builder";
import type { Product, Settings } from "@/features/catalog/types";
import type { CartItem } from "@/features/cart/types";
import { loadCart, saveCart } from "@/features/cart/storage";
import { formatCop } from "@/lib/format";

interface CatalogProps {
  token: string;
  products: Product[];
  settings: Settings;
}

function cheapestPrice(product: Product): number | null {
  if (product.sizes.length === 0) return null;
  return product.sizes.reduce(
    (min, s) => (s.price_cents < min ? s.price_cents : min),
    product.sizes[0]!.price_cents,
  );
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

interface QuickChip {
  label: string;
  keywords: string[] | null;
}

const QUICK_CHIPS: QuickChip[] = [
  { label: "Todas", keywords: null },
  { label: "Pollo", keywords: ["pollo"] },
  { label: "Carnes", keywords: ["carne", "chorizo", "tocineta", "costilla"] },
  { label: "Peperoni", keywords: ["peperoni", "pepernata"] },
  { label: "Mariscos", keywords: ["camaron"] },
  { label: "Vegetariana", keywords: ["vegetar", "napolitan", "hawaian"] },
];

function matchesChip(product: Product, chip: QuickChip): boolean {
  if (!chip.keywords) return true;
  const haystack = normalize(
    `${product.name} ${product.description ?? ""}`,
  );
  return chip.keywords.some((k) => haystack.includes(k));
}

export function Catalog({ token, products, settings }: CatalogProps) {
  const [cart, setCart] = useState<CartItem[] | null>(null);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chipIdx, setChipIdx] = useState(0);

  const normalizedQuery = normalize(query);
  const activeChip = QUICK_CHIPS[chipIdx] ?? QUICK_CHIPS[0];
  const filteredProducts = products.filter((p) => {
    if (!matchesChip(p, activeChip!)) return false;
    if (!normalizedQuery) return true;
    const haystack = normalize(`${p.name} ${p.description ?? ""}`);
    return haystack.includes(normalizedQuery);
  });

  useEffect(() => {
    // hidratamos desde localStorage tras el mount para evitar mismatch SSR/CSR
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(loadCart());
  }, []);

  function persist(next: CartItem[]) {
    setCart(next);
    saveCart(next);
  }

  const cartItems: CartItem[] = cart ?? [];

  function addToCart(item: CartItem) {
    const next = [...cartItems, item];
    persist(next);
    setActiveProduct(null);
    toast.success("Agregado al carrito");
  }

  function removeFromCart(index: number) {
    const next = cartItems.filter((_, i) => i !== index);
    persist(next);
  }

  function clearCart() {
    persist([]);
  }

  const cartCount = cartItems.reduce((sum, it) => sum + it.qty, 0);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex flex-col gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-xl text-primary md:text-2xl">
            {settings.business_name}
          </h1>
          <div className="size-9" aria-hidden />
        </div>

        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pizza o ingrediente…"
            aria-label="Buscar"
            className="h-11 pr-9 pl-9"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6">
          {QUICK_CHIPS.map((chip, i) => {
            const active = i === chipIdx;
            return (
              <button
                type="button"
                key={chip.label}
                onClick={() => setChipIdx(i)}
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-pressed={active}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1 px-4 py-6 pb-32 md:px-6">
        {filteredProducts.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
            <p className="font-serif text-lg text-foreground">Sin resultados</p>
            <p className="text-sm text-muted-foreground">
              Intenta otra búsqueda o toca una categoría diferente.
            </p>
          </div>
        ) : (
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {filteredProducts.map((product) => {
            const min = cheapestPrice(product);
            return (
              <Card
                key={product.id}
                onClick={() => setActiveProduct(product)}
                className="cursor-pointer overflow-hidden p-0 transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-square w-full bg-muted">
                  {product.image_url ? (
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-6xl">
                      <span aria-hidden>🍕</span>
                    </div>
                  )}
                </div>
                <CardHeader className="gap-1 px-4 pt-4">
                  <CardTitle className="font-serif text-lg">
                    {product.name}
                  </CardTitle>
                  {product.description ? (
                    <CardDescription className="line-clamp-2 text-sm">
                      {product.description}
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {min !== null ? (
                    <p className="font-medium text-primary">
                      Desde {formatCop(min)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sin tamaños configurados
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}
      </main>

      {cartCount > 0 ? (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          aria-label={`Ver carrito (${cartCount})`}
          className="fixed right-4 bottom-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:right-8 md:bottom-8"
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <ShoppingCart className="size-6" aria-hidden />
          <span className="absolute -top-1 -right-1 inline-flex min-w-6 items-center justify-center rounded-full bg-secondary px-1.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            {cartCount}
          </span>
        </button>
      ) : null}

      <Sheet
        open={activeProduct !== null}
        onOpenChange={(open) => {
          if (!open) setActiveProduct(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="h-[92dvh] w-full max-w-none overflow-hidden p-0 sm:max-w-none md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[28rem] md:max-w-[28rem] md:border-l"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{activeProduct?.name ?? "Producto"}</SheetTitle>
          </SheetHeader>
          {activeProduct ? (
            <PizzaBuilder
              key={activeProduct.id}
              product={activeProduct}
              allProducts={products}
              onAdd={addToCart}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <CartSheet
        open={isCartOpen}
        onOpenChange={setIsCartOpen}
        items={cartItems}
        token={token}
        onRemove={removeFromCart}
        onClear={clearCart}
      />
    </div>
  );
}
