"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/features/catalog/actions";
import {
  PIZZA_SIZES,
  PRODUCT_CATEGORIES,
  productInputSchema,
} from "@/features/catalog/schemas";
import { SIZE_LABEL, type Product } from "@/features/catalog/types";
import { formatCop } from "@/lib/format";

// ─── Tipos, defaults y helpers ──────────────────────────────────────

// Trabajamos con el "input" de Zod porque `category` tiene default y RHF
// no debe exigirla como required al primer render.
type FormValues = z.input<typeof productInputSchema>;

const CATEGORY_LABEL: Record<(typeof PRODUCT_CATEGORIES)[number], string> = {
  pizza: "Pizza",
  bebida: "Bebida",
  adicional: "Adicional",
};

const NONE_VALUE = "__none__";

const EMPTY_VALUES: FormValues = {
  name: "",
  category: "pizza",
  description: "",
  image_url: "",
  max_flavors: 1,
  min_size_for_multiflavor: null,
  sizes: PIZZA_SIZES.map((size) => ({ size, price_cents: 0 })),
};

// Completa 5 tamaños aunque el producto en DB tenga menos (el schema exige los 5).
function productToDefaults(product: Product): FormValues {
  const bySize = new Map(product.sizes.map((s) => [s.size, s.price_cents]));
  const category = (PRODUCT_CATEGORIES as readonly string[]).includes(
    product.category ?? "",
  )
    ? (product.category as FormValues["category"])
    : "pizza";
  return {
    name: product.name,
    category,
    description: product.description ?? "",
    image_url: product.image_url ?? "",
    max_flavors: product.max_flavors,
    min_size_for_multiflavor: product.min_size_for_multiflavor,
    sizes: PIZZA_SIZES.map((size) => ({
      size,
      price_cents: bySize.get(size) ?? 0,
    })),
  };
}

// ─── Componente: form RHF + Zod, modo crear/editar ─────────────────

interface ProductFormSheetProps {
  mode: "create" | "edit";
  open: boolean;
  onClose: () => void;
  productId?: string;
  initialProduct?: Product;
}

