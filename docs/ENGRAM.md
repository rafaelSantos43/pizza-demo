# ENGRAM — Memoria persistente del proyecto

> **Qué es esto:** una memoria viva del proyecto. Cada decisión no trivial, cada "por qué sí" y cada "por qué no" se registra aquí. Evita perder contexto entre sesiones y que un agente repita preguntas ya resueltas.
>
> **Cómo se usa:**
> - El orquestador (Claude main) lee este archivo ANTES de empezar cualquier tarea.
> - Cuando se tome una decisión nueva → agregar entrada con fecha.
> - Cuando una decisión cambie → actualizar la entrada, no borrar (tachar con ~~strikethrough~~ si quedó obsoleta).
> - Prohibido entradas vagas tipo "mejoramos la UI". Cada entrada debe responder: **qué + por qué**.

---

## Contexto del proyecto

- **Producto:** Pizza Demo (working name — sistema operativo SaaS para pizzerías en Colombia)
- **Cliente prospecto explorado (sin commit):** Pizzas Family La Campiña (Colombia). No personalizar código a este cliente hasta tener "sí" verbal. Ver LAUNCH_CHECKLIST.
- **Canal de venta existente:** WhatsApp (no se reemplaza)
- **Desarrollador:** backend@codecraftdev.com
- **Documento de referencia:** [PRD.md](PRD.md) — fuente de verdad funcional
- **Reglas de código:** [RULES.md](RULES.md) — no negociables
- **Modelo comercial:** SaaS manual, trial 14 días, $99.000 COP/mes, sin pasarela, single-tenant en v1

---

## Stack tecnológico (bloqueado, no cambiar sin discutir)

- Next.js 16 (App Router, RSC, Server Actions)
- React 19 + TypeScript 5 estricto
- Bun como package manager (ya hay `bun.lock`)
- Supabase (Postgres + Auth + Realtime + Storage + pg_cron)
- Tailwind CSS v4 **exclusivo** (cero CSS-in-JS)
- shadcn/ui + cva + lucide-react + sonner
- Zod + React Hook Form
- WhatsApp Cloud API (Meta)
- PrintNode (ticket) u ESC/POS directo según la ticketera
- Vercel (hosting)

---

## Decisiones tomadas (log en orden cronológico inverso)

### 2026-05-04 — Audio para el driver cuando se le asigna un pedido nuevo
**Qué:** [src/components/dashboard/driver-orders-list.tsx](../src/components/dashboard/driver-orders-list.tsx) ahora reproduce un beep + toast persistente cuando un postgres_changes indica que un pedido pasó a estar asignado al driver que está mirando la vista. Se distinguen dos casos:
- INSERT con `driver_id === viewerId` (raro hoy pero por completitud).
- UPDATE donde `new.driver_id === viewerId AND old.driver_id !== viewerId` (transición desde no asignado u otro driver).

Reusa `useAudioContext` y `ActivateAudioBanner` (los mismos del panel del cajero), gateados por `viewerRole === "driver"` para que el admin viendo la flota desde `/mensajeros` no oiga beeps por cada asignación ajena. `playBeep` está duplicado inline (15 líneas, DRY no justifica un helper compartido todavía).

**Por qué:** el caso real del driver es estar mirando la vista en su celular esperando trabajo. Sin audio, tiene que estar revisando la pantalla constantemente; con audio, el celular lo avisa aunque esté guardado en el bolsillo.

**Cómo aplica, decisiones no triviales:**
- **Cambios de estado del pedido (preparing → ready → on_the_way → delivered) NO disparan beep.** Eso es información para cocina/cajero, no para el driver. El driver activa él mismo "Salgo" / "Entregado" — no necesita audio para eventos que él dispara.
- **El admin viendo `/mensajeros` tab Flota NO oye beeps.** Filtrado por `viewerRole === "driver"`. Sin esto, sería ruido constante para el admin cuando hace asignaciones.
- **Toast persistente con `duration: Infinity`** + botón "Visto". Igual patrón que el panel del cajero. El driver puede dejarlo y avanzar al pedido cuando pueda.
- **`playBeep` duplicado** (no extraído a helper compartido): YAGNI. Solo 2 callsites; cuando aparezca un tercero se extrae.

### 2026-05-04 — SMTP custom (Resend) para magic links del staff/drivers
**Qué:** Custom SMTP habilitado en Supabase Studio del proyecto prod (`oqkhzqgvofqkjbgreoli`):
- Provider: **Resend** (free tier sandbox: `onboarding@resend.dev`).
- Sender: `Pizza Demo <onboarding@resend.dev>`.
- Host: `smtp.resend.com:465`, Username: `resend`, Password: API key de Resend (guardada solo en Supabase, encriptada — no en `.env.local` ni en código).

**Por qué:** los magic links del sender default de Supabase caen consistentemente en spam de Gmail (validado de forma empírica: matias no recibió ningún correo durante el debug del feature de drivers, todos al filtro). Gmail desconfía agresivamente del dominio compartido del default sender. Con Resend (incluso el sandbox `resend.dev`) los correos llegan al inbox principal en 1-3 segundos. Además, el rate limit pasa de 2 emails/h por usuario (default) a 30/h (custom SMTP) — clave para que el panel y los drivers no se bloqueen entre intentos.

**Cómo aplica, decisiones no triviales:**
- **Sandbox `onboarding@resend.dev` en lugar de dominio propio:** decisión de tiempo. El dominio propio (verificación SPF/DKIM/DMARC) requiere comprar dominio + esperar propagación de DNS. Sandbox sirve para validar el flujo HOY. Antes del primer pitch real con cliente debe migrarse a dominio propio porque "Pizza Demo <onboarding@resend.dev>" se ve poco profesional.
- **API key NO se commitea.** Vive solo en Supabase Studio (encriptada). Si rota, se cambia ahí; el código no la toca.
- **Magic link cross-device sigue NO funcionando:** Supabase usa PKCE → el code_verifier vive en cookies del browser que pidió el link. Si el cajero pide desde la PC y abre el correo desde el celular, el callback rechaza con "link expirado/inválido". Para producción real con cliente mayor, evaluar OTP de 6 dígitos en lugar de magic link. Documentado, no urgente para MVP.
- **Resend free tier:** 3000 emails/mes, 100/día. Más que suficiente para single-tenant. Si se llena, upgrade es $20 USD/mes.

### 2026-05-04 — fix `assignDriver` queryaba tabla equivocada (`staff` en lugar de `profiles`)
**Qué:** [src/features/orders/actions.ts](../src/features/orders/actions.ts) `assignDriver` validaba el driver con `.from("staff")`, pero **no existe tabla `staff`** en el schema — la tabla es `profiles`. La query siempre fallaba con error de tabla no existente, el guard atrapaba el error y devolvía *"El domiciliario no existe o no tiene rol válido"* — haciendo imposible asignar cualquier driver desde el panel.

Cambios:
- `.from("staff")` → `.from("profiles")`.
- Agregado `.eq("active", true)` para que drivers desactivados queden fuera del pool de asignación (consistente con `listActiveDrivers` y la decisión de banear+desactivar del 2026-05-04).
- `.single()` → `.maybeSingle()` (no tira error si no hay match, deja al guard manejarlo limpio).

**Por qué:** bug heredado del guard original que se agregó el 2026-04-18 ("Validar pago aprobado antes de asignar driver"). En ese momento se mencionó `staff` (probablemente nombre tentativo en la cabeza), nunca se cruzó contra el schema real. Pasó desapercibido porque tampoco había drivers reales para probar — empezó a doler hoy cuando Rafael intentó asignar a matias y nada funcionaba.

**Cómo aplica:**
- Validación funcional en prod: Rafael asignó 2 pedidos a matias después del fix. ✓
- Lección para el futuro: cuando un guard rechace en producción, **antes** de asumir que el dato está mal, validar que la query esté correctamente formada contra el schema real. Tipos generados de `database.types.ts` lo habrían detectado en compilación; D13 (deuda técnica de tipos generados) sigue pendiente.

### 2026-05-04 — fix Realtime: race condition entre `refreshSession()` y `.subscribe()`
**Qué:** [src/lib/supabase/realtime-auth.ts](../src/lib/supabase/realtime-auth.ts) `attachRealtimeAuthSync` ahora retorna `{ ready: Promise<void>, detach: () => void }` en lugar de solo la función de cleanup. La promise resuelve cuando el `setAuth` inicial corrió. Los callers ([orders-board.tsx](../src/components/dashboard/orders-board.tsx) y [driver-orders-list.tsx](../src/components/dashboard/driver-orders-list.tsx)) ahora hacen `await authHandle.ready` antes de `.subscribe()`.

**Por qué:** `refreshSession()` es una llamada HTTP (~100-500ms). El código previo solo esperaba un microtask (`await Promise.resolve()`) antes de subscribir, así que el canal se conectaba con `setAuth` aún no propagado. Sin JWT, Realtime aplica RLS contra rol `anon`, y las policies tipo `orders_staff_select using (is_staff())` filtran TODOS los eventos silenciosamente. Síntoma: el panel no se actualizaba en tiempo real en la primera carga; un F5 lo "arreglaba" porque el SDK ya tenía un access_token cacheado y el round-trip era casi inmediato.

**Cómo aplica, decisiones no triviales:**
- **No se cambió cómo se hace el `refreshSession()`** — sigue siendo el approach correcto (por ENGRAM 2026-04-30 "use refreshSession on mount"). Lo que se arregló es la sincronización con el subscribe.
- **Cambio de contrato en `attachRealtimeAuthSync`:** de retornar `() => void` a retornar `{ ready, detach }`. Breaking change interno del helper. Todos los callers (2 hoy) actualizados en el mismo commit.
- **El IIFE async dentro del useEffect ahora espera la promise** + chequea `cancelled` después del await. Si el componente desmonta antes del setAuth, no se subscribe. Sin esto habría memory leak por canales fantasma.
- **Aplicó a ambos panels** (cajero y driver). Antes el driver tenía un `subscribe()` síncrono inmediato — vulnerable al mismo bug pero menos visible porque la lista del driver depende menos de eventos en tiempo real (los pedidos asignados son más estables).

### 2026-05-04 — fix audio: rehydratación de localStorage no creaba el AudioContext
**Qué:** [src/components/dashboard/use-audio-context.ts](../src/components/dashboard/use-audio-context.ts):
- Helper `ensureCtx()` extraído (crea o devuelve cacheado).
- `useEffect` que lee `pfd:audio-activated` de localStorage ahora **además** de marcar `isUnlocked=true`, llama `ensureCtx()` para crear el AudioContext.
- `unlock()` ahora llama `ctx.resume()` si el ctx está en estado `suspended` (común en Safari/Chrome móvil).

[src/components/dashboard/orders-board.tsx](../src/components/dashboard/orders-board.tsx) `playBeep` también llama `ctx.resume()` defensivamente al inicio.

**Por qué:** dos bugs combinados que se manifestaban como "no suena el beep aunque el banner ya no aparece":
1. El cajero que ya activó audio en una sesión previa entraba al panel, NO clickeaba (solo miraba esperando pedidos), llegaba un INSERT y el guard `if (audioCtxRef.current)` saltaba silenciosamente porque solo se había marcado el flag en localStorage; el ctx mismo nunca se creaba (solo lo creaba el listener pasivo `pointerdown`/`keydown`, que nunca se disparaba si no había gesto).
2. Aún con el ctx creado, en móvil podía quedar `suspended` tras inactividad larga, y `osc.start()` corría sin emitir audio.

Validado en prod insertando 4 pedidos desde un script y confirmando que el beep + toast se disparan correctamente al menos en la sesión donde el cajero ya hizo gesto previo.

**Cómo aplica:**
- **Pre-existente desde el commit `f7c7d70`** (persist activation flag en localStorage) — el shortcut "saltar el banner tras F5" introdujo el bug porque la lógica para llegar a tener el ctx creado seguía dependiendo del listener pasivo.
- **`resume()` defensivo en `playBeep`:** seguro de bajo costo, no-op si state=running. Cubre el caso del laptop suspendido + reanudado.
- **No requirió cambio del banner ni de cómo se persiste el flag.** El fix está completamente del lado de hidratación.

