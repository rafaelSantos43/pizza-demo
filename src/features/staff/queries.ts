import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface DriverRow {
  id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  active_orders_count: number;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export async function listDrivers(): Promise<DriverRow[]> {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, phone, active, created_at")
    .eq("role", "driver")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (profiles ?? []) as unknown as ProfileRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // Conteo de pedidos activos por driver (no terminales).
  const { data: orders, error: ordersErr } = await supabaseAdmin
    .from("orders")
    .select("driver_id, status")
    .in("driver_id", ids)
    .not("status", "in", "(delivered,cancelled)");
  if (ordersErr) throw ordersErr;

  const counts = new Map<string, number>();
  for (const o of (orders ?? []) as { driver_id: string }[]) {
    counts.set(o.driver_id, (counts.get(o.driver_id) ?? 0) + 1);
  }

  // Email vive en auth.users; lo mergeamos con admin client.
  const { data: usersResp, error: usersErr } =
    await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (usersErr) throw usersErr;
  const emailById = new Map<string, string | null>();
  for (const u of usersResp.users) emailById.set(u.id, u.email ?? null);

  return rows.map((r) => ({
    id: r.id,
    email: emailById.get(r.id) ?? null,
    display_name: r.display_name,
    phone: r.phone,
    active: r.active,
    created_at: r.created_at,
    active_orders_count: counts.get(r.id) ?? 0,
  }));
}

export async function getDriverById(id: string): Promise<DriverRow | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, phone, active, created_at, role")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const row = data as
    | (ProfileRow & { role: string })
    | null;
  if (!row || row.role !== "driver") return null;

  const { data: userResp, error: userErr } =
    await supabaseAdmin.auth.admin.getUserById(id);
  if (userErr) throw userErr;

  const { count, error: countErr } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", id)
    .not("status", "in", "(delivered,cancelled)");
  if (countErr) throw countErr;

  return {
    id: row.id,
    email: userResp.user?.email ?? null,
    display_name: row.display_name,
    phone: row.phone,
    active: row.active,
    created_at: row.created_at,
    active_orders_count: count ?? 0,
  };
}
