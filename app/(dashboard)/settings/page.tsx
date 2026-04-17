import type { Metadata } from "next";

import { requireStaff } from "@/features/auth/guards";

export const metadata: Metadata = {
  title: "Configuración | Pizza Demo",
};

export default async function SettingsPage() {
  await requireStaff();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="font-serif text-3xl text-foreground">Configuración</h1>
      <p className="text-muted-foreground">
        Configuración del restaurante — próximamente.
      </p>
    </div>
  );
}