### 2026-05-04 — Gestión de mensajeros (drivers): ruta admin `/mensajeros`, login unificado magic link, ban + signOut global al desactivar
**Qué:**
- **Schema:** [supabase/migrations/0008_profiles_phone.sql](../supabase/migrations/0008_profiles_phone.sql) agrega `profiles.phone text` (nullable) con CHECK E.164 idempotente (drop+create del constraint, ya que Postgres no soporta `add constraint if not exists`). [supabase/migrations/0009_profiles_self_update_lock_role.sql](../supabase/migrations/0009_profiles_self_update_lock_role.sql) endurece `profiles_self_update`: el `with check` ahora exige `role` y `active` iguales a los valores actuales del usuario, cerrando la ventana de privilege escalation (un driver autenticado podía hacer `update profiles set role='admin'` desde el browser hasta esta migration).
- **Feature nuevo:** [src/features/staff/](../src/features/staff/) con `schemas.ts`, `queries.ts`, `actions.ts`. Server Actions `createDriver`, `updateDriver`, `toggleDriverActive`. Todas con `assertStaffRole(['admin'])` + patrón `{ok, data?, error?}`. `createDriver` usa `supabaseAdmin.auth.admin.createUser({ email, email_confirm: true })` (sin password, sin invite automática) y rollback con `deleteUser` si el INSERT en profiles falla. `updateDriver` no permite cambiar email. `toggleDriverActive` flipea `profiles.active` + `auth.admin.updateUserById(id, { ban_duration })` + (al desactivar) `auth.admin.signOut(id, 'global')` para invalidar sesiones activas. Si el ban falla → rollback automático de `profiles.active`.
- **Phone validation:** schema regex `^\+57\d{10}$` (Colombia exclusivo, no E.164 genérico). El form UI tiene componente `PhoneInput` con prefijo `+57` fijo no editable + input que solo acepta 10 dígitos (`replace(/\D/g, "")`). El admin nunca ve ni teclea el prefijo. Server schema endurecido para que un admin con DevTools no pueda guardar un número de otro país.
- **Auth callback:** [app/auth/callback/route.ts](../app/auth/callback/route.ts) ahora hace `getUser` + lee `profiles.role/active` después de exchangeCodeForSession. Si `active=false` → `signOut` + redirect a `/login?error=disabled`. Si `role='driver'` → `/mensajero`. Otros → `/pedidos` (o `next` si vino).
- **Guards:** [src/features/auth/guards.ts](../src/features/auth/guards.ts) `requireStaff` ahora redirige al home correcto según rol con helper `homeForRole(role)` (driver → `/mensajero`, resto → `/pedidos`). Antes mandaba todos a `/pedidos`.
- **Login page:** [app/login/page.tsx](../app/login/page.tsx) muestra mensaje contextual según `?error=disabled|callback|no_code`. Si ya hay sesión, redirige según rol.
- **`/mensajero` ahora exclusivo del rol driver** (`requireStaff({ roles: ['driver'] })`). Quitado el modo flota; admin lo ve desde `/mensajeros`.
- **Vista admin `/mensajeros` (nueva):** [app/(dashboard)/mensajeros/page.tsx](../app/(dashboard)/mensajeros/page.tsx) RSC con tabs shadcn (Gestión / Pedidos por mensajero). Componentes nuevos: [drivers-page-client.tsx](../src/components/dashboard/drivers-page-client.tsx), [drivers-management.tsx](../src/components/dashboard/drivers-management.tsx) (tabla desktop + cards móvil con [Editar][Activar/Desactivar]), [driver-form-sheet.tsx](../src/components/dashboard/driver-form-sheet.tsx) (modos create/edit con RHF + Zod, PhoneInput), [drivers-flota.tsx](../src/components/dashboard/drivers-flota.tsx) (Accordion shadcn, reusa `DriverOrdersList` por driver activo). shadcn nuevos: `tabs`, `accordion`.
- **Sidebar:** [src/components/dashboard/shell.tsx](../src/components/dashboard/shell.tsx) `getNavItems(role)` filtra entries: driver → solo `/mensajero`; admin → `/pedidos`, `/mensajeros`, `/menu`, `/settings`; cashier/kitchen → solo `/pedidos` (no ven la entry de mensajero).

**Por qué:**
- El restaurante necesita poder dar de alta/baja domiciliarios sin tocar Supabase Studio. El cobro y la operación se rompen si un driver despedido sigue pudiendo entrar al panel y ver pedidos.
- Login unificado magic link (decidido con el dueño): driver entra a `/login` con su email igual que admin, sin contraseñas que perder ni resets manuales.
- Phone obligatorio en E.164 colombiano: el cajero debe poder llamar al driver si se atrasa. Fijar `+57` en UI elimina fricción y errores de tipeo del prefijo.
- Migration 0009 (lock de role/active): la policy original `with check (auth.uid() = id)` NO restringía qué columnas se podían cambiar. Esto siempre fue una vulnerabilidad latente; se hace explícita ahora porque vamos a tener cuentas driver reales.
- Ban + signOut global al desactivar: si solo cambiamos `profiles.active=false`, `getCurrentStaff` rechaza al driver al próximo render protegido, pero su access token JWT sigue válido ~1h. La combinación cierra esa ventana zombie.
- Rollback de `profiles.active` si falla el ban: estados inconsistentes (profile inactivo + auth desbloqueado, o al revés) son caóticos para depurar y rompen la promesa "desactivar = lockout". Mejor revertir y mostrar error que dejar el sistema mal.

**Cómo aplica, decisiones no triviales:**
- **Magic link unificado en lugar de email+password:** evaluado y descartado el approach de password en sesión anterior. El restaurante familiar prefiere "click en correo" antes que "recordar contraseña". Mismo flujo de admin/cashier/kitchen, cero código duplicado.
- **`auth.admin.listUsers({ perPage: 200 })` en `listDrivers()`:** decisión consciente de simplicidad. Si el restaurante crece a >200 staff total, los drivers en página 2 quedarían sin email mapeado. Documentado como bomba silenciosa para single-tenant; cuando aparezca multi-tenant, se reemplaza por una query directa filtrada por IDs (requiere SECURITY DEFINER porque `auth.users` no es RLS-friendly).
- **`createDriver` con `email_confirm: true`:** marca el email como verificado en `auth` SIN mandar invite. El driver entra a `/login`, escribe su email, recibe magic link. Esto desacopla la creación del envío del primer link y permite al admin crear cuentas en lote sin que se le manden correos de invitación que pueden caer en spam.
- **NO se permite cambiar email en `updateDriver`:** cambiar identidad en `auth` es complicado (requiere flujo de email_change con verificación). Para MVP, copy del form dice *"Si cambia, crea otra cuenta y desactiva esta"*. Aceptable.
- **NO `deleteDriver`:** los pedidos referencian `driver_id`. Hard delete rompería auditoría. Soft delete (active=false + ban + signOut) cubre todos los casos.
- **PhoneInput con `+57` fijo + 10 dígitos:** el admin nunca teclea el prefijo. `value.replace(/\D/g, "")` filtra basura. Sin el prefijo en el input, copiar el número desde la UI no incluye `+57` — aceptable para form de creación (donde el admin no copia), molesto en edit (donde podría querer compartirlo). Si pesa, ajustar más tarde.
- **`stripPrefix` para edit:** si el phone almacenado no empieza con `+57` (legacy/datos rotos), el form lo deja vacío y obliga a re-capturar en lugar de mostrar un valor truncado.
- **Tabs sin deep link (`?tab=...`):** estado local con `defaultValue="gestion"`. Si el admin recarga estando en "Pedidos por mensajero" cae en "Gestión". Aceptable hoy; se puede agregar `useSearchParams` después si lo piden.
- **El tab Flota solo carga drivers activos:** los inactivos ya no operan, mostrarlos suma queries inútiles. Filtrado en el RSC antes del `Promise.all(listOrdersForDriver)`.
- **`auth.admin.signOut(id, 'global')` es best-effort:** si falla, log + sigue. La razón: `profiles.active=false` ya bloquea al próximo render protegido del driver. El signOut es la cinta de seguridad extra para cerrar la ventana de access token vivo, no la única defensa.
- **Race condition no atómica en `toggleDriverActive`:** lee `active` actual, decide `next`, UPDATE. Dos admins clickeando simultáneo el mismo botón pueden flipear y des-flipear. Para 1-2 admins es teórico; cuando moleste, cambiar a `update profiles set active = not active where id = $1 returning active`.
- **Email duplicado:** `auth.admin.createUser` retorna error si el email existe. Hoy mostramos el mensaje crudo de Supabase. Falta traducir a *"Ya existe una cuenta con ese email"* — pendiente menor.
- **No se endureció `profiles_staff_select`:** hoy un driver autenticado puede leer otras filas de `profiles` vía esa policy (porque `is_staff()` retorna true para drivers). En la práctica nunca pasa (drivers están bloqueados de las rutas que disparan esa query), pero es deuda explícita. No urgente.

### 2026-04-30 — Notificaciones al cliente cambian de Meta a Twilio vía adapter aislado
**Qué:**
- Nuevo archivo [src/features/notifications/send-order-update.ts](../src/features/notifications/send-order-update.ts) con `sendOrderUpdate(orderId, toStatus)` y `sendOrderDelayApology(orderId)`. Es el ÚNICO archivo del proyecto que importa el sender de Twilio para notificaciones al cliente.
- [src/features/orders/actions.ts](../src/features/orders/actions.ts) `transitionOrder` ahora llama `sendOrderUpdate` en lugar de `sendOrderStatusTemplate` de Meta.
- [src/features/delay-alerts/run.ts](../src/features/delay-alerts/run.ts) llama `sendOrderDelayApology` en lugar de `sendTemplate({delay_apology})`.
- Mensajes plain text (no template) en español según PRD §F6 + uno nuevo para `payment_rejected` que antes no tenía mensaje:
  - `payment_approved`: "Pago aprobado ✅ Arrancamos tu pedido 🍕"
  - `preparing`: "Tu pedido está en preparación 🍕"
  - `ready`: "Tu pedido está listo, sale en minutos 🛵"
  - `on_the_way`: "Tu pedido está en camino 🚗"
  - `delivered`: "Entregado ✅ ¡Gracias por preferirnos!"
  - `payment_rejected` (nuevo): "No pudimos validar tu comprobante 🙏 ¿Podrías enviarnos uno nuevo? Puedes responder a este chat con la foto o usar el link del pedido."
  - `delay_apology`: "Disculpa la demora 🙏 Tu pedido está tomando un poco más, ya va saliendo."
- `src/features/whatsapp/sender.ts` (Meta) NO se tocó. `sendOrderStatusTemplate` y `sendTemplate` siguen exportados, simplemente no se llaman desde lógica de negocio. Quedan listos para cuando Meta vuelva.

**Por qué:**
- Antes del cambio, `transitionOrder` llamaba a Meta sender que tiene `WHATSAPP_ACCESS_TOKEN=dummy` en prod. Resultado: el cajero tocaba botones en el panel pero el cliente no recibía nada. F6 estaba roto sin que se notara.
- Twilio sandbox manda texto libre (no requiere plantillas aprobadas) → desbloquea el flujo end-to-end HOY para pruebas con números unidos al sandbox.
- Caveat conocido: Twilio sandbox no escala a clientes reales del restaurante (cada uno tendría que mandar `join <code>` antes de pedir pizza). El sandbox sirve para validar el flujo y demos controlados; el lanzamiento real necesita Meta aprobado o número Twilio dedicado.

**Cómo aplica:**
- **Patrón de aislamiento:** `notifications/` vive en territorio neutral, no en `whatsapp-twilio/`. El acoplamiento al sender provisional está en una sola línea de import. Para borrar Twilio en el futuro: cambiar el import en `send-order-update.ts` por `sendOrderStatusTemplate` de Meta + reemplazar el cuerpo de las funciones por llamadas al sender de Meta. El resto del código (transitionOrder, delay-alerts) NO cambia.
- `templateForStatus(payment_rejected)` en `whatsapp/templates.ts` sigue retornando `null` (no había template Meta aprobado). El nuevo flujo cubre `payment_rejected` desde el adapter — cuando Meta vuelva, el dev debe registrar `pf_payment_rejected` y mapearlo en `templateForStatus`.
- **No se cambió `handle-incoming.ts` (Meta webhook entrante)** — sigue llamando `sendTemplate("payment_received")`. Como el webhook entrante de Meta también está pausado, este código no se ejecuta hoy en prod. Cuando Meta vuelva, ya está bien estructurado y el adapter no aplica acá (es un trigger distinto: respuesta inmediata al recibir imagen).
- **Caveat de UX:** los números remitentes son distintos según el evento. Hoy:
  - Greet inicial → Twilio (`+1 415 523 8886`)
  - Status updates → Twilio (mismo)
  - Recordatorio comprobante → Twilio (mismo)
  → No hay inconsistencia. Cuando Meta vuelva, todo el set debe migrar JUNTO al número del cliente para no confundirlo. Documentado para no olvidar.

