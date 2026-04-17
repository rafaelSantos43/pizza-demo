import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentStaff } from "@/features/auth/queries";

export const metadata: Metadata = {
  title: "Entrar | Pizza Demo",
};

export default async function LoginPage() {
  const staff = await getCurrentStaff();
  if (staff) {
    redirect("/pedidos");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/20 px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-serif text-3xl text-primary">Pizza Demo</h1>
          <p className="text-sm text-muted-foreground">
            Ingresa con tu correo
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
