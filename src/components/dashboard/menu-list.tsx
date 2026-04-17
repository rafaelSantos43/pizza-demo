"use client";

import {
  MoreVertical,
  Pizza,
  Plus,
  Search,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ProductFormSheet } from "@/components/dashboard/product-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteProduct,
  toggleProductActive,
} from "@/features/catalog/actions";
import { PRODUCT_CATEGORIES } from "@/features/catalog/schemas";
import { SIZE_LABEL, type Product } from "@/features/catalog/types";
import { formatCop } from "@/lib/format";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | (typeof PRODUCT_CATEGORIES)[number];

const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pizza", label: "Pizza" },
  { value: "bebida", label: "Bebida" },
  { value: "adicional", label: "Adicional" },
];

const CATEGORY_LABEL: Record<(typeof PRODUCT_CATEGORIES)[number], string> = {
  pizza: "Pizza",
  bebida: "Bebida",
  adicional: "Adicional",
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function priceRange(product: Product): string {
  if (product.sizes.length === 0) return "—";
  const prices = product.sizes.map((s) => s.price_cents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return formatCop(min);
  return `${formatCop(min)} – ${formatCop(max)}`;
}

function primarySize(product: Product): string | null {
  const first = product.sizes[0];
  return first ? SIZE_LABEL[first.size] : null;
}

interface MenuListProps {
  initial: Product[];
}

export function MenuList({ initial }: MenuListProps) {
  const router = useRouter();
  const products = initial;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  const normalizedQuery = normalize(query);
  const filtered = products.filter((p) => {
    if (!showInactive && !p.active) return false;
    if (category !== "all" && p.category !== category) return false;
    if (normalizedQuery && !normalize(p.name).includes(normalizedQuery)) {
      return false;
    }
    return true;
  });

  const editingProduct = editingId
    ? products.find((p) => p.id === editingId)
    : undefined;

  function handleToggleActive(product: Product, next: boolean) {
    startTransition(async () => {
      const res = await toggleProductActive({ id: product.id, active: next });
      if (res.ok) {
        toast.success(next ? "Producto activado" : "Producto desactivado");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDelete(product: Product) {
    if (
      !window.confirm(
        "¿Eliminar? (desactiva el producto, no borra histórico)",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteProduct(product.id);
      if (res.ok) {
        toast.success("Producto eliminado");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const hasAnyProducts = products.length > 0;

  return (
    <>
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl text-foreground">Menú</h1>
          <p className="text-muted-foreground">
            Gestiona los productos que ven tus clientes.
          </p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="hidden min-h-11 md:inline-flex"
        >
          <Plus className="size-4" />
          Agregar producto
        </Button>
      </header>

      {hasAnyProducts ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre…"
                className="h-11 pl-9"
                aria-label="Buscar productos"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {CATEGORY_TABS.map((tab) => {
                const active = tab.value === category;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setCategory(tab.value)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
                      active
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    aria-pressed={active}
                  >
                    {tab.label}
                  </button>
                );
              })}

              <label className="ml-auto flex min-h-11 items-center gap-2 rounded-full bg-muted/40 px-4 text-sm text-foreground">
                <Switch
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                  aria-label="Mostrar inactivos"
                />
                Mostrar inactivos
              </label>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
              Sin resultados. Ajusta los filtros.
            </div>
          ) : (
            <>
              <MobileList
                products={filtered}
                onEdit={setEditingId}
                onToggleActive={handleToggleActive}
                pending={pending}
              />
              <DesktopTable
                products={filtered}
                onEdit={setEditingId}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                pending={pending}
              />
            </>
          )}
        </>
      ) : (
        <EmptyState onCreate={() => setIsCreating(true)} />
      )}

      <button
        type="button"
        onClick={() => setIsCreating(true)}
        className="fixed right-4 bottom-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        style={{
          bottom: "calc(1rem + env(safe-area-inset-bottom))",
        }}
        aria-label="Agregar producto"
      >
        <Plus className="size-6" />
      </button>

      <ProductFormSheet
        mode="create"
        open={isCreating}
        onClose={() => setIsCreating(false)}
      />
      <ProductFormSheet
        mode="edit"
        open={editingProduct !== undefined}
        onClose={() => setEditingId(null)}
        productId={editingProduct?.id}
        initialProduct={editingProduct}
      />
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-secondary/60 text-secondary-foreground">
        <Pizza className="size-7" />
      </div>
      <h2 className="font-serif text-xl text-foreground">
        Tu menú está vacío
      </h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Agrega el primer producto para que tus clientes puedan pedirlo.
      </p>
      <Button onClick={onCreate} className="mt-2 min-h-11">
        <Plus className="size-4" />
        Agregar primer producto
      </Button>
    </Card>
  );
}

function ProductImage({ product }: { product: Product }) {
  if (!product.image_url) {
    return (
      <div
        className="flex size-14 shrink-0 items-center justify-center rounded-md bg-secondary/50 text-xl"
        aria-hidden
      >
        🍕
      </div>
    );
  }
  return (
    <Image
      src={product.image_url}
      alt=""
      width={56}
      height={56}
      unoptimized
      className="size-14 shrink-0 rounded-md object-cover"
    />
  );
}

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

function RowActions({ onEdit, onDelete, disabled }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Acciones"
          disabled={disabled}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>
        <DropdownMenuItem disabled>Duplicar</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive focus:text-destructive"
        >
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ListProps {
  products: Product[];
  onEdit: (id: string) => void;
  onToggleActive: (product: Product, next: boolean) => void;
  pending: boolean;
}

function MobileList({
  products,
  onEdit,
  onToggleActive,
  pending,
}: ListProps) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {products.map((product) => (
        <Card
          key={product.id}
          className="gap-3 p-4"
          onClick={() => onEdit(product.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onEdit(product.id);
            }
          }}
        >
          <div className="flex items-start gap-3">
            <ProductImage product={product} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-serif text-lg text-foreground">
                {product.name}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {product.category ? (
                  <Badge variant="secondary" className="capitalize">
                    {CATEGORY_LABEL[
                      product.category as keyof typeof CATEGORY_LABEL
                    ] ?? product.category}
                  </Badge>
                ) : null}
                {!product.active ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactivo
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-foreground/80">
                {priceRange(product)}
                {product.sizes.length === 1 && primarySize(product) ? (
                  <span className="text-muted-foreground">
                    {" "}· {primarySize(product)}
                  </span>
                ) : null}
              </p>
            </div>
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex items-center"
            >
              <Switch
                checked={product.active}
                onCheckedChange={(next) => onToggleActive(product, next)}
                disabled={pending}
                aria-label={
                  product.active ? "Desactivar producto" : "Activar producto"
                }
              />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DesktopTable({
  products,
  onEdit,
  onToggleActive,
  onDelete,
  pending,
}: ListProps & { onDelete: (product: Product) => void }) {
  return (
    <div className="hidden rounded-lg border border-border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[72px]">Imagen</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Precios</TableHead>
            <TableHead>Activo</TableHead>
            <TableHead className="w-12 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow
              key={product.id}
              className="cursor-pointer"
              onClick={() => onEdit(product.id)}
            >
              <TableCell>
                <ProductImage product={product} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {product.name}
                  </span>
                  {product.description ? (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {product.description}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                {product.category ? (
                  <Badge variant="secondary" className="capitalize">
                    {CATEGORY_LABEL[
                      product.category as keyof typeof CATEGORY_LABEL
                    ] ?? product.category}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {priceRange(product)}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={product.active}
                  onCheckedChange={(next) => onToggleActive(product, next)}
                  disabled={pending}
                  aria-label={
                    product.active
                      ? "Desactivar producto"
                      : "Activar producto"
                  }
                />
              </TableCell>
              <TableCell
                className="text-right"
                onClick={(e) => e.stopPropagation()}
              >
                <RowActions
                  onEdit={() => onEdit(product.id)}
                  onDelete={() => onDelete(product)}
                  disabled={pending}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