### 2026-04-30 — Recordatorio automático de comprobante + métrica `payment_proof_source` + alerta visual al cajero
**Qué:**
- **Schema (aplicable):** [supabase/migrations/0005_proof_reminders.sql](../supabase/migrations/0005_proof_reminders.sql) agrega `orders.payment_proof_source text` (CHECK `in ('web','whatsapp')` permitiendo NULL) y `orders.proof_reminder_sent_at timestamptz`. Idempotente.
- **Cron (`.skip`, requiere Supabase Pro):** [supabase/migrations/0006_proof_reminders_cron.sql.skip](../supabase/migrations/0006_proof_reminders_cron.sql.skip) reusa `cron_config` y `cron_secret` de 0003, programa job `proof_reminders_every_2min` que llama POST `/api/cron/proof-reminders` con Bearer.
- **Lógica:** [src/features/payments/proof-reminders/run.ts](../src/features/payments/proof-reminders/run.ts) busca `awaiting_payment + needs_proof + proof_reminder_sent_at IS NULL + created_at < now()-5min`, marca el flag con guardia `is null` (atomicidad contra doble proceso), y manda Twilio text `"Recuerda enviarme tu comprobante 📸 para arrancar tu pedido."`.
- **Route handler:** [app/api/cron/proof-reminders/route.ts](../app/api/cron/proof-reminders/route.ts) — copia exacta del patrón de `delay-alerts/route.ts`.
- **Origen del comprobante:** `createOrder` setea `payment_proof_source = 'web'` cuando recibe `paymentProofPath` (camino A); `handle-incoming.ts` lo setea a `'whatsapp'` al asociar la imagen entrante (camino B). NULL para efectivo.
- **Reset al rechazar:** `transitionOrder` en `payment_rejected` ahora también limpia `proof_reminder_sent_at` y `payment_proof_source` además de `payment_proof_url` y `needs_proof = true`. Permite que el cliente reenvíe Y reciba un recordatorio nuevo si tarda.
- **UI cajero:** [src/components/dashboard/order-card.tsx](../src/components/dashboard/order-card.tsx) reemplaza el badge fijo "Necesita comprobante" por una gradación: amarillo (0–4 min), naranja "Esperando comprobante (N min)" (5–29), rojo "Sin comprobante hace N min" (30+). El badge solo aparece para `awaiting_payment + needs_proof`. NO auto-cancela; el cajero decide cuando ve el rojo.

**Por qué:**
- 5 min para recordar es el sweet spot entre "molestar enseguida" y "perder al cliente que se distrajo". Datos de los chats actuales del restaurante muestran que muchos clientes se demoran 1-3 min en mandar la foto pero se pierden si pasan >10 min sin estímulo.
- 30 min como umbral visual al cajero (no auto-cancel) porque un auto-cancel a los 30 min destruye pedidos legítimos del cliente que justo iba a mandar la foto. El humano juzga mejor: la regla del proyecto es "primero funcional, después sofisticado".
- `payment_proof_source` permite medir en piloto qué porcentaje usa A vs B. Si A llega a ≥80%, abre la puerta a deprecar B después; si B se mantiene ≥30%, el híbrido es justificado a largo plazo.
- Twilio mientras Meta vuelve: el sender está aislado en un import único en `run.ts`. Cuando Meta esté listo, swap a `sendTemplate({ templateKey: "proof_reminder" })` requiere aprobar el template `pf_proof_reminder` en Meta primero.

**Cómo aplica:**
- Aplicar migration 0005 ya. La 0006 espera a Supabase Pro (igual que 0003 — todavía está `.skip`).
- Para activar el recordatorio en prod: aplicar 0003 + 0006 + Supabase Studio → `cron_config` → set `proof_reminders_url` y `cron_secret`. Mismas instrucciones que F8.
- Métrica `payment_proof_source`: consultable con `select payment_proof_source, count(*) from orders where payment_proof_source is not null group by 1`. Sin dashboard por ahora; query manual.
- El badge naranja/rojo NO se actualiza solo con el reloj — depende del re-render que dispara Realtime cuando hay cambios en `orders`. Si un pedido queda muerto sin cambios, los minutos pueden quedar stale hasta el siguiente evento. Aceptado para MVP; si pesa, agregar `setInterval` en el panel.
- **Reset en rejected (decisión sutil):** un pedido rechazado vuelve al ciclo completo de recordatorios. Si nunca se quiere repetir el recordatorio para pedidos rechazados, cambiar la lógica del cron para excluir `payment_rejected → awaiting_payment` con un flag adicional. No lo agrego ahora porque la asimetría más útil es: el cliente que recibe "rechazado" debe reintentar y merece el mismo trato que un cliente nuevo.

### 2026-04-30 — Removido el demo mode completo
**Qué:** eliminado todo el código de `NEXT_PUBLIC_DEMO_MODE`. Cambios concretos:
- Borrado: [src/lib/demo.ts](../src/lib/demo.ts), [src/features/orders/demo-fixtures.ts](../src/features/orders/demo-fixtures.ts), [src/features/catalog/demo-fixtures.ts](../src/features/catalog/demo-fixtures.ts) (~500 líneas).
- Removido el fallback a `DEMO_PUBLIC_ENV`/`DEMO_SERVER_ENV` en [src/lib/env.ts](../src/lib/env.ts) — `getClientEnv`/`getServerEnv` ahora exigen vars reales o tiran con Zod.
- Removido `if (isDemoMode())` de 16 archivos: actions, queries, senders, route handlers, middleware, drivers list. Cada rama era un early return con fixtures o un no-op de envío.
- En [middleware.ts](../middleware.ts) también se quitó el try/catch alrededor de `getClientEnv()` (era defensa para "sin .env.local" que ya no aplica). Si faltan vars, el middleware truena fuerte y se entera el dev.
- Test [verify-signature.test.ts](../src/features/whatsapp/__tests__/verify-signature.test.ts): borrado el test "accepts anything in demo mode" y el stub de `NEXT_PUBLIC_DEMO_MODE`. 37/37 tests siguen pasando.
- Entrada del 2026-04-16 sobre demo mode tachada con ~~strikethrough~~ abajo (queda para historia, no aplica).

**Por qué:** el demo mode fue útil en semana 1 cuando no había `.env.local`, no había prod, y el UI Agent necesitaba ver pantallas. Hoy hay `.env.local` con creds reales, prod desplegado en `pizza-demo-five.vercel.app`, data real en Supabase (33 pizzas seedeadas), y todo el flujo se prueba contra DB real desde hace semanas. Mantenerlo costaba: cada Server Action arranca con `if (isDemoMode())` que el dev tiene que saltarse mentalmente, los fixtures pueden silenciosamente desfasarse cuando los tipos cambian, y multiplica los caminos a probar. YAGNI explícito: no hay caso de uso vivo para demo mode hoy. Si un demo "sin DB" se necesita en el futuro (ej. screenshot para venta), se hace con un seed específico de Supabase, no con fixtures hardcoded.

**Cómo aplica:**
- **Para correr local:** ahora es obligatorio tener `.env.local` con todas las vars del schema Zod. `bun run dev` truena claro y temprano si falta alguna.
- **`getServerEnv()` lazy validation se conserva** — sigue siendo la razón por la que un build de Next no truena por importar un módulo sin las vars; solo trona al primer uso real.
- **Si volvemos a necesitar demo:** seedear una BD secundaria de Supabase (free tier) con data ficticia y rotar `NEXT_PUBLIC_SUPABASE_URL` cuando se quiera grabar un video. Cero código.
- Entradas históricas que mencionan "demo mode" (LAUNCH_CHECKLIST §A, ENGRAM 2026-04-16) quedan como log; no se actualizan retroactivamente.

### 2026-04-30 — Removida la feature de impresión completa, reemplazada por alerta sonora + toast persistente
**Qué:** se elimina toda la integración con ticketera/PrintNode/ESC/POS del MVP. Cambios concretos:
- Borrado: `app/api/print/[orderId]/` (route handler vacío) y la carpeta planeada `src/features/printing/` (nunca había contenido).
- [src/lib/env.ts](../src/lib/env.ts): quitadas `PRINTNODE_API_KEY` y `PRINTNODE_PRINTER_ID` del schema de Zod.
- [src/lib/demo.ts](../src/lib/demo.ts): mismas dos vars eliminadas de `DEMO_SERVER_ENV`.
- [src/components/dashboard/orders-board.tsx](../src/components/dashboard/orders-board.tsx): la suscripción Realtime ahora distingue `INSERT` vs `UPDATE` vs `DELETE`. En `INSERT` con `status ∈ {new, awaiting_payment}` reproduce un beep (Web Audio API, ~350ms a 880Hz, sin archivos en `public/`) y emite un toast persistente (`duration: Infinity`, `id: order.id`) con monto formateado en COP y botón "Visto". El toast se descarta automáticamente cuando llega un UPDATE que mueve el pedido fuera de los estados de alerta (típicamente porque el cajero tocó "En Preparación") — un solo gesto cierra el ciclo.
- AudioContext se inicializa lazy en el primer `pointerdown`/`keydown` del usuario (autoplay policy de los browsers); si el cajero nunca hizo gesto, el toast persistente sirve de respaldo único.
- PRD §F4 reescrita, §7.3 reescrita ("Sin integración de impresora"), §8 sin línea de PrintNode, §9.1 sin caja de PrintNode, §9.2 sin paso de imprimir, §10 sin `print/` ni `printing/`, §13 sem 3 reformulada, §14 nuevo riesgo "cajero no oye el beep", §16 movida la decisión a "Decidido", §17.4 agregado "tablet/PC con audio funcionando" como responsabilidad del cliente.

**Por qué:** la impresión fue la feature más cara en costos no-software del MVP. Hardware-dependiente = punto de falla en soporte (drivers, papel, Wi-Fi, modelos chinos). El restaurante ya canta o anota a mano hoy — el papel impreso era una mejora marginal con riesgo desproporcionado. Quitarlo permite venderle al cliente "cero inversión en hardware, use lo que ya tiene" como ventaja real. Alineado con el principio rector ("primero funcional, después sofisticado") y con la exclusión "Hardware ≠ nuestro problema".

**Cómo aplica:**
- El cajero es ahora el único puente entre WhatsApp/web y la cocina. Capacitación debe enfatizar: (a) volumen del dispositivo subido al iniciar turno, (b) tocar "Visto" o avanzar el pedido apenas se enteró, (c) cantar/anotar a cocina antes de cambiar el estado.
- Si en piloto se mide alta tasa de "pedidos olvidados en `new`" (ej. el toast persistente queda 10+ min sin descartarse), se reabre la decisión: opción 1 = reactivar PrintNode opcional, opción 2 = volver el toast aún más invasivo (overlay full-screen).
- La decisión es reversible. El código de `src/features/printing/` y `app/api/print/` está borrado pero el diseño queda en este ENGRAM. Si un cliente futuro pide impresión, se reconstruye en ~1 día con PrintNode.

### 2026-04-29 — Re-greet manual desde página de link expirado/usado
**Qué:** cuando un cliente abre `/pedir/[token]` y el token está `expired` o `used`, se renderiza [src/components/shop/expired-token-notice.tsx](../src/components/shop/expired-token-notice.tsx) (Client) con un botón "Pedir nuevo link por WhatsApp". El botón llama el Server Action [src/features/order-tokens/request-relink.ts](../src/features/order-tokens/request-relink.ts) → resuelve `customer_id` con `getCustomerIdFromExpiredToken` (helper nuevo en [verify.ts](../src/features/order-tokens/verify.ts), mantiene HMAC) → aplica rate limit **3 re-greets / customer / hora** contando filas de `order_tokens` con `created_at > now()-1h` → llama `relinkCustomerTwilio(customerId)` (wrapper nuevo en [whatsapp-twilio/greet.ts](../src/features/whatsapp-twilio/greet.ts)). UI maneja states `idle | sent | rate_limited | error`. Página `page.tsx` solo deriva al componente para `expired`/`used`; tokens `malformed`/`invalid_signature`/`not_found` siguen mostrando texto plano (no se les ofrece relink — son tokens inventados o corruptos).
**Por qué:** subir el TTL a 2h reduce fricción pero no la elimina. El cliente que vuelve después del límite tendría que escribir manualmente al WhatsApp para pedir otro link. Un botón explícito cierra el bucle desde la misma URL. Opción A (botón) elegida sobre B (auto-disparo al cargar) para evitar mandar mensajes no solicitados a clientes que abrieron el link por curiosidad o lo encontraron en un screenshot viejo. Rate limit 3/h cubre cliente legítimo que se equivoca 1-2 veces sin abrir spam infinito; recordar que el límite por customer NO defiende contra ataque distribuido (ese problema es para un rate limit por IP, no MVP).
**Cómo aplica:**
- Sender activo es Twilio (provisional). Cuando vuelva Meta, cambiar el import en `request-relink.ts` por el equivalente en `src/features/whatsapp/greet.ts` (un solo cambio).
- Rate limit reusa `order_tokens` (no tabla nueva). Demo mode salta el rate limit y solo simula el envío.
- Helper `getCustomerIdFromExpiredToken` mantiene la verificación HMAC: tokens con firma inválida nunca llegan al sender.
- Schema `ResolveExpiredTokenResult` agrega `reason: "still_valid"` para el caso raro en que el helper se invoque con un token todavía vigente — devuelve error en lugar de hacer un relink innecesario.

