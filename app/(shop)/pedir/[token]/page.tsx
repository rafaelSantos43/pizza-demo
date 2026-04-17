import type { Metadata } from "next";

import {
  getSettings,
  listActiveProductsWithSizes,
} from "@/features/catalog/queries";
import { verifyToken } from "@/features/order-tokens/verify";
import { Catalog } from "@/components/shop/catalog";

export const metadata: Metadata = {
  title: "Pedir | Pizza Demo",
};

const REASON_TITLE: Record<string, string> = {
  malformed: "Enlace inválido",
  invalid_signature: "Enlace inválido",
  not_found: "Enlace inválido",
  expired: "Enlace expirado",
  used: "Enlace ya usado",
};

const REASON_MESSAGE: Record<string, string> = {
  malformed: "Este enlace no es válido.",
  invalid_signature: "Este enlace no es válido.",
  not_found: "Este enlace no es válido.",
  expired:
    "Este enlace expiró. Escríbenos por WhatsApp para recibir uno nuevo.",
  used: "Este enlace ya fue usado. Pide otro por WhatsApp.",
};

export default async function PedirPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verify = await verifyToken(token);

  if (!verify.ok) {
    const title = REASON_TITLE[verify.reason] ?? "Enlace inválido";
    const message = REASON_MESSAGE[verify.reason] ?? "Este enlace no es válido.";
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="font-serif text-3xl text-foreground md:text-4xl">
          {title}
        </h1>
        <p className="max-w-md text-base text-muted-foreground md:text-lg">
          {message}
        </p>
      </main>
    );
  }

  const [products, settings] = await Promise.all([
    listActiveProductsWithSizes(),
    getSettings(),
  ]);

  return <Catalog token={token} products={products} settings={settings} />;
}
