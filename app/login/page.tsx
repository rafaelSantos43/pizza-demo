import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentStaff } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Entrar | Pizza Demo",
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
        <div className="space-y-2 text-center">
          <h1 className="font-serif text-3xl text-primary">Pizza Demo</h1>
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