### 2026-04-29 — Token del catálogo: TTL 30 min → 2 horas
**Qué:** [src/features/order-tokens/sign.ts](../src/features/order-tokens/sign.ts) `ttlMinutes` default cambia de `30` a `120`. Copy actualizada en [src/features/whatsapp-twilio/greet.ts](../src/features/whatsapp-twilio/greet.ts) ("expira en 2 horas") y referencias en PRD §F1, §9.2, §12 + DEMO_RUNBOOK + README de twilio. La entrada original "Cliente final NO inicia sesión" queda con nota cruzada al nuevo TTL.
**Por qué:** 30 min era flojo. La seguridad del token ya descansa en HMAC + one-time use (`used_at` se marca en `createOrder`); el TTL solo cubre el ratón "cliente recibe link → se distrae → vuelve". 30 min castigaba el caso normal sin agregar seguridad real (los vectores reales —forward involuntario, fraude vía pago efectivo— son independientes del TTL). 2h cubre el patrón observado de uso sin abrir ventana de phishing infinita. "Sin caducidad" se descartó: complica limpieza de `order_tokens` y deja screenshots vivos para siempre.
**Cómo aplica:** cualquier llamada a `signToken(customerId)` ahora emite tokens de 2h. Métrica a vigilar en piloto: `% tokens expirados antes de uso` — si sigue alto, subir a 4h. Pendiente complementario: re-greet automático cuando un cliente abre un link expirado (decisión de UX en curso, sin implementar aún).

### 2026-04-20 — UI Agent ampliado a UI/UX Agent (alcance + heurísticas)
**Qué:** [docs/agents/ui-agent.md](agents/ui-agent.md) renombrado a "UI/UX Agent". Scope ampliado para incluir explícitamente decisiones de UX (no solo implementación). Cuatro secciones nuevas al inicio:
1. **Principios UX (Nielsen reducidas)**: visibilidad del estado, prevención de errores, reconocer > recordar, control del usuario, consistencia, minimizar carga cognitiva.
2. **Jerarquía visual y semántica de color**: regla "una pantalla = un CTA principal", contraste de texto para avisos, glosario de variants de Button (success/destructive/outline/default/secondary), prohibición de colores hardcodeados.
3. **Validar antes de implementar**: cuando una decisión afecta ≥3 archivos o cambia un patrón, primero "mockup en palabras" al usuario, después código. Evita ciclos de refactor.
4. **Cuestionar fricción donde otros la normalizan**: con ejemplos del proyecto (4 inputs opcionales en grid, zona del cliente, color rojo para confirmar).

Checklist final del agente actualizado con sección "UX" además de la "UI / técnico".

NO se renombró el agente en otros docs ([CLAUDE.md](../CLAUDE.md), [AGENTS.md](AGENTS.md), [orchestrator.md](agents/orchestrator.md)) — siguen diciendo "UI Agent". Es el mismo agente con scope ampliado, evita refactor masivo de docs por una sola decisión.

**Por qué:** el dueño señaló que el orquestador (Claude main) había hecho TODA la sesión sin delegar al UI Agent — varios cambios de UX significativos (sistema de variant `success`, refactor de housing types, tokens de color) se ejecutaron directo en lugar de pasar por el agente. La causa raíz: (a) el orquestador no respetó el workflow del proyecto, y (b) el agente no tenía competencias UX explícitas, así que delegarle decisiones UX se sentía incompleto. Esta entrada cierra el (b).

**Cómo aplica, decisiones no triviales:**
- **NO se creó un UX Agent separado.** Razón: UI y UX están entrelazados (decidir "verde para confirmar" requiere implementar token + variant + aplicar en N archivos en el mismo loop). Separar crearía handoffs artificiales. Para un proyecto de 1 dev + MVP single-tenant, el overhead supera el beneficio. YAGNI explícito. Cuando aparezca equipo de UX research / multi-superficie / +5 productos → reconsiderar.
- **El "mockup en palabras" formaliza un patrón que el dueño usó hoy de forma intuitiva** ("siento que esos colores no cuadran con confirmar"). El agente debe ofrecerlo proactivamente para decisiones grandes en lugar de tirarse a codear.
- **Lección para Claude main (orquestador)**: cambios de UI/UX que toquen ≥3 archivos o introduzcan patrones nuevos del design system DEBEN delegarse al UI/UX Agent vía Task tool. Cambios de 1-3 líneas (placeholder, ajuste de className, rename de copy) los hace el orquestador. Si dudo → delego.

### 2026-04-20 — Token semántico `--success` verde para CTAs de avance (complementa la marca)
**Qué:**
- [app/globals.css](../app/globals.css): nuevos tokens `--success: oklch(0.6 0.14 152)` (light) / `oklch(0.65 0.15 152)` (dark) + `--success-foreground: oklch(1 0 0)` y mapeo `--color-success` en `@theme inline`.
- [src/components/ui/button.tsx](../src/components/ui/button.tsx): nueva variante `success: "bg-success text-success-foreground hover:bg-success/90 focus-visible:ring-success/30"` en `cva`.
- Aplicada `variant="success"` a 7 botones de "avance positivo" en el flujo:
  - **Cliente**: [cart-sheet.tsx](../src/components/shop/cart-sheet.tsx) "Ir al pago", [checkout-form.tsx](../src/components/shop/checkout-form.tsx) "Confirmar pedido".
  - **Panel staff**: [status-actions.ts](../src/components/dashboard/order-detail/status-actions.ts) `APPROVE_PAYMENT`, `TO_PREPARING`, `TO_READY`, `TO_ON_THE_WAY`, `TO_DELIVERED`.
  - **Mensajero**: [driver-order-card.tsx](../src/components/dashboard/driver-order-card.tsx) "Salgo" + "Entregado" (este último ya tenía hardcode `bg-emerald-600` que se eliminó — la deuda técnica que ENGRAM 2026-04-16 había documentado como "excepción a tokens" queda cerrada).

**Por qué:** feedback del dueño revisando el checkout: *"esos colores rojos no cuadran con la acción confirmar; siempre es como un verde o algo que invite a confirmar"*. Tiene razón en el principio universal de UX: rojo en CTAs de "avanzar" se lee como "peligro/cuidado", no como "adelante". El proyecto mezclaba **identidad de marca** (terracota = pizzería cálida) con **semántica de acción** (confirmar / cancelar). Solución de design system maduro: separar.

**Cómo aplica, decisiones no triviales:**
- **NO se cambió el `--primary` terracota** — sigue siendo la identidad: header brand, focus rings, badges, links, botones primarios "no-confirmar" (login, filtros). ENGRAM 2026-04-16 (terracota+mostaza) intacto.
- **El `--success` se usa ESTRICTAMENTE para "avance positivo del flujo"**: pasar al siguiente paso del checkout, aprobar pago, mover el pedido al siguiente estado, marcar entregado. **NO** para acciones neutrales (login, abrir modal) ni para indicadores pasivos (status badges del pedido — esos siguen siendo el StatusBadge específico).
- **Verde elegido (`oklch(0.6 0.14 152)`)** es el equivalente al `emerald-600` de Tailwind que ya estaba hardcodeado en `driver-order-card`. Mantiene consistencia con lo que ya se había probado y aprobado visualmente.
- **Patrones que valen la pena recordar:**
  - "Confirmar / Avanzar / Aprobar" → `variant="success"`
  - "Cancelar / Rechazar / Eliminar" → `variant="destructive"`
  - "Volver / Vaciar / Reset" (reversible neutral) → `variant="outline"` SIN clases destructivas
  - Resto de CTAs (login, navegar, abrir modal) → `variant="default"` (terracota = identidad)
- **No se introdujo `--warning` / `--info`**: YAGNI. Si aparece la necesidad, se agregan con la misma lógica.

### 2026-04-20 — Quitar selector de zona del checkout (UX cliente)
**Qué:** [src/components/shop/checkout-form.tsx](../src/components/shop/checkout-form.tsx) ya no muestra el selector "Zona de entrega" al cliente. Removido del `checkoutFormSchema`, de los `defaultValues`, del payload de `createOrder`, y del JSX (~30 líneas eliminadas). El cliente arma el pedido sin elegir zona; el backend usa el fallback de [src/features/orders/eta.ts](../src/features/orders/eta.ts) `computeEtaAt(null, zones)` que cae en la primera zona configurada (~30min default si no hay ninguna). El staff ve el ETA inicial en el panel; F8 sigue funcionando con ese ETA.

**Por qué:** el cliente no entiende para qué sirve y se autoclasifica mal (puede mentir para bajar el ETA, o no saber a qué zona pertenece su barrio). Es trabajo del restaurante saber eso, no del cliente. Discusión con el dueño concluyó que el campo era ruido UX.

**Cómo aplica:**
- **El cliente NO ve ETA en el checkout.** Página `/gracias` ya muestra "Te avisamos por WhatsApp cuando esté en camino" para `preparing` — eso cubre la expectativa.
- **`zone` ya era opcional en [src/features/orders/schemas.ts:25](../src/features/orders/schemas.ts)** — sin migración ni cambio de actions.
- **Trade-off conocido:** el ETA inicial de TODOS los pedidos es el de la primera zona configurada en `settings.delivery_zones`, sin importar dónde viva el cliente. Si el restaurante tiene zonas con ETAs muy distintos (ej. 25min vs 60min), todos arrancan con 25min y los lejanos siempre disparan F8 antes de tiempo.
- **TODO futuro (opción 1 propuesta y descartada por YAGNI hoy):** mapeo barrio→zona en `settings.delivery_zones`. Estructura propuesta: agregar `barrios?: string[]` al `DeliveryZone`, helper puro `findZoneForBarrio`, y mostrar `Tiempo estimado: ~X min` (solo lectura) debajo del campo barrio en el checkout. Se construye cuando aparezca el primer cliente real y dé su mapa de barrios. Sin esa lista, el helper siempre cae en default y el código sería ruido.

### 2026-04-20 — UX checkout: rediseño completo guiado por "menos teclado, más claridad"
**Qué:** [src/components/shop/checkout-form.tsx](../src/components/shop/checkout-form.tsx) tuvo 6 cambios UX en una sola sesión, todos guiados por el principio del usuario *"que el cliente escriba lo menos posible"*:

1. **Selector de tipo de vivienda** (3 chips: 🏠 Casa / 🏢 Edificio / 🏘️ Conjunto) con default `casa`. Reemplaza los 4 inputs opcionales (Conjunto, Torre, Apto, Barrio en grid 2x2) que confundían al cliente.
2. **Render condicional** según el tipo: Casa muestra solo Barrio; Edificio muestra Nombre del edificio + Apto #; Conjunto muestra Nombre del conjunto (full width) + Torre # + Apto #. `handleHousingChange` limpia los campos que se ocultan (no se mandan valores stale al backend).
3. **Torre con `inputMode="numeric"`** para abrir teclado numérico en móvil.
4. **Campo de referencias con feedback explícito**: label + sub-texto *"Pista para que el domiciliario te encuentre rápido"* + placeholder *"Ej: portón verde, timbre dañado…"*. Antes era un textarea pelado sin guía.
5. **Tipografía de avisos legible**: 5 textos pequeños subidos de `text-xs text-muted-foreground` a `text-sm text-foreground/80` (helper de referencias, errores de validación, nota de mitad-y-mitad, ayuda de comprobante, aceptación de políticas). Razón: el cliente se quejaba de que no veía las letras chicas.
6. **Nota de mitad-y-mitad condicional + visible**: la frase *"Las pizzas con mitad y mitad se cobran al valor más alto…"* aparece SOLO si `cartItems.some(it => it.flavors.length >= 2)`. Estilo: caja con `bg-secondary/15` + `border-secondary/50` + icono `Info`. Antes: texto siempre visible incluso para clientes que pidieron una sola pizza sin combinar.
7. **Botón "Cancelar pedido"** outline rojo (`border-destructive/50 text-destructive`) con icono `X` debajo del card de políticas. `handleCancel` confirma con `window.confirm` + `clearStoredCart()` + `router.push('/pedir/${token}')`. Antes el cliente no tenía forma explícita de abandonar el flujo.

