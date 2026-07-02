"use server";

import { revalidatePath } from "next/cache";

import { assertStaffRole } from "@/features/auth/guards";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  createDriverSchema,
  updateDriverSchema,
} from "./schemas";

type SimpleResult = { ok: true } | { ok: false; error: string };
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const BAN_DURATION_DISABLED = "876000h"; // ~100 años → de facto bloqueado.
const BAN_DURATION_ACTIVE = "none";

function revalidateDrivers(): void {
  revalidatePath("/mensajeros");
  revalidatePath("/mensajero");
}

export async function createDriver(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await assertStaffRole(["admin"]);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createDriverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }
  const data = parsed.data;

  let createdUserId: string | null = null;
  try {
    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        email_confirm: true,
      });
    if (userErr || !userRes.user) {
      const msg = userErr?.message ?? "No pudimos crear el usuario";
      return { ok: false, error: msg };
    }
    createdUserId = userRes.user.id;

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: createdUserId,
      role: "driver",
      display_name: data.display_name,
      phone: data.phone,
      active: true,
    });
    if (profileErr) throw profileErr;

    revalidateDrivers();
    return { ok: true, data: { id: createdUserId } };
  } catch (err) {
    console.error("createDriver failed", err);
    if (createdUserId) {
      // Rollback: evita auth.users huérfano sin profile.
      await supabaseAdmin.auth.admin.deleteUser(createdUserId).catch(() => {});
    }
    return { ok: false, error: "No pudimos crear el mensajero." };
  }
}

export async function updateDriver(input: unknown): Promise<SimpleResult> {
  const auth = await assertStaffRole(["admin"]);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = updateDriverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }
  const data = parsed.data;

  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.display_name, phone: data.phone })
      .eq("id", data.id)
      .eq("role", "driver");
    if (error) throw error;

    revalidateDrivers();
    return { ok: true };
  } catch (err) {
    console.error("updateDriver failed", err);
    return { ok: false, error: "No pudimos actualizar el mensajero." };
  }
}

export async function toggleDriverActive(
  id: string,
): Promise<SimpleResult> {
  const auth = await assertStaffRole(["admin"]);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: current, error: readErr } = await supabaseAdmin
    .from("profiles")
    .select("active, role")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("toggleDriverActive read failed", readErr);
    return { ok: false, error: "No pudimos cambiar el estado." };
  }

  const row = current as { active: boolean; role: string } | null;
  if (!row || row.role !== "driver") {
    return { ok: false, error: "Mensajero no encontrado" };
  }

  const previous = row.active;
  const next = !previous;

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({ active: next })
    .eq("id", id);
  if (updateErr) {
    console.error("toggleDriverActive profiles update failed", updateErr);
    return { ok: false, error: "No pudimos cambiar el estado." };
  }

  // Bloqueo en auth: si está inactivo no puede solicitar magic link.
  const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: next ? BAN_DURATION_ACTIVE : BAN_DURATION_DISABLED,
  });
  if (banErr) {
    // Rollback profiles para no dejar estados inconsistentes (profile
    // inactivo + auth activo, o al revés).
    console.error("toggleDriverActive ban failed, rolling back", banErr);
    await supabaseAdmin
      .from("profiles")
      .update({ active: previous })
      .eq("id", id);
    return { ok: false, error: "No pudimos cambiar el estado." };
  }

  // Al desactivar, invalidamos las sesiones activas del driver para que
  // un access token todavía vivo no le permita seguir operando hasta
  // que expire (~1h por defecto).
  if (!next) {
    const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(
      id,
      "global",
    );
    if (signOutErr) {
      // Best effort: si el signOut global falla, profiles.active=false
      // sigue bloqueando al driver al próximo render protegido. No
      // bloqueamos la operación.
      console.error("toggleDriverActive signOut failed", signOutErr);
    }
  }

  revalidateDrivers();
  return { ok: true };
}
