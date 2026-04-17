"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLOWED_PROOF_MIME,
  MAX_PROOF_BYTES,
} from "@/features/payments/schemas";
import type { Settings } from "@/features/catalog/types";
import type { CartItem } from "@/features/cart/types";
import { clearStoredCart, loadCart } from "@/features/cart/storage";
import { createOrder } from "@/features/orders/actions";
import { uploadProofByToken } from "@/features/cart/upload-proof-by-token";
import { compressImage } from "@/lib/compress-image";
import { formatCop } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = ["cash", "bancolombia", "nequi", "llave"] as const;

const checkoutFormSchema = z
  .object({
    customerName: z.string().min(1, "Tu nombre es obligatorio"),
    street: z.string().min(1, "La dirección es obligatoria"),
    complex_name: z.string().optional(),
    tower: z.string().optional(),
    apartment: z.string().optional(),
    neighborhood: z.string().optional(),
    references: z.string().optional(),
    zone: z.string().min(1, "Selecciona la zona"),
    paymentMethod: z.enum(PAYMENT_METHODS),
    notes: z.string().optional(),
    acceptedPolicies: z.literal(true, {
      message: "Debes aceptar las políticas",
    }),
  });

type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;

const PAYMENT_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Efectivo",
  bancolombia: "Bancolombia",
  nequi: "Nequi",
  llave: "Llave",
};

interface CheckoutFormProps {
  token: string;
  settings: Settings;
}

