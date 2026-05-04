import type { SupabaseClient } from "@supabase/supabase-js";

export interface RealtimeAuthHandle {
  // Resuelve cuando el setAuth inicial corrió (con o sin sesión válida).
  // El caller debe `await` esto antes de `.subscribe()` para evitar
  // que el canal se conecte como anon y RLS filtre los eventos.
  ready: Promise<void>;
  // Limpieza: desuscribe el listener de onAuthStateChange.
  detach: () => void;
}

// Sincroniza el `access_token` de la sesión activa con el canal de
// Realtime. Sin esto, los eventos de `postgres_changes` que pasan por
// RLS dejan de llegar cuando Supabase refresca el token (turnos largos
// >1h). Ver L05 en docs/audit/logica.md.
//
// Diseño imperativo en lugar de hook para que el caller (siempre dentro
// de un useEffect) tenga control explícito del cleanup. La función
// hace setAuth inicial + suscribe a onAuthStateChange y retorna una
// función para deshacer.
export function attachRealtimeAuthSync(
  supabase: SupabaseClient,
): RealtimeAuthHandle {
  let cancelled = false;

  // setAuth inicial: usamos `refreshSession()` en lugar de `getSession()`
  // para garantizar un token fresco. Razón: si la pestaña estuvo dormida
  // (laptop cerrada, máquina en suspend), el auto-refresh interno del
  // SDK no corre porque el JS está pausado. Al despertar, el access_token
  // cacheado puede estar expirado y el primer subscribe a Realtime tira
  // `InvalidJWTToken` silenciosamente.
  // `refreshSession()` fuerza un round-trip al server con el refresh_token,
  // garantizando token vigente. Si el refresh_token también expiró,
  // session retorna null y la suscripción se queda sin auth (RLS bloquea
  // los events) — recuperable cuando el cajero re-haga login.
  const ready = supabase.auth
    .refreshSession()
    .then(({ data: { session } }) => {
      if (cancelled || !session) return;
      void supabase.realtime.setAuth(session.access_token);
    })
    .catch((err) => {
      console.error("[realtime-auth] initial refreshSession failed", err);
    });

  // Eventos relevantes: TOKEN_REFRESHED (refresh nativo de Supabase),
  // SIGNED_IN (segunda autenticación en la misma pestaña), USER_UPDATED.
  // SIGNED_OUT no setea — el caller probablemente debería redirigir a
  // /login pero eso es responsabilidad de otro guardia (middleware).
  const { data: subscription } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      if (cancelled) return;
      if (session?.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      }
    },
  );

  return {
    ready,
    detach: () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    },
  };
}
