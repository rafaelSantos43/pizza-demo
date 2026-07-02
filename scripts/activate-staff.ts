// Diagnóstico + reactivación de un staff por email. Útil cuando el callback
// redirige a /login?error=disabled (profile.active=false, ban en auth, o
// profile inexistente).
//
// Uso: bun scripts/activate-staff.ts <email> [role]
// role default = admin (admin|cashier|kitchen|driver)

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const role = process.argv[3] ?? "admin";

if (!email) {
  console.error("Uso: bun scripts/activate-staff.ts <email> [role]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey);

const { data: list, error: listErr } = await admin.auth.admin.listUsers({
  perPage: 200,
});
if (listErr) {
  console.error("Error listando users:", listErr.message);
  process.exit(1);
}
const user = list.users.find((u) => u.email === email);
if (!user) {
  console.error(`User no existe en auth: ${email}`);
  process.exit(1);
}

console.log(`✓ Auth user: ${user.id}`);
const bannedUntil = (user as unknown as { banned_until?: string | null })
  .banned_until;
if (bannedUntil) {
  console.log(`  banned_until: ${bannedUntil} → removiendo`);
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    ban_duration: "none",
  });
  if (error) console.error("  Error removiendo ban:", error.message);
  else console.log("  ✓ Ban removido");
}

const { data: profile, error: pErr } = await admin
  .from("profiles")
  .select("id, role, active, display_name")
  .eq("id", user.id)
  .maybeSingle();
if (pErr) {
  console.error("Error leyendo profile:", pErr.message);
  process.exit(1);
}

if (!profile) {
  console.log(`  Profile no existe → creando como ${role}, active=true`);
  const { error } = await admin.from("profiles").insert({
    id: user.id,
    role,
    display_name: email.split("@")[0],
    active: true,
  });
  if (error) {
    console.error("Error creando profile:", error.message);
    process.exit(1);
  }
  console.log("  ✓ Profile creado");
} else {
  console.log(`  Profile actual:`, profile);
  if (!profile.active) {
    const { error } = await admin
      .from("profiles")
      .update({ active: true })
      .eq("id", user.id);
    if (error) {
      console.error("Error activando profile:", error.message);
      process.exit(1);
    }
    console.log("  ✓ Profile activado");
  }
}

const { error: soErr } = await admin.auth.admin.signOut(user.id, "global");
if (soErr) console.error("Error cerrando sesiones:", soErr.message);
else console.log("✓ Sesiones cerradas — genera un nuevo magic link");

console.log("\nListo. Ahora corre:");
console.log(
  `  NEXT_PUBLIC_APP_URL=http://localhost:3000 bun scripts/gen-login-link.ts ${email}`,
);
