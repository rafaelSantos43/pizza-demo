import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Resuelve a dónde mandar al staff según rol. Driver inactivo cierra
// sesión en el caller; los demás casos caen al home neutral.
async function resolveLandingPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fallback: string,
): Promise<{ path: string; signOut: boolean }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { path: fallback, signOut: false };

  const { data } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data as { role: string; active: boolean } | null;

  if (!profile || !profile.active) {
    return { path: "/login?error=disabled", signOut: true };
  }
  if (profile.role === "driver") return { path: "/mensajero", signOut: false };
  return { path: fallback, signOut: false };
}

// Supabase puede mandar el magic link con cualquiera de estos dos formatos
// según el flow de auth (PKCE `code=...` o legacy `token_hash=...&type=...`).
// Aceptamos ambos para no pegarse con la config del dashboard.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const explicitNext = url.searchParams.get("next");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const supabase = await createClient();

  async function handlePostAuth() {
    const fallback = explicitNext ?? "/pedidos";
    const landing = await resolveLandingPath(supabase, fallback);
    if (landing.signOut) {
      await supabase.auth.signOut();
    }
    return NextResponse.redirect(new URL(landing.path, req.url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth callback exchange failed", error);
      return NextResponse.redirect(new URL("/login?error=callback", req.url));
    }
    return handlePostAuth();
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email" | "recovery" | "invite" | "email_change",
    });
    if (error) {
      console.error("auth callback verify failed", error);
      return NextResponse.redirect(new URL("/login?error=callback", req.url));
    }
    return handlePostAuth();
  }

  return NextResponse.redirect(new URL("/login?error=no_code", req.url));
}

export function POST() {
  return new Response("Method not allowed", { status: 405 });
}