**Por qué:** sesión de feedback con el dueño revisando el flujo del cliente. Cada decisión vino de una crítica concreta de UX: *"el usuario no entiende qué poner aquí"*, *"no ve las letras pequeñas"*, *"y si quiere cancelar, qué"*, *"esa nota no aplica a todos"*.

**Cómo aplica, decisiones no triviales:**
- **Schema atrás INTACTO**: `complex_name`, `tower`, `apartment` siguen siendo columnas separadas en `addresses`. El `housingType` es solo del form, NO se persiste — `complex_name` recibe el nombre de conjunto o edificio según el caso. Respeta ENGRAM 2026-04-16 (estructura jerárquica de direcciones colombianas) sin romper schema.
- **Default `casa` es hipótesis no validada**: si la mayoría de los pedidos del restaurante van a apartamentos, hay 1 toque extra para esos. Validar con los primeros 50 pedidos reales y ajustar si hace falta.
- **Botón cancelar rojo outline (no sólido)**: NO compete con el botón principal "Confirmar pedido" (sólido primario). Ambos son full-width y `h-12`, claramente acciones paralelas pero con jerarquía visual distinta. La iteración anterior (link gris subtle) fue rechazada por invisible.
- **Caja mostaza para mitad-y-mitad** usa color de marca (`secondary`), consistente con el sistema, no introduce ámbar/amarillo nuevo.
- **`HOUSING_OPTIONS` es array constante en módulo** (no estado), no re-renderiza nada.
- **Cambios de tipografía no afectan**: detalles secundarios del item del carrito (`Tamaño: Familiar`, sabores), nombre del archivo subido, label "Total" del bottom bar — siguen `text-xs` por jerarquía visual deliberada.

### 2026-04-20 — Realtime panel: setAuth + publication (fix bug)
**Qué:** [src/components/dashboard/orders-board.tsx](../src/components/dashboard/orders-board.tsx) ahora hace `await supabase.realtime.setAuth(session.access_token)` antes de `.subscribe()`. Además se documenta el setup de Supabase Realtime publication como paso obligatorio (no recovery).

**Por qué:** bug reportado por el dueño: el panel `/pedidos` no se actualizaba al llegar pedidos nuevos, había que recargar manualmente. Tras diagnosticar:
1. La tabla `orders` no estaba en la publication `supabase_realtime` (esperado: `bunx supabase db push` no la agrega — es setup manual de Supabase, no migration).
2. Aún con la publication arreglada, el canal recibía `SUBSCRIBED` pero ningún evento llegaba. Causa: `@supabase/ssr` `createBrowserClient` resuelve la sesión vía cookies para queries, pero **no sincroniza automáticamente el JWT con el cliente Realtime**. Sin JWT, Realtime aplica RLS contra rol `anon`, y la policy `orders_staff_select for select to authenticated using is_staff()` filtra todos los eventos silenciosamente.

**Cómo aplica, decisiones no triviales:**
- **Patrón correcto en cualquier futura suscripción Realtime con RLS**: dentro del `useEffect`, primero `getSession()`, luego `realtime.setAuth(token)`, después `subscribe`. Aplica también a [driver-orders-list.tsx](../src/components/dashboard/driver-orders-list.tsx) (mismo patrón) — no se ha visto fallar porque se prueba menos, pero conviene aplicar el mismo fix preventivamente la próxima vez que se toque.
- **No usar `onAuthStateChange` para resuscribir**: el caso real es que la sesión ya existe al montar (el user está logueado, sino no entraría al panel). Manejar refresh-token es complicación innecesaria.
- **IIFE async dentro del `useEffect`**: `useEffect` no acepta async directo. La IIFE lleva flag `cancelled` para no setear el canal si el componente desmonta antes del `await`.
- **SQL setup obligatorio (no en migrations, es manual en Studio)**:
  ```sql
  alter publication supabase_realtime add table orders;
  alter publication supabase_realtime add table order_items;
  alter publication supabase_realtime add table order_status_events;
  ```
  Verificar con `select * from pg_publication_tables where pubname = 'supabase_realtime';` (debe devolver 3 filas).
- **Comentario en código** explica el por qué del `setAuth` — lo dejé porque sin él un dev futuro lo borraría como "código muerto" y el bug volvería silenciosamente.

### 2026-04-18 — Validar pago aprobado antes de asignar driver (fix bug)
**Qué:** [src/features/orders/actions.ts](../src/features/orders/actions.ts) `assignDriver()` agregó 3 validaciones que faltaban:
1. **Estado del pedido permitido**: rechaza asignación si status ∉ `["payment_approved", "preparing", "ready", "on_the_way"]`. Previene asignar domiciliario mientras está en `awaiting_payment`.
2. **Validar driver existe**: si `driverId != null`, confirma que existe en `staff` table con `role='driver'` (evita asignar a UUID inválido).
3. **Warning visual en UI**: [src/components/dashboard/order-detail-sheet.tsx](../src/components/dashboard/order-detail-sheet.tsx) `DriverAssignment` muestra alerta ámbar + deshabilita selector si status no es asignable. Mensaje diferenciado: "Aprueba el comprobante de pago antes de asignar" si `awaiting_payment`.

**Por qué:** bug reportado: se podía asignar un repartidor a un pedido con pago digital pendiente, permitiendo que la cocina preparara sin confirmar dinero. Riesgo de pérdida de comida.

**Cómo aplica:**
- Flow correcto: Cliente paga (estado → `payment_approved` automático si efectivo, o staff aprueba comprobante → `payment_approved`) → **ahora sí** se puede asignar driver.
- Backend rechaza con error descriptivo; frontend lo captura y muestra toast.
- Reasignación sigue permitida en tránsito (status `on_the_way`), usado si el driver se descompone.

### 2026-04-18 — Comandos PowerShell en DEMO_RUNBOOK
**Qué:** [docs/DEMO_RUNBOOK.md](../docs/DEMO_RUNBOOK.md) actualizó sintaxis de los comandos `gen-login-link.ts` y `gen-order-link.ts` para Windows PowerShell: variables de entorno con `$env:VAR="value"; command` (no bare assignment).
**Por qué:** user en Windows ejecutó la sintaxis bash y PowerShell lo interpretó como invocación de comando, rompiendo con `CommandNotFoundException`. La sintaxis correcta requiere comillas y punto-y-coma.

### 2026-04-17 — Launch checklist (A/B/C) + no customizar antes del "sí"
**Qué:** [docs/LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) documenta explícitamente el split entre (A) lo que falta para poder vender, (B) lo que se construye después del commit verbal del cliente, y (C) lo que queda fuera hasta segundo aviso (PrintNode, webhook WhatsApp activo, multi-branch, etc.).
**Por qué:** tras ver las 3 sedes de Pizzas Family (Campiña/Bello Horizonte/Santander) y la tentación de agregar multi-branch, el dueño tomó la decisión correcta: **congelar toda customización específica a un cliente hasta tener "sí" verbal**. El sistema queda genérico (single-location) y el primer cliente decide cuál feature rompe el "fuera de scope".
**Cómo aplica:**
- **Riesgo cero identificado:** A5 — un pedido end-to-end real contra Supabase NUNCA se ha probado. Todo lo visto es demo mode. Antes de cualquier pitch, resolver esto (1h).
- **No construir PrintNode** hasta ver la ticketera real del cliente (PRD §16 lo tenía "abierto").
- **No construir multi-branch** hasta commit del cliente — si éste tiene 3 sedes, ~1 semana de refactor post-venta.
- **Mientras Meta no esté aprobada** (3-4 semanas), bloque B reemplaza el webhook automático con flujo manual copiable desde el panel.



### 2026-04-16 — Carta real cargada (33 pizzas) + reglas de negocio detectadas
**Qué:** [src/features/catalog/demo-fixtures.ts](../src/features/catalog/demo-fixtures.ts) y [supabase/seed.sql](../supabase/seed.sql) reescritos con las **33 pizzas reales** de la carta del cliente (extraídas de fotos), agrupadas en 5 tiers de precio: T1 (22/33/42/51/63) × 9 productos · T2 (23/34/44/53/65) × 10 · T3 (23/35/45/56/68) × 8 · T4 (24/36/47/58/70) × 5 · T5 Marinera 34/47/60/72/93. Todas con `max_flavors=2`, `min_size_for_multiflavor='pequena'`, `category='pizza'`. El seed usa CTE con UPSERT idempotente.
**Por qué:** la carta del restaurante es la fuente principal del MVP. Cargarla ahora desbloquea el dev poder navegar `/menu` y `/pedir/<token>` con datos reales (en demo) y el cliente poder hacer `supabase db seed --linked` cuando despliegue.
**Cómo aplica:**
- Slugs predecibles en demo: `demo-product-<slug>` (ej: `demo-product-hawaiana`, `demo-product-pollo-bbq`).
- En el SEED real (Supabase) los IDs son `gen_random_uuid()` por inserción. Idempotencia vía `on conflict do nothing` (products) + `on conflict (product_id, size) do update set price_cents` (sizes — permite re-correr el seed para corregir precios).

### 2026-04-16 — Mitad-y-mitad con regla "valor más alto" implementada
**Qué:** migration [0004_order_items_flavors_uuid.sql](../supabase/migrations/0004_order_items_flavors_uuid.sql) cambia `order_items.flavors` de `text[]` a `uuid[]` (referencias a `products.id`; sin FK porque Postgres no soporta FK a elementos de array — integridad validada en app). Helper puro [src/features/orders/compute-unit-price.ts](../src/features/orders/compute-unit-price.ts) calcula el precio con `Math.max(basePrice, ...flavorPrices)`. `createOrder` usa el helper server-side; `PizzaBuilder` usa la misma fórmula client-side. `getOrderDetail` resuelve `flavor_names: string[] | null` (rename de `flavors` en `OrderDetailItem`). `CartItem.flavors` ahora es `{ productId, name }[]`. localStorage bumped a `pfd:cart:v2` para invalidar carritos viejos. Schemas Zod: `z.array(z.uuid()).max(4)`. 38/38 tests verdes (10 del helper cubren casos: sin flavors, 1–4 flavors, base gana, flavor gana, product_or_size missing).
**Por qué:** la carta del restaurante dice "si desea combinar los sabores tener en cuenta que se toma el valor más alto". Soporta hasta 4 sabores (confirmado por el cliente).
**Cómo aplica, decisiones no triviales:**
- **Base entra al `Math.max`**: el producto principal (el que abre el builder) ES uno de los sabores implícitos de la pizza. Si el usuario abre Hawaiana ($63k familiar) y agrega Marinera ($93k) como sabor → se cobra $93k. Si abre Marinera y agrega Hawaiana → también $93k (base gana). Evita que el usuario "baje" el precio eligiendo sabor barato.
- **Frontend y backend usan la misma fórmula** para evitar sorpresas en el checkout. El backend recalcula igual con precios de DB (seguridad — no confía en `unitPriceCents` del cart).
- **Integridad referencial por app**: SQL no soporta FK a elementos de array. `createOrder` valida que cada UUID en flavors existe en `products.active=true` y tiene precio para el size; si no → error.
- **`flavor_names` se resuelve con una segunda query** (dedupe de UUIDs → `select id, name from products where id = any($uuids)`). Fallback `"Desconocido"` si el id no está (producto fue eliminado/inactivado después de la orden).
- **Bump `pfd:cart:v2`**: los carritos viejos (localStorage `pfd:cart:v1`) tenían `flavors: string[]` de nombres; no se pueden mapear a UUIDs sin lookup. Mejor invalidar silenciosamente.
- **`max_flavors` schema permite hasta 4** (ya lo hacía, confirmado). La validación por-producto sigue siendo `flavors.length <= product.max_flavors`.

