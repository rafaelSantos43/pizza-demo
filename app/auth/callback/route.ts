import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Supabase puede mandar el magic link con cualquiera de estos dos formatos
// según el flow de auth (PKCE `code=...` o legacy `token_hash=...&type=...`).
// Aceptamos ambos para no pegarse con la config del dashboard.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = url.searchParams.get("next") ?? "/pedidos";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth callback exchange failed", error);
      return NextResponse.redirect(new URL("/login?error=callback", req.url));
    }
    return NextResponse.redirect(new URL(next, req.url));
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
    return NextResponse.redirect(new URL(next, req.url));
  }

  return NextResponse.redirect(new URL("/login?error=no_code", req.url));
}

export function POST() {
  return new Response("Method not allowed", { status: 405 });
}
