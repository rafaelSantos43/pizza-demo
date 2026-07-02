"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createManualOrderLink } from "@/features/orders/actions";

// ─── Schema local del form (UI) ───────────────────────────────────────
// El usuario teclea solo los 10 dígitos locales; el "+57" se prepende
// antes de llamar a la action, que sigue validando E.164 server-side.

const PHONE_PREFIX = "+57";

const formSchema = z.object({
  phoneLocal: z.string().regex(/^\d{10}$/, "10 dígitos sin espacios"),
  name: z.string().trim().max(80).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ManualOrderSheetProps {
  open: boolean;
  onClose: () => void;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ManualOrderSheet({ open, onClose }: ManualOrderSheetProps) {
  const [mode, setMode] = useState<"form" | "result">("form");
  const [result, setResult] = useState<{ link: string; expiresAt: string } | null>(
    null,
  );
  const [submitting, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { phoneLocal: "", name: "" },
  });

  const { register, handleSubmit, formState, setValue, watch, reset } = form;
  const phoneLocal = watch("phoneLocal");

  function handleClose() {
    reset();
    setMode("form");
    setResult(null);
    onClose();
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await createManualOrderLink({
        phone: PHONE_PREFIX + values.phoneLocal,
        name: values.name?.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
      setMode("result");
    });
  }

  async function handleCopy() {
    if (!result) return;
    const ok = await copyToClipboard(result.link);
    if (ok) toast.success("Link copiado");
    else toast.error("No pudimos copiar. Selecciónalo a mano.");
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? handleClose() : null)}>
      <SheetContent side="right" className="w-full max-w-md p-0 sm:max-w-md">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle className="text-left">Nuevo pedido manual</SheetTitle>
            <SheetDescription className="text-left">
              {mode === "form"
                ? "Genera un link al catálogo para tu cliente. Cópialo y pégalo en WhatsApp."
                : "Link generado, válido 2 horas. Cópialo y pégalo en WhatsApp del cliente."}
            </SheetDescription>
          </SheetHeader>

          {mode === "form" ? (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="flex flex-col gap-5">
                  <div>
                    <Label htmlFor="phoneLocal">Teléfono del cliente</Label>
                    <div className="mt-1 flex h-11 items-stretch overflow-hidden rounded-md border border-input bg-transparent shadow-xs focus-within:ring-2 focus-within:ring-ring/30">
                      <span className="flex select-none items-center border-r border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                        {PHONE_PREFIX}
                      </span>
                      <Input
                        id="phoneLocal"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="3001234567"
                        maxLength={10}
                        value={phoneLocal}
                        onChange={(e) =>
                          setValue(
                            "phoneLocal",
                            e.target.value.replace(/\D/g, ""),
                            { shouldValidate: true },
                          )
                        }
                        className="h-full border-0 shadow-none focus-visible:ring-0"
                      />
                    </div>
                    {formState.errors.phoneLocal ? (
                      <p className="mt-1 text-sm text-destructive">
                        {formState.errors.phoneLocal.message}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <Label htmlFor="name">Nombre (opcional)</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Carlos"
                      maxLength={80}
                      className="mt-1 h-11"
                      {...register("name")}
                    />
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-row gap-2 border-t border-border bg-card px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={submitting}
                  className="flex-1 min-h-11"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  disabled={submitting}
                  className="flex-1 min-h-11"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Generar link
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground">
                    <Check className="size-4 shrink-0 text-success" />
                    <span>Link listo. Cópialo y pégalo en WhatsApp.</span>
                  </div>
                  <div className="rounded-lg border border-secondary/50 bg-secondary/15 px-3 py-3">
                    <p className="font-mono text-sm break-all text-foreground">
                      {result?.link}
                    </p>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-card px-5 py-4">
                <Button
                  type="button"
                  variant="success"
                  onClick={handleCopy}
                  className="min-h-11"
                >
                  <Copy className="size-4" />
                  Copiar al portapapeles
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="min-h-11"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
