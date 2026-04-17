import type { Metadata } from "next";

import { MenuList } from "@/components/dashboard/menu-list";
import { requireStaff } from "@/features/auth/guards";
import { listAllProducts } from "@/features/catalog/queries";

export const metadata: Metadata = {
  title: "Menú | Pizza Demo",
};

export default async function MenuPage() {
  await requireStaff({ roles: ["admin"] });
  const products = await listAllProducts();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <MenuList initial={products} />
    </div>
  );
}
