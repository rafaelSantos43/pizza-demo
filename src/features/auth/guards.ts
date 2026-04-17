import "server-only";

import { redirect } from "next/navigation";

import { getCurrentStaff, type CurrentStaff, type StaffRole } from "./queries";

// Usa /pedidos como home del staff cuando el rol no califica; no tenemos
// /403 dedicado en v1 y /pedidos es accesible para todos los roles.
export async function requireStaff(opts?: {
  roles?: StaffRole[];
}): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) {
    redirect("/login");
  }
  if (opts?.roles && opts.roles.length > 0 && !opts.roles.includes(staff.role)) {
    redirect("/pedidos");
  }
  return staff;
}