export function CheckoutForm({ token, settings }: CheckoutFormProps) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[] | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // hidratamos desde localStorage tras el mount para evitar mismatch SSR/CSR
    setCart(loadCart());
  }, []);

  const cartItems: CartItem[] = cart ?? [];

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      customerName: "",
      street: "",
      complex_name: "",
      tower: "",
      apartment: "",
      neighborhood: "",
      references: "",
      zone: settings.delivery_zones[0]?.zone ?? "",
      paymentMethod: "cash",
      notes: "",
      acceptedPolicies: false as unknown as true,
    },
  });

  const { register, handleSubmit, control, watch, formState } = form;
  const paymentMethod = watch("paymentMethod");
  const needsProof = paymentMethod !== "cash";

  const total = cartItems.reduce(
    (sum, it) => sum + it.unitPriceCents * it.qty,
    0,
  );

  function handleProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setProofError(null);
    if (!file) {
      setProofFile(null);
      return;
    }
    if (!(ALLOWED_PROOF_MIME as readonly string[]).includes(file.type)) {
      setProofError("Formato no válido (jpg, png o webp)");
      setProofFile(null);
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      setProofError("El archivo supera 5 MB");
      setProofFile(null);
      return;
    }
    setProofFile(file);
  }

  async function onSubmit(values: CheckoutFormValues) {
    if (cartItems.length === 0) {
      toast.error("Tu carrito está vacío");
      return;
    }

    setSubmitting(true);
    try {
      let proofPath: string | undefined;

      if (values.paymentMethod !== "cash" && proofFile) {
        const compressed = await compressImage(proofFile);
        const fd = new FormData();
        fd.set("token", token);
        fd.set("file", compressed);
        const uploadResult = await uploadProofByToken(fd);
        if (!uploadResult.ok) {
          toast.error(uploadResult.error);
          setSubmitting(false);
          return;
        }
        proofPath = uploadResult.data.path;
      }

      const orderResult = await createOrder({
        token,
        customerName: values.customerName.trim(),
        addressInput: {
          street: values.street.trim(),
          complex_name: values.complex_name?.trim() || undefined,
          tower: values.tower?.trim() || undefined,
          apartment: values.apartment?.trim() || undefined,
          neighborhood: values.neighborhood?.trim() || undefined,
          references: values.references?.trim() || undefined,
          zone: values.zone,
        },
        items: cartItems.map((it) => ({
          productId: it.productId,
          size: it.size,
          qty: it.qty,
          flavors:
            it.flavors.length > 0
              ? it.flavors.map((f) => f.productId)
              : undefined,
          notes: it.notes || undefined,
        })),
        paymentMethod: values.paymentMethod,
        paymentProofPath: proofPath,
        notes: values.notes?.trim() || undefined,
      });

      if (!orderResult.ok) {
        toast.error(orderResult.error);
        setSubmitting(false);
        return;
      }

      clearStoredCart();
      router.push(
        `/pedir/${token}/gracias?id=${orderResult.data.orderId}`,
      );
    } catch {
      toast.error("Algo salió mal. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  if (cart !== null && cartItems.length === 0) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <span className="text-5xl" aria-hidden>
          🍕
        </span>
        <h1 className="font-serif text-2xl text-foreground">
          Tu carrito está vacío
        </h1>
        <Button asChild>
          <Link href={`/pedir/${token}`}>Volver al catálogo</Link>
        </Button>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Volver">
          <Link href={`/pedir/${token}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="font-serif text-xl text-primary md:text-2xl">
          Confirmar pedido
        </h1>
      </header>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex-1 px-4 py-6 pb-40 md:px-6"
      >
        <div className="mx-auto flex max-w-xl flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Resumen del pedido
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {cartItems.map((it, idx) => (
                <div key={idx} className="flex items-baseline justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {it.qty} × {it.productName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {it.sizeLabel}
                    </p>
                    {it.flavors.length >= 1 ? (
                      <p className="text-xs text-muted-foreground">
                        {it.flavors.map((f) => f.name).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="tabular-nums">
                    {formatCop(it.unitPriceCents * it.qty)}
                  </span>
                </div>
              ))}
              <Separator />
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-serif text-2xl text-foreground tabular-nums">
                  {formatCop(total)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Los precios con mitad y mitad toman el valor más alto de los
                sabores.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Tus datos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <Label htmlFor="customerName">Nombre completo</Label>
                <Input
                  id="customerName"
                  {...register("customerName")}
                  className="mt-1"
                />
                {formState.errors.customerName ? (
                  <p className="mt-1 text-xs text-destructive">
                    {formState.errors.customerName.message}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Dirección de entrega
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <Label htmlFor="street">Dirección (calle / carrera)</Label>
                <Input
                  id="street"
                  placeholder="Cll 63b # 105-95"
                  {...register("street")}
                  className="mt-1"
                />
                {formState.errors.street ? (
                  <p className="mt-1 text-xs text-destructive">
                    {formState.errors.street.message}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="complex_name">Conjunto / edificio</Label>
                  <Input
                    id="complex_name"
                    {...register("complex_name")}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="tower">Torre</Label>
                  <Input id="tower" {...register("tower")} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="apartment">Apartamento / casa</Label>
                  <Input
                    id="apartment"
                    {...register("apartment")}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="neighborhood">Barrio</Label>
                  <Input
                    id="neighborhood"
                    {...register("neighborhood")}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="references">Referencias / indicaciones</Label>
                <Textarea
                  id="references"
                  rows={2}
                  {...register("references")}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="zone">Zona de entrega</Label>
                <Controller
                  control={control}
                  name="zone"
                  render={({ field }) => (
                    <select
                      id="zone"
                      value={field.value}
                      onChange={field.onChange}
                      className="mt-1 h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {settings.delivery_zones.length === 0 ? (
                        <option value="">Sin zonas configuradas</option>
                      ) : (
                        settings.delivery_zones.map((z) => (
                          <option key={z.zone} value={z.zone}>
                            {z.zone} (~{z.eta_min} min)
                          </option>
                        ))
                      )}
                    </select>
                  )}
                />
                {formState.errors.zone ? (
                  <p className="mt-1 text-xs text-destructive">
                    {formState.errors.zone.message}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Método de pago
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid grid-cols-2 gap-2"
                  >
                    {PAYMENT_METHODS.map((m) => {
                      const active = field.value === m;
                      return (
                        <Label
                          key={m}
                          htmlFor={`pm-${m}`}
                          className={cn(
                            "flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-3 text-sm transition-colors",
                            active && "border-primary bg-accent",
                          )}
                        >
                          <span>{PAYMENT_LABEL[m]}</span>
                          <RadioGroupItem id={`pm-${m}`} value={m} />
                        </Label>
                      );
                    })}
                  </RadioGroup>
                )}
              />

              {needsProof ? (
                <div className="mt-2 flex flex-col gap-3 rounded-md border border-dashed border-border bg-muted/40 p-3">
                  <div className="text-sm">
                    <p className="font-medium text-foreground">
                      Cuenta para transferir
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                      {paymentMethod === "nequi" &&
                      settings.payment_accounts.nequi ? (
                        <li>Nequi: {settings.payment_accounts.nequi}</li>
                      ) : null}
                      {paymentMethod === "bancolombia" &&
                      settings.payment_accounts.bancolombia ? (
                        <li>
                          Bancolombia: {settings.payment_accounts.bancolombia}
                        </li>
                      ) : null}
                      {paymentMethod === "llave" &&
                      settings.payment_accounts.llave ? (
                        <li>Llave: {settings.payment_accounts.llave}</li>
                      ) : null}
                    </ul>
                  </div>

                  <div>
                    <Label htmlFor="proofFile">Comprobante de pago</Label>
                    <Input
                      id="proofFile"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleProofChange}
                      className="mt-1"
                    />
                    {proofFile ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {proofFile.name} ·{" "}
                        {Math.round(proofFile.size / 1024)} KB
                      </p>
                    ) : null}
                    {proofError ? (
                      <p className="mt-1 text-xs text-destructive">
                        {proofError}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Sube tu comprobante aquí o envíalo por WhatsApp.
                    </p>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Notas adicionales (opcional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={2}
                placeholder="Sin cebolla, timbre dañado, etc."
                {...register("notes")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start gap-3 pt-6">
              <Controller
                control={control}
                name="acceptedPolicies"
                render={({ field }) => (
                  <Checkbox
                    id="acceptedPolicies"
                    checked={field.value === true}
                    onCheckedChange={(v) => field.onChange(v === true)}
                    className="mt-0.5"
                  />
                )}
              />
              <Label
                htmlFor="acceptedPolicies"
                className="text-sm font-normal text-muted-foreground"
              >
                Acepto que una vez confirmado no puedo cambiar el pedido. La
                lechera y los condimentos vienen incluidos. El domicilio ya
                está incluido en el precio.
              </Label>
            </CardContent>
            {formState.errors.acceptedPolicies ? (
              <p className="px-6 pb-4 text-xs text-destructive">
                {formState.errors.acceptedPolicies.message}
              </p>
            ) : null}
          </Card>
        </div>

        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-3 pb-4 backdrop-blur md:px-6"
          style={{
            paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
          }}
        >
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="font-serif text-xl text-foreground tabular-nums">
                {formatCop(total)}
              </span>
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 flex-1 text-base"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                "Confirmar pedido"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
