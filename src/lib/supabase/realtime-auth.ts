import type { SupabaseClient } from "@supabase/supabase-js";

// Sincroniza el `access_token` de la sesión activa con el canal de
// Realtime. Sin esto, los eventos de `postgres_changes` que pasan por
// RLS dejan de llegar cuando Supabase refresca el token (turnos largos
// >1h). Ver L05 en docs/audit/logica.md.
//
// Diseño imperativo en lugar de hook para que el caller (siempre dentro
// de un useEffect) tenga control explícito del cleanup. La función
// hace setAuth inicial + suscribe a onAuthStateChange y retorna una
// función para deshacer.
export function attachRealtimeAuthSync(supabase: SupabaseClient): () => void {
  let cancelled = false;

  // setAuth inicial: si ya hay sesión al montar, propagar el token al
  // canal antes de cualquier subscribe del caller. El caller debe llamar
  // .subscribe() DESPUÉS de la promesa de getSession para garantizar que
  // los primeros eventos lleguen autorizados.
  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      if (cancelled || !session) return;
      void supabase.realtime.setAuth(session.access_token);
    })
    .catch((err) => {
      console.error("[realtime-auth] initial getSession failed", err);
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

  return () => {
    cancelled = true;
    subscription.subscription.unsubscribe();
  };
}
