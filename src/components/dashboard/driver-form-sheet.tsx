"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createDriver, updateDriver } from "@/features/staff/actions";

// ─── Schemas locales del form (UI) ──────────────────────────────────
// El usuario teclea solo los 10 dígitos locales; el "+57" lo pone el form
// antes de llamar a la action, que sigue validando E.164 server-side.

const PHONE_PREFIX = "+57";
const phoneLocal = z
  .string()
  .regex(/^\d{10}$/, "10 dígitos sin espacios");

const createUiSchema = z.object({
  email: z.email("Email inválido"),
  display_name: z.string().min(2, "Nombre muy corto").max(80),
  phoneLocal,
});

const editUiSchema = z.object({
  id: z.uuid(),
  display_name: z.string().min(2, "Nombre muy corto").max(80),
  phoneLocal,
});

type CreateUiInput = z.infer<typeof createUiSchema>;
type EditUiInput = z.infer<typeof editUiSchema>;

// Quita el prefijo +57 del phone almacenado (E.164) para mostrarlo en el form.
// Si por alguna razón el phone existente NO empieza con +57, lo dejamos vacío
// para forzar al admin a re-capturarlo en lugar de mostrar un valor truncado.
function stripPrefix(phone: string | null): string {
  if (!phone) return "";
  if (!phone.startsWith(PHONE_PREFIX)) return "";
  return phone.slice(PHONE_PREFIX.length);
}

// ─── Tipos y defaults ───────────────────────────────────────────────

interface DriverInitial {
  id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
}

interface DriverFormSheetProps {
  mode: "create" | "edit";
  open: boolean;
  onClose: () => void;
  initial?: DriverInitial;
}

const CREATE_DEFAULTS: CreateUiInput = {
  email: "",
  display_name: "",
  phoneLocal: "",
};

function editDefaults(initial: DriverInitial | undefined): EditUiInput {
  return {
    id: initial?.id ?? "",
    display_name: initial?.display_name ?? "",
    phoneLocal: stripPrefix(initial?.phone ?? null),
  };
}

// Adornment compuesto: "+57" fijo a la izquierda + input de 10 dígitos.
function PhoneInput({
  value,
  onChange,
  onBlur,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  name: string;
}) {
  return (
    <div className="flex h-11 items-stretch overflow-hidden rounded-md border border-input bg-transparent shadow-xs focus-within:ring-2 focus-within:ring-ring/30">
      <span className="flex select-none items-center border-r border-input bg-muted/40 px-3 text-sm text-muted-foreground">
        {PHONE_PREFIX}
      </span>
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="3001234567"
        maxLength={10}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        onBlur={onBlur}
        className="h-full border-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

// ─── Componente: Sheet con form RHF + Zod ───────────────────────────

export function DriverFormSheet({
  mode,
  open,
  onClose,
  initial,
}: DriverFormSheetProps) {
  if (mode === "create") {
    return <CreateDriverForm open={open} onClose={onClose} />;
  }
  return <EditDriverForm open={open} onClose={onClose} initial={initial} />;
}

function CreateDriverForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateUiInput>({
    resolver: zodResolver(createUiSchema),
    defaultValues: CREATE_DEFAULTS,
  });

  // Reset al abrir/cerrar para no arrastrar valores entre aperturas.
  useEffect(() => {
    if (open) form.reset(CREATE_DEFAULTS);
  }, [open, form]);

  function submit(values: CreateUiInput) {
    startTransition(async () => {
      const res = await createDriver({
        email: values.email,
        display_name: values.display_name,
        phone: `${PHONE_PREFIX}${values.phoneLocal}`,
      });
      if (res.ok) {
        toast.success(
          "Mensajero creado. Pídele que entre a /login con su correo.",
        );
        router.refresh();
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-serif text-2xl text-foreground">
            Nuevo mensajero
          </SheetTitle>
          <SheetDescription>
            Crea la cuenta. Después podrá iniciar sesión con magic link en
            /login.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="name"
                        placeholder="Carlos Pérez"
                        className="h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="carlos@ejemplo.com"
                        className="h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Recibirá el magic link en este correo.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phoneLocal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <PhoneInput
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormDescription>
                      10 dígitos. El prefijo +57 ya está incluido.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="sticky bottom-0 border-t border-border bg-card px-5 py-4">
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={pending}
                  className="min-h-11"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  disabled={pending}
                  className="min-h-11"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Crear mensajero
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

function EditDriverForm({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: DriverInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<EditUiInput>({
    resolver: zodResolver(editUiSchema),
    defaultValues: editDefaults(initial),
  });

  // Re-hidratar cuando cambia el driver objetivo o se reabre el sheet.
  useEffect(() => {
    if (open) form.reset(editDefaults(initial));
  }, [open, initial, form]);

  function submit(values: EditUiInput) {
    startTransition(async () => {
      const res = await updateDriver({
        id: values.id,
        display_name: values.display_name,
        phone: `${PHONE_PREFIX}${values.phoneLocal}`,
      });
      if (res.ok) {
        toast.success("Datos actualizados");
        router.refresh();
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-serif text-2xl text-foreground">
            Editar mensajero
          </SheetTitle>
          <SheetDescription>
            Actualiza el nombre o teléfono. El email no se puede cambiar.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="name"
                        placeholder="Carlos Pérez"
                        className="h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    inputMode="email"
                    value={initial?.email ?? ""}
                    readOnly
                    disabled
                    className="h-11 bg-muted/40"
                  />
                </FormControl>
                <FormDescription>
                  El email es inmutable. Si cambia, crea otra cuenta y
                  desactiva esta.
                </FormDescription>
              </FormItem>

              <FormField
                control={form.control}
                name="phoneLocal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <PhoneInput
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormDescription>
                      10 dígitos. El prefijo +57 ya está incluido.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="sticky bottom-0 border-t border-border bg-card px-5 py-4">
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={pending}
                  className="min-h-11"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  disabled={pending}
                  className="min-h-11"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Guardar cambios
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