### 2026-04-16 — Reglas de negocio detectadas en la carta (NO implementadas aún — entry histórica, reemplazada por la de arriba)
**Qué:** dos reglas explícitas en el menú real que el código actual NO maneja:
1. **"Si desea combinar los sabores se toma el valor más alto"** — mitad-y-mitad entre dos pizzas de tiers distintos cobra el más caro. Hoy `createOrder` calcula `unit_price_cents` desde UN solo `(productId, size)` y `flavors` es solo un array de strings de toppings; no soporta mezclar dos productos con sus precios.
2. **Productos no-pizza** (hamburguesas, entradas, bebidas, otros platos, adiciones) — son precio único, no encajan en el schema de 5 tamaños forzados.
**Por qué:** registrarlas explícitamente para que un futuro ticket no las olvide. Ambas son cambios estructurales (schema + actions + UI builder).
**Cómo aplica — propuestas para tickets futuros:**
- **Para regla 1:** cambiar `order_items.flavors text[]` por algo más rico (o agregar `flavors_product_ids uuid[] references products(id)`); en `createOrder` cuando hay >1 sabor, leer precios de todos los products involucrados y tomar `max(price_cents)`. Builder UI ya elige sabores como products de la misma category — solo falta enviar el array de productIds, no solo nombres.
- **Para regla 2:** dos opciones:
  - **A)** Schema: relajar Zod a `sizes.min(1).max(5)` y adaptar el form admin para mostrar inputs solo por sizes presentes (con checkboxes "Disponible en …"). Conserva el schema DB intacto (CHECK ya permite cualquier subset).
  - **B)** Free-form size: cambiar `product_sizes.size` de enum a text libre + agregar `display_label` para mostrar "1.5L", "Mega", etc. en bebidas. Refactor más grande, soporta el catálogo completo del restaurante (hamburguesas, bebidas, lasaña, calzoni, etc.).
- Recomendación: **A** primero (rápido, cubre 80% del catálogo), **B** cuando agreguen un menú con muchas variantes no-pizza.

### 2026-04-16 — F8 alertas de retraso (pg_cron + Route Handler)
**Qué:** [supabase/migrations/0003_delay_alerts.sql](../supabase/migrations/0003_delay_alerts.sql) habilita `pg_cron` + `pg_net`, crea tabla `cron_config` (key/value, RLS service_role), función `run_delay_alerts_job()` que hace `net.http_post` al endpoint con Bearer, y programa `*/2 * * * *`. [src/features/delay-alerts/run.ts](../src/features/delay-alerts/run.ts) con `runDelayAlerts()` (query candidatos: status no terminal + `eta_at < now - 10min` + `delay_notified_at is null`; UPDATE con `where delay_notified_at is null` como guardia doble; envía plantilla `pf_delay_apology`). [app/api/cron/delay-alerts/route.ts](../app/api/cron/delay-alerts/route.ts) thin controller con Bearer `CRON_SECRET`. Nueva env var `CRON_SECRET: z.string().min(16)`. Build verde con 13 rutas.
**Por qué:** diferenciador central del PRD §F8 — "el cliente se entera antes de preguntar". Evidencia real del chat del restaurante: cliente esperó 1h 06min y preguntó él mismo.
**Cómo aplica, decisiones no triviales:**
- **`cron_config` table vs Supabase Vault**: Vault requiere setup adicional + APIs distintas; una tabla con RLS `service_role only` es más legible y editable desde Studio. Aceptable para v1.
- **Guardia `where delay_notified_at is null` en el UPDATE**: defensa contra doble procesamiento si dos crons corrieran simultáneos. Si affect=0 → otro proceso lo marcó → skip silencioso.
- **Error del sender NO revierte el UPDATE**: `delay_notified_at` es la regla "una sola vez por pedido" (PRD §F8). Revertir abriría la puerta a spam si Meta falla intermitentemente. Errores se cuentan pero el flag queda. Reintentos manuales vía otro ticket futuro si molesta.
- **Validación Bearer solo en el Route Handler** (no en el SQL): defensa en profundidad, pero el SQL supabase ya se confía en que es único cliente que puede llamar al endpoint con el secret.
- **GET retorna 405**: el cron usa POST exclusivamente. Documenta la intención.
- **Requiere Supabase Pro** — `pg_cron` no está en free tier. Documentado en la migration + ENGRAM.
- **Local testing sin pg_cron**: el endpoint se puede curl-ar con Bearer, útil para desarrollo contra Supabase real.

**Deploy (pasos exactos):**
1. `bunx supabase db push` aplica 0003 (requiere plan Pro).
2. Supabase Studio → table `cron_config`: editar `delay_alerts_url` = `https://<dominio>/api/cron/delay-alerts` y `cron_secret` = un valor random (`openssl rand -base64 32`).
3. Vercel env vars: `CRON_SECRET` con el MISMO valor que `cron_config.cron_secret`. Redeploy.
4. Verificar en Supabase: `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'delay_alerts_every_2min') order by start_time desc limit 20;`
5. Smoke local: `curl -i -X POST http://localhost:3000/api/cron/delay-alerts -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d '{}'` → `200 {"ok":true,"processed":N,"errors":0}` (en demo: `processed:0` siempre).

**Deuda menor:** tests unitarios de `runDelayAlerts()` skipped (mockear el Proxy de `supabaseAdmin` es costoso; la lógica es lineal, la superficie externa es HTTP, se valida manual contra Supabase real).

### 2026-04-16 — CRUD de menú admin (`/menu`)
**Qué:** backend en [src/features/catalog/](../src/features/catalog/): `listAllProducts()`, `getProduct(id)`, actions `createProduct`, `updateProduct`, `toggleProductActive`, `deleteProduct` (soft — solo cambia `active=false`); schemas Zod 4 (`productInputSchema` con validación de 5 tamaños únicos + precios int, `productUpdateInputSchema`, constantes `PIZZA_SIZES`, `PRODUCT_CATEGORIES = ['pizza','bebida','adicional']`). Fixtures demo en `demo-fixtures.ts` (4 productos: Hawaiana, Pepperoni, Coca-Cola, Pizza Edición Limitada inactiva). UI en [app/(dashboard)/menu/page.tsx](../app/(dashboard)/menu/page.tsx) (guarda admin-only) + [menu-list.tsx](../src/components/dashboard/menu-list.tsx) (búsqueda, filtros por categoría, toggle "Mostrar inactivos", lista cards en móvil, `<Table>` en desktop, FAB móvil) + [product-form-sheet.tsx](../src/components/dashboard/product-form-sheet.tsx) (RHF+zodResolver, 5 inputs de precio con preview `formatCop` en vivo, validación visual). Tests catalog/schemas.test.ts (7 tests). Total 28/28 verdes.
**Por qué:** permite cargar el menú real del restaurante sin tocar Supabase Studio. Cierra parte de semana 3 del PRD §13.
**Cómo aplica, decisiones no triviales:**
- **Soft delete (`active=false`) en vez de DELETE**: `order_items` referencia productos pasados; un hard delete rompe la auditoría de órdenes históricas. Comentado en la action.
- **Sin bucket de imágenes** en v1: el form acepta URL pegada (Imgur, Cloudinary, etc.). Deuda menor: cuando se necesite upload nativo, crear bucket público `product-images` y agregar action `uploadProductImage`.
- **Tipo del form = `z.input<typeof productInputSchema>`**: category tiene `.default('pizza')` haciendo el output required pero el input opcional. `z.input` evita choque con `zodResolver`; el submit se re-valida en el Server Action.
- **Sentinel `__none__`** en Select de `min_size_for_multiflavor` (mismo patrón que `__unassigned__` en driver assignment — Radix no permite `value=""`). El handler mapea a null.
- **Categorías cerradas**: `pizza|bebida|adicional`. Cuando aparezca una nueva (por ej. postres), extender la tupla en schemas. Intencionalmente rígido para evitar typos.
- **Precios en `price_cents` pero COP no usa centavos**: convención de consistencia con otros `_cents` del schema. El formatter `formatCop` muestra el valor tal cual (no divide por 100). Documentado desde antes.
- **`revalidatePath('/menu')` + `revalidatePath('/pedir/[token]', 'page')`** en cada mutation para que el catálogo público refleje el cambio.
- **Defensa en profundidad**: `shell.tsx` ya filtra la entry "Menú" por role admin; `menu/page.tsx` además llama `requireStaff({ roles: ['admin'] })`. Dos capas.
- **Demo mode**: acciones son no-op `{ ok: true }` + log. Al intentar guardar en demo el UI muestra toast success pero no persiste — comportamiento consistente con el resto del panel demo.

### 2026-04-16 — Vista mensajero + asignación de driver desde panel
**Qué:** [app/(dashboard)/mensajero/page.tsx](../app/(dashboard)/mensajero/page.tsx) (RSC, cualquier role permitido — ver "Cómo aplica"), [src/components/dashboard/driver-orders-list.tsx](../src/components/dashboard/driver-orders-list.tsx) y [driver-order-card.tsx](../src/components/dashboard/driver-order-card.tsx) (Cards grandes mobile-first con dirección destacada, tap-to-call, "Abrir en Google Maps", botones "Salgo"/"Entregado"). Nuevas queries `listOrdersForDriver(driverId | null)` y `listActiveDrivers()` (con demo branches). [order-detail-sheet.tsx](../src/components/dashboard/order-detail-sheet.tsx) gana un `<Select>` de shadcn para asignar/reasignar/desasignar driver — recibe `drivers: ActiveDriver[]` por prop drilling desde [pedidos/page.tsx](../app/(dashboard)/pedidos/page.tsx). Build verde con 12 rutas; 21/21 tests siguen pasando.
**Por qué:** cierra la capa staff del PRD §13 semana 3 (panel + mensajero + impresión — falta la impresión). Sin esta vista los domiciliarios no tienen flujo dedicado y los pedidos no se asignan formalmente.
**Cómo aplica, decisiones no triviales:**
- **Filtro por rol en `/mensajero`**: si `staff.role === 'driver'` muestra solo `driver_id = staff.id`; si admin/cashier/kitchen muestra TODOS los `driver_id != null` (visión de flota). Implementado pasando `null` a `listOrdersForDriver` para el modo flota.
- **Sin restricción de role en la ruta**: cualquier staff puede entrar a `/mensajero` (premature gate). El que decide qué ver es el filtro arriba. Restringir por rol a `driver+admin` queda en backlog para v1.1 cuando haya cuentas reales.
- **Drivers via prop drilling**: `pedidos/page.tsx` hace `Promise.all([requireStaff, listActiveOrders, listActiveDrivers])` y pasa `drivers` por `OrdersBoard → OrderDetailSheet`. Evita Server Action extra; el sheet ya re-renderiza por orden seleccionado.
- **Sentinel `__unassigned__`** en el `<Select>` para mapear `null ↔ "__unassigned__"` (Radix `SelectItem` no acepta `value=""`). El componente `DriverAssignment` mantiene estado local con rollback si la action falla.
- **Realtime**: `DriverOrdersList` salta la subscripción en demo mode (no intenta conectar a `demo.supabase.co`); en prod usa el mismo patrón de `OrdersBoard` (`postgres_changes` → `router.refresh()` con `useTransition` + spinner).
- **`window.confirm("¿Confirmar entrega?")`** para el botón "Entregado" (terminal, evita falsos taps en móvil); "Salgo" no necesita confirmación.
- **Botón "Entregado" en verde fuerte** (`bg-emerald-600`) — excepción a tokens de marca, justificada por feedback claro de cierre en móvil. Consistente con verdes ya usados en `status-badge` para `ready`/`delivered`.
- **Google Maps**: hardcode `, Medellín, Colombia` en el query string del link. Single-tenant en v1; cuando llegue 2do cliente mover a `settings.business_city`.
- **`viewerId` aceptado en `DriverOrdersList`** aunque no se use aún — queda en el contrato para futuras restricciones de acción por owner.