export function ProductFormSheet({
  mode,
  open,
  onClose,
  productId,
  initialProduct,
}: ProductFormSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(productInputSchema),
    defaultValues:
      mode === "edit" && initialProduct
        ? productToDefaults(initialProduct)
        : EMPTY_VALUES,
  });

  const { register, handleSubmit, control, formState, reset } = form;
  const descriptionValue = useWatch({ control, name: "description" }) ?? "";

  // Re-hidratamos cuando cambia el producto a editar o cuando se abre de nuevo.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialProduct) {
      reset(productToDefaults(initialProduct));
    } else {
      reset(EMPTY_VALUES);
    }
  }, [open, mode, initialProduct, reset]);

  function submit(values: FormValues) {
    startTransition(async () => {
      if (mode === "create") {
        const res = await createProduct(values);
        if (res.ok) {
          toast.success("Producto creado");
          router.refresh();
          onClose();
        } else {
          toast.error(res.error);
        }
        return;
      }

      if (!productId) {
        toast.error("No se puede actualizar sin id");
        return;
      }
      const res = await updateProduct({ id: productId, ...values });
      if (res.ok) {
        toast.success("Producto actualizado");
        router.refresh();
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDelete() {
    if (!productId) return;
    if (
      !window.confirm(
        "¿Eliminar? (desactiva el producto, no borra histórico)",
      )
    ) {
      return;
    }
    startDeleteTransition(async () => {
      const res = await deleteProduct(productId);
      if (res.ok) {
        toast.success("Producto eliminado");
        router.refresh();
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  const busy = pending || deleting;
  const descriptionCount = descriptionValue.length;

  // ─── Render: sheet con form, footer fijo con CTAs ─────────────────
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
            {mode === "create" ? "Nuevo producto" : "Editar producto"}
          </SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? "Agrega un producto al catálogo con sus precios por tamaño."
              : "Actualiza los datos y precios del producto."}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(submit)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  maxLength={80}
                  {...register("name")}
                  placeholder="Hawaiana"
                />
                {formState.errors.name ? (
                  <p className="text-sm text-destructive">
                    {formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Categoría</Label>
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "pizza"}
                      onValueChange={(v) =>
                        field.onChange(v as FormValues["category"])
                      }
                    >
                      <SelectTrigger id="category" className="h-11 w-full">
                        <SelectValue placeholder="Categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description">Descripción</Label>
                  <span className="text-xs text-muted-foreground">
                    {descriptionCount}/280
                  </span>
                </div>
                <Textarea
                  id="description"
                  rows={3}
                  maxLength={280}
                  {...register("description")}
                  placeholder="Jamón, piña y queso mozzarella."
                />
                {formState.errors.description ? (
                  <p className="text-sm text-destructive">
                    {formState.errors.description.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="image_url">URL de imagen</Label>
                <Input
                  id="image_url"
                  type="url"
                  inputMode="url"
                  placeholder="https://..."
                  {...register("image_url", {
                    setValueAs: (v) =>
                      typeof v === "string" && v.trim() === "" ? null : v,
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Pega un enlace a la imagen del producto (Imgur, Cloudinary,
                  etc.).
                </p>
                {formState.errors.image_url ? (
                  <p className="text-sm text-destructive">
                    {formState.errors.image_url.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="max_flavors">Máximo de sabores</Label>
                <Input
                  id="max_flavors"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={4}
                  {...register("max_flavors", { valueAsNumber: true })}
                />
                {formState.errors.max_flavors ? (
                  <p className="text-sm text-destructive">
                    {formState.errors.max_flavors.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="min_size_for_multiflavor">
                  Tamaño mínimo para mitad y mitad
                </Label>
                <Controller
                  control={control}
                  name="min_size_for_multiflavor"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE_VALUE}
                      onValueChange={(v) =>
                        field.onChange(
                          v === NONE_VALUE
                            ? null
                            : (v as FormValues["min_size_for_multiflavor"]),
                        )
                      }
                    >
                      <SelectTrigger
                        id="min_size_for_multiflavor"
                        className="h-11 w-full"
                      >
                        <SelectValue placeholder="Selecciona una opción" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>No aplica</SelectItem>
                        {PIZZA_SIZES.map((size) => (
                          <SelectItem key={size} value={size}>
                            {SIZE_LABEL[size]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Si permites mitad y mitad, escoge el tamaño más pequeño que
                  lo soporta. Si no, deja &quot;No aplica&quot;.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Label>Precios por tamaño</Label>
                <PriceGrid control={control} register={register} errors={formState.errors} />
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-border bg-card px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              {mode === "edit" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={busy}
                  className="min-h-11"
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Eliminar
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={busy}
                  className="min-h-11"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy} className="min-h-11">
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function PriceGrid({
  control,
  register,
  errors,
}: {
  control: ReturnType<typeof useForm<FormValues>>["control"];
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
}) {
  const sizes = useWatch({ control, name: "sizes" });
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {PIZZA_SIZES.map((size, idx) => {
        const rawValue = sizes?.[idx]?.price_cents;
        const preview =
          typeof rawValue === "number" && !Number.isNaN(rawValue)
            ? formatCop(rawValue)
            : "—";
        const err = errors.sizes?.[idx]?.price_cents?.message;
        return (
          <div key={size} className="flex flex-col gap-1">
            <Label htmlFor={`size-${size}`} className="font-serif text-sm">
              {SIZE_LABEL[size]}
            </Label>
            <Input
              id={`size-${size}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              {...register(`sizes.${idx}.price_cents`, {
                valueAsNumber: true,
              })}
            />
            <input
              type="hidden"
              value={size}
              {...register(`sizes.${idx}.size`)}
            />
            <span className="text-xs text-muted-foreground">{preview}</span>
            {err ? <span className="text-xs text-destructive">{err}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
