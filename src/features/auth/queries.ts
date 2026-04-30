import "server-only";

import { createClient } from "@/lib/supabase/server";

export type StaffRole = "admin" | "cashier" | "kitchen" | "driver";

export interface CurrentStaff {
  id: string;
  email: string | null;
  role: StaffRole;
  displayName: string | null;
}

export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (error) return null;

  const profile = data as { role: StaffRole; display_name: string | null } | null;
  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile.role,
    displayName: profile.display_name,
  };
}

export interface ActiveDriver {
  id: string;
  displayName: string;
}

export async function listActiveDrivers(): Promise<ActiveDriver[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("role", "driver")
    .eq("active", true);
  if (error) throw error;

  const rows = (data ?? []) as unknown as { id: string; display_name: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name ?? "Sin nombre",
  }));
}
