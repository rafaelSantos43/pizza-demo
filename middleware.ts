import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isDemoMode } from "@/lib/demo";
import { getClientEnv } from "@/lib/env";

const PROTECTED_PREFIXES = ["/pedidos", "/mensajero", "/menu", "/settings"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

let warnedMissingEnv = false;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  // Demo mode: omitimos auth real. La sesión la simula `getCurrentStaff` en
  // los layouts/pages, así no entramos en loop con `demo.supabase.co`.
  if (isDemoMode()) return response;

  let env: ReturnType<typeof getClientEnv>;
  try {
    env = getClientEnv();
  } catch (err) {
    // Sin .env.local el middleware no puede validar sesión. Pasamos la request
    // tal cual para que la página renderice (la propia página decidirá qué hacer
    // si necesita Supabase). Avisamos una sola vez para no inundar la consola.
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn("[middleware] Skipping auth — env vars missing.", err);
    }
    return response;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalida contra el Auth server. getSession() NO lo hace.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedPath(pathname) && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/login" && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/pedidos";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.well-known|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|webp|map)).*)",
  ],
};
