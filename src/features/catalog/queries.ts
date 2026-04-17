import "server-only";

import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

import { DEMO_PRODUCTS } from "./demo-fixtures";
import {
  SIZE_ORDER,
  type PizzaSize,
  type Product,
  type ProductSize,
  type Settings,
} from "./types";

interface RawProductRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  max_flavors: number;
  min_size_for_multiflavor: PizzaSize | null;
  active: boolean;
  product_sizes: { size: PizzaSize; price_cents: number }[] | null;
}

const PRODUCT_SELECT =
  "id, name, category, description, image_url, max_flavors, min_size_for_multiflavor, active, product_sizes(size, price_cents)";

function mapRow(row: RawProductRow): Product {
  const sizes: ProductSize[] = (row.product_sizes ?? [])
    .slice()
    .sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    image_url: row.image_url,
    max_flavors: row.max_flavors,
    min_size_for_multiflavor: row.min_size_for_multiflavor,
    active: row.active,
    sizes,
  };
}

export async function listActiveProductsWithSizes(): Promise<Product[]> {
  if (isDemoMode()) {
    return DEMO_PRODUCTS.filter((p) => p.active);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => mapRow(row as RawProductRow));
}

export async function listAllProducts(): Promise<Product[]> {
  if (isDemoMode()) {
    return [...DEMO_PRODUCTS].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => mapRow(row as RawProductRow));
}

export async function getProduct(id: string): Promise<Product | null> {
  if (isDemoMode()) {
    return DEMO_PRODUCTS.find((p) => p.id === id) ?? null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapRow(data as RawProductRow);
}

export async function getSettings(): Promise<Settings> {
  if (isDemoMode()) {
    return {
      business_name: "Pizza Demo",
      payment_accounts: {
        nequi: "300 123 4567",
        bancolombia: "1234 5678 9012",
        llave: "@pizza-demo",
      },
      delivery_zones: [
        { zone: "A", eta_min: 30 },
        { zone: "B", eta_min: 45 },
      ],
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("settings")
    .select("business_name, payment_accounts, delivery_zones")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Settings row not found");

  const row = data as {
    business_name: string;
    payment_accounts: Settings["payment_accounts"] | null;
    delivery_zones: Settings["delivery_zones"] | null;
  };

  return {
    business_name: row.business_name,
    payment_accounts: row.payment_accounts ?? {},
    delivery_zones: row.delivery_zones ?? [],
  };
}
