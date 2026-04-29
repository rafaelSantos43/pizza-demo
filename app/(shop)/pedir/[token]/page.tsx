import type { Metadata } from "next";

import {
  getSettings,
  listActiveProductsWithSizes,
} from "@/features/catalog/queries";
import { verifyToken } from "@/features/order-tokens/verify";
import { Catalog } from "@/components/shop/catalog";
import { ExpiredTokenNotice } from "@/components/shop/expired-token-notice";

export const metadata: Metadata = {
  title: "Pedir | Pizza Demo",
};

export default async function PedirPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verify = await verifyToken(token);

  if (!verify.ok) {
    if (verify.reason === "expired" || verify.reason === "used") {
      return <ExpiredTokenNotice token={token} reason={verify.reason} />;
    }
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="font-serif text-3xl text-foreground md:text-4xl">
          Enlace inválido
        </h1>
        <p className="max-w-md text-base text-muted-foreground md:text-lg">
          Este enlace no es válido. Escríbenos por WhatsApp para recibir uno
          nuevo.
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
