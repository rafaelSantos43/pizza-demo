import "server-only";

import { redirect } from "next/navigation";

import { getCurrentStaff, type CurrentStaff, type StaffRole } from "./queries";

// Manda al staff a su "home" cuando el rol no califica para una ruta.
// No tenemos /403 dedicado en v1: el driver tiene su propia operativa
// en /mensajero, el resto comparte /pedidos.
function homeForRole(role: StaffRole): string {
  return role === "driver" ? "/mensajero" : "/pedidos";
}

export async function requireStaff(opts?: {
  roles?: StaffRole[];
}): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) {
    redirect("/login");
  }
  if (opts?.roles && opts.roles.length > 0 && !opts.roles.includes(staff.role)) {
    redirect(homeForRole(staff.role));
  }
  return staff;
}

export type StaffAuthResult =
  | { ok: true; staff: CurrentStaff }
  | { ok: false; error: string };

// Hermano de `requireStaff` para Server Actions: en lugar de redirigir,
// retorna `{ok:false, error}` para que el caller exponga el mensaje al
// toast del cliente. `requireStaff` (que redirige) sigue siendo lo correcto
// para layouts/pages; este es para botones donde el redirect destruye UX.
export async function assertStaffRole(
  roles: StaffRole[],
): Promise<StaffAuthResult> {
  const staff = await getCurrentStaff();
  if (!staff) return { ok: false, error: "No autorizado" };
  if (roles.length > 0 && !roles.includes(staff.role)) {
    return { ok: false, error: "No tienes permisos para esta acción" };
  }
  return { ok: true, staff };
}
