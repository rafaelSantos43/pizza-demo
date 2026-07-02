import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { BrandMark } from "@/components/shared/brand-mark";
import { BRAND_NAME, BRAND_TAGLINE, pageTitle } from "@/config/brand";
import { getCurrentStaff } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: pageTitle("Entrar"),
};

const ERROR_MESSAGES: Record<string, string> = {
  disabled: "Tu cuenta está desactivada. Contacta al administrador.",
  callback: "El enlace expiró o no es válido. Pide uno nuevo.",
  no_code: "El enlace no se pudo procesar. Pide uno nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (staff) {
    redirect(staff.role === "driver" ? "/mensajero" : "/pedidos");
  }

  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/20 px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3">
            <BrandMark className="size-12" fallbackTextClassName="text-xl" />
            <span className="flex flex-col items-start">
              <h1 className="font-serif text-2xl font-bold leading-none text-primary">
                {BRAND_NAME}
              </h1>
              <span
                aria-hidden
                className="mt-1 text-[11px] italic tracking-[0.08em] text-muted-foreground/80"
              >
                {BRAND_TAGLINE}
              </span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Te enviamos un enlace a tu correo
          </p>
        </div>
        {errorMessage ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