### 2026-04-16 — Webhook WhatsApp Cloud API end-to-end + vitest
**Qué:** [src/features/whatsapp/](../src/features/whatsapp/) completo: `parse-payload` (Zod 4 union text/image/other tolerante), `verify-signature` (HMAC SHA256 + `timingSafeEqual` + bypass demo), `intents` (módulo puro: `greet`/`status_inquiry`/fallback con normalización de tildes), `templates` (catálogo `pf_*` typed con `templateForStatus`), `sender` (real Graph API: `sendTemplate`, `sendTextMessage`, `sendOrderStatusTemplate` mantiene la firma del stub anterior), `download-media` (2 GETs: metadata + bytes), `greet` (upsert customer no destructivo + `signToken` + plantilla `pf_greet`), `handle-incoming` (orquesta idempotencia + intents + asociación de comprobante por imagen). Route handler `/api/webhooks/whatsapp` (GET verify + POST con HMAC + body raw, **siempre 200** para no provocar reintentos de Meta). Migration 0002 con tabla `whatsapp_messages_seen` (idempotencia). Vitest instalado + config con alias `@/` + `server-only` aliasado a `empty.js` para tests; 21 tests pasan.
**Por qué:** semana 4 del PRD §13. Adelantarnos al trámite Meta (semanas) — el código queda dormido y al aprobarse Meta + plantillas + env vars solo "se enchufa".
**Cómo aplica, decisiones no triviales:**
- **Idempotencia con UPSERT** en `whatsapp_messages_seen` (`ignoreDuplicates: true` + `select()` para distinguir fresh vs duplicado).
- **Errores aislados por mensaje** (try/catch por iteración) — un payload malo no rompe el batch.
- **Asociación de comprobante (Camino B PRD §F9)**: handle-incoming busca `orders` con `needs_proof=true and status='awaiting_payment'`, descarga la imagen de Meta, sube a Storage en `orders/${order.id}/${uuid}.<ext>`, UPDATE `payment_proof_url` (path, no URL pública) + `needs_proof=false`, y registra `order_status_events` con `from=to=status_actual` para auditoría.
- **Webhook siempre retorna 200** incluso ante JSON.parse fallido o handler que tira — Meta reintenta agresivo con ≠2xx y duplicaría todo.
- **Body raw obligatorio** en POST (`req.text()` antes de `JSON.parse`) para HMAC byte-a-byte.
- **Demo mode preservado**: `verifyMetaSignature` retorna true; `sender`, `greet`, `downloadMedia` son no-op con log; `handle-incoming` igual procesa intents y estructura, pero los efectos externos quedan stubbed. GET verify acepta cualquier token en demo.
- **Vitest:** `server-only` se aliasa a `empty.js` para que los tests puedan importar features sin que el guardarraíl Server-only tire en environment Node.
- **Plantillas**: nombres `pf_<key>` definidos por convención; el cliente las debe registrar en Meta Business Manager exactamente con esos nombres en idioma `es_CO`. Si Meta rechaza un nombre → ajustar `templates.ts`. Plantillas que necesitan params: `pf_greet` (nombre, link), `pf_status_response` (estado, min). Resto sin variables.

**Setup que el usuario debe hacer en Meta para activar (NO se puede testear E2E sin esto):**
1. Crear app en Meta for Developers → producto WhatsApp Cloud API.
2. Llenar 4 vars: `WHATSAPP_VERIFY_TOKEN` (string que tú elijas), `WHATSAPP_APP_SECRET` (App Secret), `WHATSAPP_ACCESS_TOKEN` (System User token permanente), `WHATSAPP_PHONE_NUMBER_ID` (ID del número en Cloud API), más `NEXT_PUBLIC_APP_URL` apuntando a la URL pública.
3. Configurar webhook en Meta: callback `https://<dominio>/api/webhooks/whatsapp`, verify token = el mismo string, suscribir campo `messages`.
4. Registrar 10 plantillas (`pf_greet`, `pf_payment_received`, `pf_payment_approved`, `pf_preparing`, `pf_ready`, `pf_on_the_way`, `pf_delivered`, `pf_delay_apology`, `pf_status_response`, `pf_proof_request`) y esperar aprobación.
5. `bunx supabase db push` para aplicar la migration 0002.

**Smoke local (demo mode) sin Meta**: curl GET con `?hub.mode=subscribe&hub.verify_token=demo&hub.challenge=12345` → 200 con "12345". curl POST con payload de mensaje texto → 200 `{"ok":true}` (los efectos quedan stubbed).

### ~~2026-04-16 — Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`)~~ _(removido el 2026-04-30, ver entrada al inicio del log)_
~~**Qué:** [src/lib/demo.ts] definía `isDemoMode()` + placeholders de env. Cuando `NEXT_PUBLIC_DEMO_MODE=true`, `getClientEnv`/`getServerEnv` retornaban placeholders, middleware hacía passthrough, `getCurrentStaff()` retornaba `DEMO_STAFF`, queries de orders/catalog retornaban fixtures, mutaciones eran no-ops `{ ok: true }`. Útil mientras no había `.env.local` ni prod desplegado.~~ El reflejo "hidratación con `timeZone: America/Bogota` en formatters" sigue vigente como guía general (ver `OrderCard`) aunque la entrada como tal ya no aplica.

### 2026-04-16 — Login de staff + middleware + panel `/pedidos`
**Qué:** entregadas las features `auth` (`getCurrentStaff`, `requireStaff`, `requestMagicLink`, `signOut`), `orders` extendido (`listActiveOrders`, `getOrderDetail`, `transitionOrder`, `approvePayment`, `rejectPayment`, `assignDriver`), `payments/signed-url` (`getSignedProofUrl`), `whatsapp/sender` (stub que solo logea hasta que el webhook real exista). UI: `/login` (RHF + Zod, magic link via Supabase OTP), Route Handler `/auth/callback` (exchangeCodeForSession), `(dashboard)` layout con shell responsivo (sidebar lg+, hamburger sheet en móvil) + nav, `/pedidos` panel con `OrdersBoard` realtime, `OrderCard`, `OrderDetailSheet` con acciones de transición. Placeholders "Próximamente" en `/mensajero`, `/menu`, `/settings`. Build verde con 11 rutas.
**Por qué:** semana 3 del PRD §13. Sin esto el panel no es navegable, no se aprueban pagos, no se transicionan estados.
**Cómo aplica, decisiones no triviales:**
- **`middleware.ts` en raíz** (Next 16 sugiere `proxy.ts` — warning informativo, no bloqueante; deuda menor: rename + 2 imports). Protege `/pedidos`, `/mensajero`, `/menu`, `/settings`. Usa `supabase.auth.getUser()` (no `getSession()` — éste no re-valida server-side). Si hay user y pide `/login` → redirect a `/pedidos`. Middleware NO consulta DB para validar rol; eso lo hacen los layouts/pages con `requireStaff({ roles })`.
- **`requireStaff` redirige a `/pedidos`** si el rol no aplica (no creamos `/403`); todos los staff pueden ver la cola base, es un aterrizaje neutro.
- **Realtime con `router.refresh()`**: una sola subscripción a `postgres_changes` en `orders`, dispara `startTransition(() => router.refresh())`. Evita re-fetch a mano y mantiene el RSC como fuente de verdad.
- **Comprobante en panel**: `getSignedProofUrl` (admin client, signed URL 1h) + `next/image unoptimized` + Dialog fullscreen al tap. Igual patrón que checkout cliente — sin tocar `next.config.ts`.
- **`payment_rejected` limpia `payment_proof_url` y marca `needs_proof=true`**: esto deja al cliente reintentar por cualquiera de los 2 caminos del comprobante (web o WhatsApp) sin lógica adicional.
- **Selector de driver pospuesto a v1.1**: el botón "En camino" funciona sin pedir driver explícito (queda asignación manual en backlog).
- **Confirmaciones con `window.confirm`** en vez de instalar `alert-dialog` de shadcn — menos superficie por ahora.
- **Filtros del panel como URL params**: server-side filter, URLs compartibles, sin estado cliente.
- **WhatsApp sender es stub** (`console.log`, retorna `ok:true`). `transitionOrder` ya lo llama; cuando el webhook real exista solo hay que reemplazar el stub.
- **Onboarding manual de staff por ahora**: no hay trigger que cree `profiles` automáticamente al primer login. El usuario inserta filas en Studio: `INSERT INTO profiles (id, role, display_name, active) VALUES ('<auth.users.id>', 'admin', 'Nombre', true)`.

### 2026-04-16 — Env vars lazy + supabaseAdmin como Proxy
**Qué:** `src/lib/env.ts` convirtió `clientEnv` en `getClientEnv()` (mismo patrón que `getServerEnv()`). `src/lib/supabase/admin.ts` exporta `supabaseAdmin` como `Proxy` que construye el cliente en el primer acceso a una propiedad.
**Por qué:** la validación eager al cargar el módulo rompía `next build` ("Invalid public env vars") y el dev server en cada request, incluso para rutas que no usan Supabase. Necesitamos que importar el módulo NO dispare efectos secundarios.
**Cómo aplica:** las features que hacen `import { supabaseAdmin } from '@/lib/supabase/admin'` siguen funcionando sin cambios — el Proxy resuelve y enlaza métodos al instance real al primer `.from()`. El build se generó con 4 rutas (`/`, `/pedir/[token]`, `/checkout`, `/gracias`) sin `.env.local`. Las rutas que llegan a Supabase siguen fallando en runtime si faltan vars, lo cual es lo correcto.

### 2026-04-16 — Flujo completo del cliente end-to-end (catálogo → pedido → gracias)
**Qué:** entregadas las features `order-tokens`, `catalog`, `orders`, `payments`, `cart` (13 archivos en `src/features/`) y las páginas `app/(shop)/pedir/[token]/{page,checkout/page,gracias/page}.tsx` + componentes `src/components/shop/{catalog,pizza-builder,cart-sheet,checkout-form}.tsx`. Build `bun run build` verde (4 rutas), `tsc` limpio.
**Por qué:** segundo ticket grande del MVP (PRD §13 semana 2). Desbloquea que un pedido real se pueda capturar apenas exista `.env.local` con Supabase.
**Cómo aplica, decisiones no triviales:**
- **Token 2-step:** `verifyToken` SOLO lee (`used_at` se marca dentro de `createOrder` al insertar la orden). Razón: si verify marcara en el primer page load, el refresh del catálogo mataría al cliente antes del checkout.
- **Precios recalculados server-side:** `createOrder` nunca confía en precios del input; los carga de `product_sizes` por `(productId, size)` y recompone el total. Seguridad básica.
- **Regla de sabores (mitad-y-mitad) pragmática:** el UI oculta la sección entera si `max_flavors <= 1` o `size < min_size_for_multiflavor`; cuando aplica, los "sabores" son los OTROS productos de la misma `category`, hasta `max_flavors` marcados (sin "sabor principal" preseleccionado). Simplifica el MVP.
- **`uploadPaymentProof` espera `orderTokenId` pero el cliente solo tiene el token opaco** → se creó wrapper `src/features/cart/upload-proof-by-token.ts` (Server Action) que llama `verifyToken` para resolver el id y forwardea el upload. Mantiene la seguridad: sin token vivo no hay upload.
- **Estado inicial de orden:** cash → `preparing`; transferencia + comprobante → `awaiting_payment` con proof; transferencia sin comprobante → `awaiting_payment` + `needs_proof=true` (Camino B del PRD §F9). `order_status_events` se inserta con `from_status=null`, `actor_id=null` (sistema).
- **Carrito:** estado en cliente con localStorage `pfd:cart:v1`. Inicia `null` y se hidrata en `useEffect` para evitar mismatch SSR.
- **Imágenes:** `next/image` con `unoptimized` para evitar tocar `next.config.ts` `images.remotePatterns`. Deuda menor: cuando el catálogo crezca, configurar el dominio de Supabase Storage.
- **Helper `getOrderConfirmation`** en `src/features/orders/queries.ts` (nuevo archivo) para la página de gracias — usa `supabaseAdmin` desde RSC a propósito (el cliente no está autenticado; las alternativas con RLS y `anon` no aplican acá).
- **Consecuencia del diseño de tokens:** tras completar un pedido el token queda `used`. El botón "Volver al inicio" de gracias lleva a `/pedir/${token}` que mostrará "enlace usado". Cliente debe pedir otro link por WhatsApp para un segundo pedido. Alineado con "un solo uso" del PRD §F2.

### 2026-04-16 — Schema inicial Supabase + RLS (single-tenant)
**Qué:** [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql) crea las 10 tablas del PRD §9.3 (profiles, customers, addresses, products, product_sizes, order_tokens, orders, order_items, order_status_events, settings) + bucket `payment-proofs` privado. CLI `supabase` instalado como devDep, `supabase init` corrido (genera `config.toml`). Seed mínimo en [supabase/seed.sql](../supabase/seed.sql) (1 settings, 2 productos × 5 tamaños).
**Por qué:** alinea infra con el modelo de datos del PRD para que Server Actions y queries del próximo ticket se construyan contra un schema real.
**Cómo aplica:**
- Helper SQL `is_staff()` (SECURITY DEFINER) lee `profiles.active` para autorizar staff.
- Patrón RLS por tabla: `service_role` full + staff (CRUD según corresponda). `anon` solo SELECT en `products`/`product_sizes` (`active=true`) y `settings` (necesario para que el catálogo público lea `business_name` y cuentas de pago).
- `order_tokens`: SOLO `service_role` — el token nunca lo lee el cliente, lo verifica el server con `supabaseAdmin`.
- `settings` usa CHECK con UUID constante para forzar singleton.
- Singletop trigger `set_updated_at()` solo en `settings` (no se sobreingenia el resto).
- Migration es **idempotente** (cada `create` con `if not exists`, cada policy con `drop policy if exists`). Re-correr la migration no rompe.
- TODO inline en el migration: regenerar tipos con `bunx supabase gen types typescript --linked > src/lib/supabase/database.types.ts` después de `supabase link`.
- Pendiente del orquestador: `bunx supabase login` → `link --project-ref <ref>` → `db push` → `db seed` → `gen types`.

### 2026-04-16 — Identidad de marca: terracota + mostaza + serif para títulos
**Qué:** paleta y tipografía bloqueadas en `app/globals.css` y `app/layout.tsx`:
- `--primary` terracota `oklch(0.58 0.15 35)` (botones primarios, focus ring, header brand)
- `--secondary` mostaza `oklch(0.79 0.14 78)` (chips activos tipo "Pequeña", badges)
- Neutros cálidos (no fríos): background `oklch(0.985 0.005 80)`, foreground `oklch(0.22 0.02 45)`
- Charts mapean: `chart-1` terracota, `chart-2` mostaza, `chart-3` azul (terciario reservado), `chart-4` verde, `chart-5` morado
- Fuentes: **Inter** vía `next/font/google` para body (`--font-sans`), **Playfair Display** para títulos (`--font-serif`, clase `font-serif`)
**Por qué:** mockups del cliente muestran un look cálido artesanal (terracota + mostaza sobre crema), titulares en serif elegante. Aplicar la marca desde el día 1 evita reskins después y alinea a UI Agent.
**Cómo aplica:** todo componente nuevo usa tokens (`bg-primary`, `text-foreground`, `font-serif text-3xl` para títulos, `font-sans` por default). Nada de hex inline.

### 2026-04-16 — Andamiaje del repo (v0)
**Qué:** estructura base de [PRD §10](PRD.md) en disco. `tsconfig` alias `@/*` → `./src/*`. Deps instaladas: `@supabase/supabase-js`, `@supabase/ssr`, `zod@4`, `server-only`, `lucide-react`, `sonner`, `clsx`, `tailwind-merge`, `cva`, `react-hook-form`, `@hookform/resolvers`. shadcn/ui inicializado (style `new-york`, baseColor `zinc` — luego sobreescrito por la paleta de marca, ver entrada arriba), `Button` instalado, `tw-animate-css` agregado por shadcn para Tailwind v4. Clientes Supabase listos en `src/lib/supabase/{client,server,admin}.ts`. Validación de env en `src/lib/env.ts` (split `clientEnv` síncrono + `getServerEnv()` perezoso, con `server-only`).
**Por qué:** desbloquea a UI Agent y Data Agent para construir features sin tener que cablear infra cada vez.
**Cómo aplica:** `bunx tsc --noEmit` y `bun run build` pasan. `app/page.tsx` es smoke test del look & feel; `/login`, `/pedidos`, `/mensajero`, `/menu`, `/settings`, `/pedir/[token]`, `/api/webhooks/whatsapp`, `/api/print/[orderId]` son carpetas vacías esperando sus tickets. Pendiente: schema de Supabase (Data Agent), middleware de auth, página de login, /pedir/[token] real.

### 2026-04-16 — Zod 4 en lugar de Zod 3
**Qué:** se instaló `zod@4.3.6` (latest). `src/lib/env.ts` usa APIs nuevas: `z.url()` (antes `z.string().url()`) y `z.prettifyError(error)` para mensajes legibles.
**Por qué:** evita pagar la migración a Zod 4 después; `@hookform/resolvers/zod` y `@supabase/ssr` ya son compatibles.
**Cómo aplica:** schemas nuevos en features deben usar la API v4 (no `errorMap`, no `z.string().email()` — usar `z.email()`, etc.).

### 2026-04-16 — Single-tenant en v1 (revertido desde multi-tenant)
**Qué:** el MVP arranca single-tenant. Se quitan tablas `tenants`, `subscription_payments`, `tenant_id` en tablas operativas, panel `/super-admin`, rol `super_admin`, pg_cron de cobros.
**Por qué:** con 1 solo cliente, multi-tenant agrega ~3-4 días de trabajo sin beneficio. Cuando aparezca el 2do cliente → migración script + construir super-admin en 2-3 días.
**Cómo aplica:** el schema va simple. El control del trial/pago se hace con una fila en `settings` (`trial_ends_at`, `paid_until`) que tú actualizas manualmente en Supabase Studio.

### 2026-04-16 — Comprobante de pago híbrido (upload + WhatsApp)
**Qué:** el cliente puede subir el comprobante en el catálogo web **o** enviarlo por WhatsApp; el webhook de imágenes lo asocia al pedido pendiente del teléfono.
**Por qué:** el flujo real del restaurante hoy es WhatsApp; obligar upload sería fricción para clientes mayores.
**Cómo aplica:** `orders.needs_proof=true` marca pedidos sin comprobante; webhook de WhatsApp sube la imagen a Storage y la asocia.

### 2026-04-16 — Alerta proactiva de retraso subida a MVP
**Qué:** pg_cron cada 2 min marca `delayed=true` y notifica al cliente si el pedido supera su ETA + 10 min, una sola vez por pedido.
**Por qué:** evidencia real del chat del restaurante: cliente esperó 1h 06 min y tuvo que preguntar él si "pasó algo". Ese mensaje es el dolor que evitamos.
**Cómo aplica:** feature `delay-alerts/`, flag `delay_notified_at` en `orders` para no repetir.

### 2026-04-16 — Modelo de productos por tamaños + reglas de sabores
**Qué:** tabla `products` base + tabla `product_sizes` (5 precios por producto). Regla: "mitad y mitad desde Pequeña" (`max_flavors`, `min_size_for_multiflavor`).
**Por qué:** la carta real del restaurante tiene 5 tamaños (Personal, Pequeña, Mediana, Grande, Familiar) con precios distintos y reglas de sabores por tamaño.
**Cómo aplica:** `order_items.size` y `order_items.flavors text[]` para pedidos con dos sabores.

### 2026-04-16 — Dirección estructurada (formato Colombia)
**Qué:** `addresses` con campos separados: `street`, `complex_name`, `tower`, `apartment`, `neighborhood`, `references`, `zone`.
**Por qué:** las direcciones colombianas en conjuntos residenciales tienen estructura jerárquica ("Cll 63b # 105-95, Cantares 2, Torre 10, Apto 203").
**Cómo aplica:** el formulario del checkout usa los campos separados; se concatena solo para mostrar.

### 2026-04-16 — Sin pasarela de pagos en v1
**Qué:** el cobro del cliente al restaurante se hace por Nequi/Bancolombia/Llave y comprobante manual; el cobro del restaurante al dev también es manual (Google Calendar + WhatsApp + Nequi).
**Por qué:** evita comisiones (3% Wompi/Bold), mantiene la infra simple, el flujo ya es así en la práctica.
**Cómo aplica:** se migra a pasarela cuando haya 15+ clientes.

### 2026-04-16 — Cliente final NO inicia sesión
**Qué:** el cliente nunca se autentica. Se identifica por `phone` (E.164) como clave natural. El acceso al catálogo es por token firmado (HMAC, 2 horas, one-time). _TTL ampliado de 30 min → 2h el 2026-04-29; ver entrada al inicio del log._
**Por qué:** fricción cero, alineado con cómo ya compran (sin crear cuenta).
**Cómo aplica:** tabla `order_tokens` gestiona los links; solo el staff tiene `auth.users`.

### 2026-04-16 — Catálogo web, no parsing de texto libre
**Qué:** el pedido se arma SIEMPRE en el catálogo web `/pedir/[token]`. WhatsApp es solo el canal de entrada (saludo + link) y salida (notificaciones).
**Por qué:** parseo de texto/audio es costoso y poco fiable. El catálogo estructura el pedido por diseño.
**Cómo aplica:** si el cliente escribe texto libre, el bot le envía el link igual y alerta al cajero para atención manual.

### 2026-04-16 — Ticket impreso desde día 1
**Qué:** cada pedido nuevo (en `preparing` o al aprobar pago) dispara impresión vía PrintNode.
**Por qué:** en cocinas reales la ticketera no es opcional. Si se cae el Wi-Fi, el ticket ya salió.
**Cómo aplica:** Route Handler `/api/print/[orderId]`, feature `printing/` con cliente PrintNode.

### 2026-04-16 — Sin vista cocina dedicada en v1
**Qué:** el panel `/pedidos` es único. Cajero y cocina usan la misma vista.
**Por qué:** el ticket impreso cubre la lectura en cocina. Una vista aparte es trabajo extra sin beneficio con 1-2 personas.
**Cómo aplica:** si lo piden después, se agrega en ~1 día.

### 2026-04-16 — Tailwind exclusivo
**Qué:** prohibido CSS-in-JS, CSS Modules, archivos `.css` por componente.
**Por qué:** una sola herramienta, tokens en `@theme`, composición con `cn()`, variantes con `cva`.
**Cómo aplica:** ver RULES §4.

---

## Anti-patrones rechazados explícitamente

- ❌ `useMemo` / `useCallback` / `React.memo` sin profiling previo — ver RULES §3
- ❌ Multi-tenant antes de tener un 2do cliente real
- ❌ Panel super-admin custom mientras se pueda usar Supabase Studio
- ❌ Pasarela de pagos antes de 15 clientes
- ❌ Parser de texto libre para pedidos (el catálogo web lo estructura)
- ❌ Login / registro de cliente final
- ❌ App móvil nativa
- ❌ Analytics dashboard en v1 (primero se recolecta data)
- ❌ PostHog / Sentry / Inngest / Zustand / TanStack Query en v1
- ❌ Drizzle ORM (el client de Supabase alcanza)
- ❌ CSS-in-JS o CSS Modules

---

## Constraints que NO se pueden olvidar

- El 95% de los clientes llegan al catálogo desde el móvil (mobile-first no negociable)
- El restaurante tiene domiciliarios propios (no es integración con Rappi/Didi)
- Direcciones en Bogotá incluyen conjunto + torre + apartamento
- Moneda: COP (sin decimales, siempre `int` en `_cents` o `_cop`)
- WhatsApp Cloud API requiere verificación Meta (semanas) → arrancar trámite día 1
- El domicilio YA va incluido en el precio, no se cobra aparte
- Una pizza trae lechera + condimentos gratis (política estándar)

---

## Preguntas abiertas (actualizar cuando se resuelvan)

- [ ] Modelo exacto de ticketera del restaurante (define PrintNode vs ESC/POS)
- [ ] Número de WhatsApp Business (migrar `604 322 46 76` o nuevo)
- [ ] Zonas de entrega y sus ETA base (zona A=30min, zona B=45min, etc.)
- [ ] Datos de cuentas de pago (Nequi, Bancolombia, Llave) para el checkout
- [ ] Menú digitalizado completo con fotos y precios por tamaño

---

## Notas del orquestador (Claude main)

> Este bloque lo mantiene el orquestador. Registra lo que aprendió en cada sesión que sea útil para la siguiente. Máximo 10 entradas, las más viejas se archivan al final.

- 2026-04-16 — PRD pasó por 3 iteraciones (v1 → redimensionado → single-tenant). Evidencia real del chat del restaurante fue el punto de inflexión.
- 2026-04-16 — El usuario valora honestidad técnica ("no me vendas un cohete para una bicicleta"). Cuando dudes entre simplicidad y completeness, pregunta.
- 2026-04-16 — El usuario prefiere arrancar simple y migrar, sobre sobre-diseñar. Aplica YAGNI agresivo.
- 2026-04-16 — Mercado objetivo Colombia (COP, Nequi, Bancolombia, DIAN, Wompi/Bold eventualmente).

---

## Archivo (decisiones obsoletas, conservadas como historial)

*(Vacío por ahora. Mover aquí cualquier decisión que quede superada, no borrarla.)*
