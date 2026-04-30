# Auditoría — Lógica

Bugs silenciosos del modelo de datos, condiciones de carrera, autorización, integridad. Cosas que funcionan en el caso feliz pero rompen en edge cases reales.

> Prefijo de IDs: **L**

---

## L01 · `createOrder` no es atómico → pedidos zombi e direcciones huérfanas

- **Severidad:** high
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/features/orders/actions.ts:115-300](../../src/features/orders/actions.ts#L115-L300)

### Síntoma observable
Si una de las queries internas falla a mitad de camino (ej. timeout en `INSERT order_items`), quedan filas inconsistentes en DB:
- `addresses` insertada antes pero sin `orders` que la referencie
- `orders` creada sin `order_items` (pedido sin productos)
- `orders` con items pero sin `order_status_events`
- En todos los casos, el cliente ve "No pudimos crear tu pedido", reintenta, y si no hay restricción, **se duplica** todo.

### Causa raíz
La función ejecuta múltiples `INSERT` secuenciales con cliente service-role pero **sin transacción** (`begin`/`commit`). El `try/catch` solo evita que el error se propague al cliente, no revierte lo ya escrito. Postgres no revierte automáticamente porque cada llamada al cliente Supabase es una transacción independiente.

### Reproducción
1. Simular error después del INSERT de `addresses` y antes del INSERT de `orders` (ej. agregar `throw new Error()` artificial).
2. Verificar `select * from addresses where customer_id = ...` → fila huérfana.

### Fix propuesto
Mover toda la cascada a una **stored procedure** `create_order(jsonb)` que retorne `order_id`, ejecutada desde un solo `supabaseAdmin.rpc("create_order", ...)`. Postgres maneja la transacción nativamente. Alternativa: replicar `address_id` resuelto en una primera tx y mover los demás INSERT a `do $$ ... $$ language plpgsql`. ~1 día.

### Decisión de implementación · 2026-04-30

**Atacando el síntoma más real:** del bosquejo original ("orphan addresses,
orphan orders, duplicate orders on retry"), el más grave operativamente
es **el duplicado de pedidos cuando el cliente reintenta**. Hoy, si
`createOrder` falla a mitad de cascade, `markTokenUsed` (que vive AL
FINAL) NO se ejecuta. El cliente ve "No pudimos crear tu pedido", toca
"Confirmar" otra vez, `verifyToken` pasa porque `used_at` sigue null,
y se dispara una segunda inserción completa. El cajero ve dos pedidos
idénticos en el panel y tiene que cancelar uno.

**Por qué AHORA pero con alcance acotado:** la atomicidad completa (stored
procedure) es ~1 día y tensiona §1 RULES. El duplicado de pedidos lo
podemos cerrar HOY moviendo el `markTokenUsed` al inicio (~5 min). Los
orphans (addresses sin order, orders sin items) son tolerables si
filtramos en queries y dejamos limpieza como deuda. Resolver primero
lo que más duele al cliente, dejar la atomicidad estricta como deuda
con criterio claro de cuándo elevarla.

**Compatibilidad con RULES.md:**
- §1 Layering: ✅ stays — solo movemos una llamada de orden dentro del
  Server Action; sin lógica nueva en DB.
- §2 RSC: n/a.
- §3 Memoización: n/a.
- §4 Validación en bordes: ✅ alineado (la validación del token sigue al inicio).
- §5 Naming: n/a.
- §6 Pre-delivery: tsc, sin `any`, sin cambios de UI.

**Contradice algún hallazgo o ENGRAM:** parcialmente con ENGRAM 2026-04-16
("Token 2-step: `verifyToken` SOLO lee, `createOrder` marca `used_at`").
La razón original era "si verify marcara en el primer page load, el
refresh del catálogo mataría al cliente antes del checkout". Sigue
respetada — el primer page load llama `verifyToken`, NO `createOrder`.
Solo el botón "Confirmar pedido" llama `createOrder`. Mover
`markTokenUsed` al inicio de `createOrder` no afecta el page load.

**Alternativas evaluadas:**
1. **Stored procedure `create_order(jsonb)` con transacción atómica.**
   Atractiva (correctness completa) pero ~1 día y tensiona §1. Requiere
   migration nueva y refactor del call site. **Diferida a deuda L01-A**
   con criterio: subir a estado `in progress` cuando el piloto muestre
   ≥3 incidentes mensuales de orphans o duplicados.
2. **Idempotency key client-generated.** Cliente envía un UUID v4 con
   cada `createOrder`; server lo guarda en `orders.idempotency_key`
   con UNIQUE constraint. Si un retry llega con la misma key → falla
   por UNIQUE → server detecta y retorna el orderId existente. Más
   robusto pero requiere migration y refactor de schema. Mismo costo
   que stored proc; preferimos esa si vamos a la versión "completa".
   Diferida.
3. **Aceptar todo como deuda.** Descartada: el duplicado de pedidos es
   user-facing y operativo. Mover `markTokenUsed` cuesta 5 minutos.
4. **Dos llamadas atómicas separadas (Save Point pattern).** Descartada:
   complica el código sin resolver mejor que la stored proc.

**Alcance del cambio HOY (parcial, lo que cierra el dolor real):**
- [src/features/orders/actions.ts](../../src/features/orders/actions.ts):
  - Mover `markTokenUsed(tokenId)` al **principio** del bloque try
    (después de `verifyToken`, antes de cualquier INSERT). Si falla,
    abortar con error claro al cliente. Si tiene éxito, continuar.
  - El catch del try existente ya cubre el rollback parcial natural
    (Supabase insert fails → catch → return error). El usuario verá
    el error y NO podrá reintentar con el mismo token (lo cual es
    correcto: ese token ya está consumido, debe pedir uno nuevo por
    WhatsApp).
- [src/features/orders/queries.ts](../../src/features/orders/queries.ts):
  - `listActiveOrders` y `listOrdersForDriver` filtran orphans
    (`item_count > 0`) en el `mapActiveOrderRow` ya existente. Los
    orphans no aparecen en el panel.
- Total: ~10 líneas modificadas, sin migrations, sin nuevas dependencies.

**Deuda nueva creada:**
- **L01-A** en `audit/deuda-tecnica.md` (NO lo abro como nuevo finding
  porque es una porción de L01 diferida): "atomicidad estricta con
  stored procedure o idempotency key. Trigger: ≥3 incidentes
  mensuales de orphans/duplicados en piloto. Costo: ~1 día."

**Caveat consciente:** si entre `markTokenUsed` (que ahora va primero)
y el INSERT del order el cliente cierra el navegador, el token queda
consumido sin pedido creado. El cliente ve la página de confirmación
NO cargó. Tendrá que escribir al WhatsApp para pedir un link nuevo.
Esta es una pérdida de UX aceptable: la alternativa (token sigue vivo
+ duplicado al reintentar) es peor para el cajero.

**Cómo se valida que funcionó:**
- Manual: forzar un error en el INSERT de `orders` (ej. romper
  temporalmente el schema) → cliente ve error → al reintentar con
  el mismo link, recibe "Enlace ya usado" en lugar de un duplicado.
- Manual: pedido normal → todo funciona.
- tsc + 37 tests verdes.
- En piloto, monitorear `orders` para detectar orphans
  (`select count(*) from orders o where not exists (select 1 from order_items where order_id = o.id)`).
  Si supera 3/mes, escalar L01-A.

---

## L02 · Falta validación de rol en acciones críticas (privilege escalation)

- **Severidad:** high
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/features/orders/actions.ts:341,409,441](../../src/features/orders/actions.ts#L341)

### Síntoma observable
`transitionOrder`, `approvePayment`, `rejectPayment`, `assignDriver` solo verifican `getCurrentStaff()` (que esté autenticado) pero **NO chequean el rol**. Un usuario con rol `driver` podría — invocando manualmente la Server Action — aprobar un pago, marcar pedidos como entregados que no le pertenecen, o asignar pedidos a otros drivers.

### Causa raíz
La function helper `requireStaff({ roles })` existe en `auth/guards.ts` pero solo se usa en `catalog/actions.ts` (admin). Los actions de orders se quedaron en la versión laxa.

### Reproducción
1. Login como driver (rol `driver`)
2. Desde Devtools/curl, invocar la Server Action `approvePayment` con un orderId arbitrario
3. Resultado: pago marcado como aprobado por driver no autorizado

### Fix propuesto
Sustituir `getCurrentStaff()` por `requireStaff({ roles: [...] })` con la matriz:
- `transitionOrder` → según el `toStatus`: `cashier|admin` para pago/preparing/ready; `driver|cashier|admin` para `on_the_way`/`delivered`
- `approvePayment`/`rejectPayment` → `cashier|admin`
- `assignDriver` → `cashier|admin`

Ya existe el helper, son ~5 líneas por función. **30 minutos.**

### Decisión de implementación · 2026-04-30

**Atacando:** un usuario autenticado con rol `driver` puede invocar
`approvePayment(orderId)` por Server Action arbitrario (curl con cookie,
DevTools) y aprobar pagos sin estar autorizado. Mismo problema con
`assignDriver`, `rejectPayment`, y `transitionOrder` para estados que no
le competen. Adicionalmente: un driver podría marcar `delivered` un pedido
asignado a OTRO driver.

**Por qué AHORA:** vulnerabilidad real que afecta integridad financiera y
operativa. Estamos a un piloto del cliente real; un piloto con drivers
externos amplifica el riesgo. Costo del fix es bajo (~45 min vs el
estimado original de 30 min, porque al revisar surgió la constraint
driver-asignado).

**Compatibilidad con RULES.md:**
- §1 Layering: ✅ helpers en `features/auth`, callers en `features/orders`. Capas respetadas.
- §2 RSC default: n/a (Server Actions).
- §3 Memoización: n/a.
- §4 Validación en bordes: ✅ alineado — agregar chequeo de rol es validación al inicio del Server Action.
- §5 Naming: ✅ `assertStaffRole` (verbo imperativo, claro).
- §6 Pre-delivery: tsc limpio, sin `any`, mensajes de error claros para el toast del cliente.

**Contradice algún hallazgo o ENGRAM:** no. D11 documenta que `requireStaff`
redirige a `/pedidos`; este fix NO usa `requireStaff` en actions
precisamente para evitar el redirect y dar feedback estructurado al toast.

**Alternativas descartadas:**
1. **Usar `requireStaff({ roles })` directamente.** Descartada: tira
   `redirect()` en Server Actions, lo que navega la página. Para un
   cajero que toca "Aprobar pago" sin permiso, redirigir a `/pedidos`
   es UX confusa y silenciosa. Mejor retornar `{ok:false, error}`.
2. **Wrapper/HOF que envuelva cada action.** Descartada: introduce
   abstracción para 4 actions y NO expresa bien la matriz fina
   (driver-asignado, kitchen-restringido a `ready`).
3. **Validación sólo en RLS de Postgres.** Descartada: las actions usan
   `supabaseAdmin` (service role) que bypassea RLS. Migrar a `createClient()`
   server rompe el patrón ya establecido.
4. **Centralizar en `transitionOrder` y dropear `approvePayment`/`rejectPayment`.**
   Atractivo pero rompe el API público (los callers tendrían que cambiar).
   Las dejamos como aliases finos.

**Alcance del cambio:**
- Nuevo helper `assertStaffRole(roles: StaffRole[])` en
  [src/features/auth/guards.ts](../../src/features/auth/guards.ts) que
  retorna `{ok: true, staff} | {ok: false, error}`. ~12 líneas.
- En [src/features/orders/actions.ts](../../src/features/orders/actions.ts):
  - `loadOrderState` agrega `driver_id` al SELECT.
  - `transitionOrder`: matriz de roles por `toStatus` + constraint
    driver-asignado para `on_the_way`/`delivered` + chequeo de comprobante
    para `payment_approved` (movido desde `approvePayment`).
  - `approvePayment`: queda como alias fino (delegando todo a
    `transitionOrder`).
  - `rejectPayment`: igual, alias fino.
  - `assignDriver`: chequeo de rol cashier|admin.
- Total estimado: ~70 líneas tocadas. No migrations, no env vars,
  no cambios en UI/copy.

**Matriz de roles final (acordada con stakeholder):**

| Acción | Roles permitidos | Constraint adicional |
|---|---|---|
| `approvePayment` (alias) | cashier, admin | comprobante presente |
| `rejectPayment` (alias) | cashier, admin | — |
| `assignDriver` | cashier, admin | — |
| `transitionOrder → preparing` | cashier, kitchen, admin | — |
| `transitionOrder → ready` | kitchen, cashier, admin | — |
| `transitionOrder → on_the_way` | driver, cashier, admin | si driver: `driver_id === staff.id` |
| `transitionOrder → delivered` | driver, cashier, admin | si driver: `driver_id === staff.id` |
| `transitionOrder → cancelled` | cashier, admin | — |
| `transitionOrder → payment_approved` | cashier, admin | comprobante presente |
| `transitionOrder → payment_rejected` | cashier, admin | — |
| `transitionOrder → new`, `awaiting_payment` | (ninguno) | bloqueado: no son transiciones manuales |

**Nota sobre la superposición admin/cashier sobre `delivered`:** es fallback
intencional (driver pierde internet, cajero cierra al final del día).
La auditoría queda en `order_status_events.actor_id` que ya graba quién
hizo cada transición.

**Cómo se valida que funcionó:**
- Manual con curl/DevTools: login como driver, llamar `approvePayment`
  arbitrario → toast con "No tienes permisos para esta acción".
- Manual: driver A intenta marcar `delivered` un pedido asignado a
  driver B → toast con "Solo puedes actualizar pedidos asignados a ti".
- Manual: cajero aprueba pago normal → funciona.
- `bunx tsc --noEmit` y `bunx vitest run` deben pasar igual que antes
  del fix.

---

## L03 · `uploadPaymentProof` no valida `used_at` del token

- **Severidad:** medium
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/features/payments/upload-proof.ts:36-47](../../src/features/payments/upload-proof.ts#L36-L47)

### Síntoma observable
Después de que un cliente confirme su pedido, el `order_tokens.used_at` se marca. Pero `uploadPaymentProof` solo verifica `expires_at`, NO `used_at`. Esto permite que alguien con el `orderTokenId` viejo siga subiendo archivos al bucket (en `pending/<token-id>/...`) hasta que el token expire.

Los archivos subidos quedan en Storage **huérfanos** (no asociados a ninguna orden), llenando el bucket. No hay riesgo de fraude operativo (el cajero solo ve el comprobante referenciado por el orden), pero sí hay basura silenciosa.

### Causa raíz
El SELECT lee `id, expires_at` y omite `used_at`. La validación se diseñó para "antes de crear orden" y no se ajustó cuando agregamos camino B / 2-step verify.

### Reproducción
1. Crear pedido normalmente (token consumido)
2. Recuperar `orderTokenId` del pedido
3. POST manual a la Server Action con ese id + nuevo file
4. Verificar `select * from storage.objects where bucket_id = 'payment-proofs'` → archivo nuevo no asociado

### Fix propuesto
Agregar `used_at` al SELECT y rechazar si no es NULL:
```ts
.select("id, expires_at, used_at")
...
if (row.used_at) return { ok: false, error: "Enlace ya usado" };
```
**5 minutos.**

### Decisión de implementación · 2026-04-30

**Atacando:** después de que un cliente confirme un pedido, su
`order_tokens.used_at` se marca. Pero `uploadPaymentProof` solo valida
`expires_at`, NO `used_at`. Resultado: con el `orderTokenId` se pueden
seguir subiendo archivos al bucket `payment-proofs` hasta que el token
expire (2 horas), generando archivos huérfanos en Storage.

**Por qué AHORA:** fix de 5 minutos, alineado con §4 RULES (validación
en bordes). Aprovecho que ya estamos en el sprint de seguridad y
mantenemos el contexto.

**Compatibilidad con RULES.md:**
- §1 Layering: ✅ borde de Server Action.
- §2 RSC: n/a.
- §3 Memoización: n/a.
- §4 Validación en bordes: ✅ este FIX ES exactamente eso.
- §5 Naming: ✅ no agrega símbolos nuevos.
- §6 Pre-delivery: tsc limpio, sin `any`, mensaje claro al cliente.

**Contradice algún hallazgo o ENGRAM:** no.

**Alternativas descartadas:**
1. **Marcar `used_at` desde el upload (en lugar de createOrder).**
   Descartada: el upload puede ocurrir antes de confirmar el pedido
   (camino A). Marcar usado al subir rompe el flujo: si el cliente
   sube y luego cambia un dato del checkout, no podría re-confirmar.
   El diseño actual de "2-step token" (ENGRAM 2026-04-16) es correcto;
   solo falta cerrar el upload una vez consumido.
2. **Limpiar archivos huérfanos con un job mensual.** Descartada como
   sustituto: cura el síntoma (basura en Storage) pero deja la
   vulnerabilidad de upload arbitrario después del consumo. El job
   sigue siendo deuda válida (ver D08 en LAUNCH_CHECKLIST).

**Alcance del cambio:**
- 1 archivo, ~3 líneas.
- [src/features/payments/upload-proof.ts](../../src/features/payments/upload-proof.ts):
  agregar `used_at` al SELECT y rechazar si no es NULL.

**Cómo se valida que funcionó:**
- Manual: crear pedido normalmente (consume el token) → recuperar el
  `orderTokenId` → intentar `uploadPaymentProof` con ese id desde
  DevTools → esperado `{ok: false, error: "Enlace ya usado"}`.
- tsc + 37 tests verdes.

---

## L04 · `getOrderConfirmation` permite leer cualquier pedido sin autorización

- **Severidad:** medium
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/features/orders/queries.ts:28-42](../../src/features/orders/queries.ts#L28-L42)

### Síntoma observable
La página `/pedir/[token]/gracias?id=<orderId>` llama `getOrderConfirmation(orderId)` que usa `supabaseAdmin` (bypass de RLS). Esto significa que cualquiera con un `orderId` arbitrario (UUID guessable si se filtra) puede leer estado, total, método de pago y `created_at` del pedido.

No es high porque el `orderId` es UUID v4 (no enumerable) y los datos expuestos no son secretos críticos. Pero es información de pedido de OTRO cliente.

### Causa raíz
La lógica original asumía que solo el cliente que acabó de comprar accede a `/gracias?id=...`. No hay token de validación entre el query string y la fila.

### Reproducción
1. Cliente A confirma pedido y sale a `/gracias?id=<idA>`
2. Cliente B (otro teléfono, otro pedido) recibe el mismo URL si lo intercepta
3. B ve los datos del pedido de A

### Fix propuesto
Pasar también el token al query: `/gracias?id=<orderId>&t=<token>` y validar que el token corresponde al `customer_id` de la orden. Server-side. ~30 minutos. Alternativa más simple: firmar el `orderId` con HMAC y validar en `getOrderConfirmation`.

### Decisión de implementación · 2026-04-30

**Atacando:** la página `/pedir/[token]/gracias?id=<orderId>` invoca
`getOrderConfirmation(orderId)` con `supabaseAdmin` (bypass de RLS).
Cualquier persona con un orderId arbitrario (intercepta una URL, lo
adivina si en el futuro fuera enumerable) puede leer status, total,
método de pago y `created_at` de un pedido AJENO. Datos del pedido de
otro cliente.

**Por qué AHORA:** vulnerabilidad de leak de datos. Pequeña en superficie
(orderId es UUID v4, no enumerable) pero conceptualmente incorrecta y se
arregla con el token que ya está en la ruta. Mantener el tema de
seguridad mientras estamos en él.

**Compatibilidad con RULES.md:**
- §1 Layering: ✅ helper de auth en `features/order-tokens`, query queda
  en `features/orders`, page consume ambos. Capas respetadas.
- §2 RSC: ✅ la página `/gracias` es RSC, sigue siéndolo.
- §3 Memoización: n/a.
- §4 Validación en bordes: ✅ alineado — query exige el `customerId` que
  viene del token validado.
- §5 Naming: nuevo helper `resolveTokenCustomer` (verbo imperativo).
- §6 Pre-delivery: tsc limpio, sin `any`, sin cambios de UI/copy.

**Contradice algún hallazgo o ENGRAM:** no. ENGRAM 2026-04-16 documenta
"Token 2-step: verifyToken SOLO lee, createOrder marca used_at". El
helper nuevo NO modifica nada — solo lee. Coherente con esa decisión.

**Alternativas descartadas:**
1. **Pasar el token explícitamente como query (`?t=<token>`).**
   Descartada: el token YA está en la ruta dinámica `[token]`. Duplicar
   en query string es redundante y agrega superficie.
2. **Firmar el orderId con HMAC.** Descartada: introduce un secreto
   nuevo y un patrón distinto al de tokens. Mantener UN solo patrón
   (HMAC sobre `order_tokens`) es más mantenible.
3. **Migrar la query a `createClient()` server con RLS.** Descartada:
   el cliente NO está autenticado en `/gracias`. RLS no aplica para
   anon en `orders`; las policies actuales bloquearían la lectura.
4. **Reusar `verifyToken`.** Descartada: ese helper rechaza tokens
   `used`, pero el flujo normal es entrar a `/gracias` JUSTO después
   de crear el pedido (token ya `used`). Falsearía la mayoría de
   accesos legítimos.
5. **Reusar `getCustomerIdFromExpiredToken`.** Descartada: ese helper
   rechaza con `still_valid` cuando el token NO está expirado ni usado
   (raro pero posible si el cliente comparte la URL antes de confirmar).
   Necesitamos un resolutor neutral.

**Alcance del cambio:**
- Nuevo helper `resolveTokenCustomer(token)` en
  [src/features/order-tokens/verify.ts](../../src/features/order-tokens/verify.ts).
  Acepta tokens válidos / usados / expirados con firma HMAC correcta.
  Solo retorna `customerId`. ~30 líneas (mucha es boilerplate de HMAC
  duplicado de los otros helpers — ver D-nuevo abajo).
- Tipo `ResolveTokenCustomerResult` en `order-tokens/schemas.ts`.
- [src/features/orders/queries.ts](../../src/features/orders/queries.ts):
  `getOrderConfirmation(orderId, expectedCustomerId)` agrega segundo
  parámetro y filtra `.eq("customer_id", expectedCustomerId)`. Si no
  matchea, retorna null.
- [app/(shop)/pedir/[token]/gracias/page.tsx](../../app/(shop)/pedir/[token]/gracias/page.tsx):
  resolver token → `customerId`; pasar a `getOrderConfirmation`. Si
  cualquiera falla, mostrar el branch de "No encontramos tu pedido".
- Total: ~50 líneas, 4 archivos. No migrations.

**Nueva deuda generada:** abro **D12** en deuda-tecnica.md — los 3
helpers de tokens (`verifyToken`, `getCustomerIdFromExpiredToken`,
`resolveTokenCustomer`) duplican lógica HMAC y lookup. Refactorizar a
una función base `resolveTokenWithStatus` con wrappers delgados. ~1h.
No urgente (el fix de L04 funciona sin esto), pero registrado.

**Cómo se valida que funcionó:**
- Manual: cliente A crea pedido, copia URL `/gracias?id=<idA>` → cliente
  B (otro teléfono = otro token) abre URL pegando su propio token y
  con el `id` de A → esperado: branch "No encontramos tu pedido".
- Manual: cliente A normal → ve su `/gracias` correctamente.
- tsc + 37 tests verdes.

---

## L05 · Realtime del panel no maneja expiración de sesión

- **Severidad:** medium
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/components/dashboard/orders-board.tsx:73-89](../../src/components/dashboard/orders-board.tsx#L73), [src/components/dashboard/driver-orders-list.tsx](../../src/components/dashboard/driver-orders-list.tsx)

### Síntoma observable
El panel del cajero se monta una sola vez al cargar y suscribe a `postgres_changes` con el `access_token` de ese momento. Si la sesión expira durante la jornada (8+ horas con la pestaña abierta), Supabase Realtime sigue conectado al canal, pero la auth queda stale: las policies RLS ya no autorizan los eventos y **dejan de llegar silenciosamente**. No hay error visible — el cajero piensa que no hay pedidos nuevos cuando sí los hay.

### Causa raíz
El `useEffect` solo hace `setAuth` en el mount inicial. No hay listener de `onAuthStateChange` ni reintento. ENGRAM 2026-04-20 lo documentó como "no usar onAuthStateChange por simplicidad", asumiendo que la sesión no expiraría dentro de un turno. Pero turnos de pizzería son largos (5-10h), y el access token de Supabase suele durar 1h.

### Reproducción
1. Login en panel
2. Esperar a que el access_token expire (1h por default) o forzar un revoke desde Supabase Studio
3. Crear un pedido nuevo desde otra ventana (cliente)
4. Verificar que el panel NO refresca

### Fix propuesto
Agregar listener `onAuthStateChange` que llame `setAuth` con el nuevo `access_token` cuando Supabase haga refresh. Si la sesión expira completamente, redirigir a `/login`. ~1h.

### Decisión de implementación · 2026-04-30

**Atacando dos problemas del mismo origen:**
1. [orders-board.tsx](../../src/components/dashboard/orders-board.tsx) hace
   `setAuth(access_token)` solo en el mount. Si Supabase refresca el token
   automáticamente durante un turno largo (5-10h), Realtime queda con
   el token viejo; las RLS empiezan a filtrar los eventos silenciosamente.
2. [driver-orders-list.tsx](../../src/components/dashboard/driver-orders-list.tsx)
   ni siquiera hace `setAuth` inicial. Funciona "por suerte" porque las
   policies de Realtime se evaluan con anon en algunos casos, pero
   pueden fallar a la primera RLS estricta.

**Por qué AHORA:** estamos por arrancar piloto con cliente real (turnos
largos). ENGRAM 2026-04-20 lo dejó como deuda preventiva con la nota
"se prueba menos, conviene aplicar el mismo fix la próxima vez que se
toque". Esta es esa próxima vez.

**Compatibilidad con RULES.md:**
- §1 Layering: ✅ helper en `src/lib/supabase/`, callers en
  `src/components/dashboard/`. Capas respetadas.
- §2 RSC: n/a (los archivos son `"use client"` por necesidad — Realtime
  sólo funciona en cliente).
- §3 Memoización: n/a — no se introduce `useMemo`/`useCallback`.
- §4 Validación en bordes: n/a (no es input validation).
- §5 Naming: nuevo helper `attachRealtimeAuthSync` — verbo imperativo,
  describe efecto.
- §6 Pre-delivery: tsc limpio, sin `any`, mobile-first preservado.

**Tensión con ENGRAM 2026-04-20 — explícita:** esa entrada dijo "No usar
`onAuthStateChange` para resuscribir: manejar refresh-token es
complicación innecesaria". El razonamiento era que la sesión ya existe
al montar. Pero el problema de hoy NO es "re-suscribir el canal", es
**propagar el nuevo `access_token` a Realtime cuando Supabase lo
refresca**. La suscripción del canal se mantiene viva; solo cambia el
token que la autoriza. ENGRAM 2026-04-20 se interpretó demasiado
literal — se prohibió `onAuthStateChange` por temor a complicaciones
de re-suscribir, no por una razón fundamental. Este fix usa
`onAuthStateChange` SOLO para llamar `realtime.setAuth(newToken)`, que
es justamente lo que evita las complicaciones que ENGRAM temía.

**Alternativas descartadas:**
1. **Refrescar manualmente con `setInterval` cada 50 min.** Descartada:
   stateful, costoso, redundante con el refresh nativo de Supabase. Más
   código que `onAuthStateChange`.
2. **Solo arreglar `orders-board.tsx`, dejar `driver-orders-list.tsx`
   como está.** Descartada: misma vulnerabilidad, solo difiere en visibilidad.
   El piloto va a tener drivers reales, no es responsable dejar uno solo.
3. **Resuscribir el canal completo en cada `TOKEN_REFRESHED`.** Descartada:
   más caro, más complejo, y exactamente lo que ENGRAM 2026-04-20 quería
   evitar.
4. **Migrar a Supabase RLS-relaxed para Realtime y simplificar.**
   Descartada: rebajaría seguridad. RLS estricto es la postura correcta
   para v1.

**Alcance del cambio:**
- Nuevo helper [src/lib/supabase/realtime-auth.ts](../../src/lib/supabase/realtime-auth.ts):
  función imperativa `attachRealtimeAuthSync(supabase)` que (a) hace
  `setAuth` inicial con la sesión actual, (b) suscribe a
  `onAuthStateChange` para llamar `setAuth(newToken)` en cada refresh,
  y (c) retorna un cleanup `() => void` para el unmount. ~30 líneas.
- [src/components/dashboard/orders-board.tsx](../../src/components/dashboard/orders-board.tsx):
  reemplazar el setAuth manual por una llamada al helper. Cleanup
  agregado al return del useEffect.
- [src/components/dashboard/driver-orders-list.tsx](../../src/components/dashboard/driver-orders-list.tsx):
  agregar la llamada al helper (no la tiene hoy).
- Total: ~30 líneas nuevas + ~10 modificadas, 3 archivos. No migrations,
  no env vars, no cambios de UI.

**Cómo se valida que funcionó:**
- Manual con sesión corta forzada: en Supabase Studio → Auth → Settings
  bajar JWT expiry a 60 segundos. Login en panel → esperar 90s → crear
  pedido nuevo desde otra pestaña → esperado: panel refresca el card
  igual que antes. Sin el fix: panel queda dormido.
- `bunx tsc --noEmit` y `bunx vitest run` siguen verdes.
- Smoke: el panel del cajero arranca igual que antes (no hay regresión
  en el caso happy de sesión recién montada).

---

## L06 · Recordatorios y alertas no reintenta si el send falla

- **Severidad:** low
- **Estado:** **deferred to backlog** · 2026-04-30 — ver L06-A en deuda-tecnica.md
- **(decisión consciente, registrada para historia)**
- **Ubicación:** [src/features/payments/proof-reminders/run.ts](../../src/features/payments/proof-reminders/run.ts), [src/features/delay-alerts/run.ts](../../src/features/delay-alerts/run.ts)

### Síntoma observable
Si Twilio o Meta están temporalmente caídos cuando el cron corre, el flag (`proof_reminder_sent_at` / `delay_notified_at`) se marca PRIMERO y luego se intenta el send. Si el send falla, el flag queda y el cliente NO recibe NUNCA el recordatorio (ni en el próximo cron ni en los siguientes — la guardia `is null` ya no aplica).

### Causa raíz
Decisión consciente registrada en ENGRAM (F8): "si falla el send NO revertimos el flag para evitar ráfagas si el sender está intermitente". Trade-off entre correctness y no spammear.

### Fix propuesto (a futuro, no urgente)
Tabla separada `notification_attempts` con estado `pending|sent|failed_retry|dead` para reintentos exponenciales con cap. 1-2 días. Solo necesario si el piloto muestra >5% de pérdidas.

### Decisión de implementación · 2026-04-30

**No se implementa hoy.** Diferido a deuda-tecnica.md como **L06-A**.

**Razón:** la decisión "marcar el flag antes del send para evitar
ráfagas si el sender está intermitente" es una elección de tradeoff,
no un bug. Aceptamos pérdida ocasional de notificación sobre el riesgo
de spam masivo si el cron golpea durante un brownout de Twilio. El
costo del fix correcto (tabla `notification_attempts`, retries con
backoff) es mayor a 1 día y solo se justifica con datos de piloto que
muestren pérdidas reales >5%.

**Trigger para reabrir:** monitorear en piloto (1) tasa de
recordatorios `proof_reminder_sent_at` cuyo orden permanece >30 min
en `awaiting_payment` (proxy de "el cliente no recibió el aviso") y
(2) reportes manuales del cajero sobre pedidos sin notificación.
Si supera 5% de pedidos, escalar a in progress.

**Compatibilidad RULES:** n/a (no hay cambio de código).

---

## L07 · Snapshot del nombre del cliente en orders

- **Severidad:** medium
- **Estado:** **fixed** — ver commit pendiente con migration `0007_orders_customer_name_snapshot.sql`
- **Ubicación:** [src/features/orders/actions.ts:117](../../src/features/orders/actions.ts#L117), [supabase/migrations/0007_orders_customer_name_snapshot.sql](../../supabase/migrations/0007_orders_customer_name_snapshot.sql)

### Síntoma observable (ya resuelto)
El `UPDATE customers SET name = $1` en `createOrder` sobreescribía el nombre vivo del cliente. Las queries del panel hacían JOIN con customers, así que **los pedidos viejos mostraban el nombre del último pedido**, distorsionando el histórico cuando un cliente cambiaba sus datos en un segundo pedido.

### Fix aplicado
- Nueva columna `orders.customer_name` (snapshot del momento)
- `createOrder` guarda el nombre en el INSERT del pedido
- Queries leen del snapshot con fallback al JOIN del cliente vivo
- Migration aplicable + backfill one-time desde `customers.name`

---

## L08 · Webhook de Twilio responde greet a cualquier mensaje (incluyendo imágenes)

- **Severidad:** medium
- **Estado:** **moved to LAUNCH_CHECKLIST B (feature work)** · 2026-04-30
- **Ubicación:** [app/api/webhooks/twilio/route.ts:79-83](../../app/api/webhooks/twilio/route.ts#L79)

### Síntoma observable
Si un cliente manda una foto del comprobante por WhatsApp al sandbox de Twilio (camino B del PRD §F9), Twilio recibe la imagen pero el handler **siempre llama `greetCustomerByPhoneTwilio`** sin importar el tipo de mensaje. Resultado: el cliente recibe un link al menú nuevo en lugar de tener su comprobante asociado al pedido pendiente. La imagen se pierde y el pedido queda atascado en `awaiting_payment + needs_proof`.

Mismo síntoma con intent "¿ya viene?" — debería responder con estado del pedido pero responde con greet.

### Causa raíz
El handler de Twilio fue escrito como "MVP de prueba" (comentario explícito en el código). La lógica equivalente para Meta (`handle-incoming.ts`) sí distingue text/image/intent, pero esa ruta está pausada por el trámite Meta.

### Fix propuesto
Replicar la lógica de `handle-incoming.ts` en el handler de Twilio: detectar `MediaUrl0` en el payload de Twilio para imagen, descargar con auth Twilio, asociar al pedido pendiente del teléfono, etc. ~1 día. Mientras tanto, documentado en checkout como camino B no soportado.

### Decisión de implementación · 2026-04-30

**No es un fix; es feature work.** Movido a
[LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md) Bloque B como **B9**.

**Razón:** el handler de Twilio fue construido como "MVP de prueba"
(comentario explícito en el código). Implementar camino B en Twilio
es construir una capacidad que NO existe, no arreglar una que se rompió.
La distinción importa para el contrato del audit: la auditoría reporta
discrepancias entre comportamiento esperado y real; este caso es
"funcionalidad incompleta", no "comportamiento incorrecto".

**Mitigación que YA está activa:**
- El copy del checkout fue ajustado en turno previo para sesgar contra
  camino B (*"Si tienes problemas para subir el archivo aquí, comunícate
  con el restaurante"*). El cliente no espera que Twilio acepte fotos.
- El recordatorio del cron a 5 min sigue funcionando vía Twilio outbound.

**Trigger para reabrir como L0X:** si en piloto un cliente legítimo
manda foto a Twilio y se pierde (reportado por el cajero), el síntoma
ya es bug, no missing feature.

---

## L09 · `addresses` se crea NUEVA en cada pedido aunque sea idéntica

- **Severidad:** low
- **Estado:** **deferred to debt** · 2026-04-30 — ver D06 en deuda-tecnica.md
- **Ubicación:** [src/features/orders/actions.ts:123-139](../../src/features/orders/actions.ts#L123)

### Síntoma observable
Cliente Juan que pide 30 veces a la misma casa genera 30 filas en `addresses` con datos idénticos. La tabla acumula basura silenciosa.

### Causa raíz
Decisión consciente del PRD §9.3: snapshot por pedido. Pero no se hace deduplicación cuando los campos son idénticos.

### Fix propuesto
Antes del INSERT, buscar `addresses` con los mismos campos para `customer_id` y reusar `id` si existe. Hash de los campos no-nulos como criterio. ~30 minutos. Solo vale la pena cuando se observe acumulación real (>50 addresses por cliente).

### Decisión de implementación · 2026-04-30

**No se implementa hoy.** Diferido a deuda — ya estaba en D06 desde el
barrido inicial; aquí solo se ratifica.

**Razón:** dedupe de addresses tiene complejidad (hash determinístico
sobre campos opcionales, manejo de variaciones tipográficas tipo
*"Cll 64 b"* vs *"Calle 64b"*) que NO se justifica para una pizzería
con cliente promedio de 5-15 pedidos/mes. La acumulación de filas
duplicadas es invisible al usuario y barata en bytes. Resolver
prematuramente es over-engineering.

**Trigger para activar D06:** un cliente con `>50` filas en addresses
(query simple), o quejas del cajero por ver direcciones repetidas
en algún UI futuro de "elegir dirección guardada" (B5 del LAUNCH).
Cualquiera que ocurra primero.

---

## L10 · `pickInitialStatus` puede dejar pedidos en limbo si el cliente no entiende camino B

- **Severidad:** low
- **Estado:** **fixed** · 2026-04-30 — proof obligatorio en el botón cuando aplica
- **Ubicación:** [src/features/orders/actions.ts:71-85](../../src/features/orders/actions.ts#L71-L85), [src/components/shop/checkout-form.tsx](../../src/components/shop/checkout-form.tsx)

### Síntoma observable
Un cliente que confirma un pedido con método transferencia/Nequi/Llave SIN subir comprobante queda con `awaiting_payment + needs_proof=true`. Si nunca manda el comprobante por WhatsApp (porque el camino B en Twilio sandbox no lo procesa, ver L08), el pedido queda en limbo. El recordatorio se manda a los 5 min, pero si el cliente no responde, el pedido se queda ahí.

### Causa raíz
El flujo asume que el cliente entiende qué hacer. Hoy el copy del checkout dice "Si tienes problemas para subir el archivo aquí, comunícate con el restaurante" — mejor que antes pero no obliga a subir. Si combinamos esto con L08 (Twilio no procesa imagen), el camino B simplemente no funciona.

### Fix propuesto
A corto plazo: bloquear el botón "Confirmar pedido" si `paymentMethod !== cash` y `proofFile === null`. Forzar camino A. **5 minutos.** Mantener camino B en código para cuando Meta vuelva (L08 resuelto).

### Decisión de implementación · 2026-04-30

**Atacando:** mientras Twilio no soporta camino B (L08 → B9 del LAUNCH),
un cliente que confirma transferencia/Nequi/Llave SIN subir comprobante
queda con un pedido que NUNCA recibirá su comprobante (porque la única
vía válida hoy es upload web). El recordatorio del cron se dispara y
se pierde en el aire.

**Por qué AHORA:** 5 min de trabajo, mitigación adicional al copy ya
ajustado. El copy SOLO informa; deshabilitar el botón hasta que haya
proof IMPIDE que el cliente confirme sin saber.

**Compatibilidad RULES:**
- §1, §2, §3, §4: ✅ todos respetados (es un cambio de UI con guard
  derivado de estado del form).
- §5: n/a (no símbolos nuevos).
- §6: tsc, sin `any`, mobile-first preservado.

**Contradice algún hallazgo:** ENGRAM 2026-04-16 ("Comprobante de pago
híbrido (upload + WhatsApp)") describió camino B como característica.
Hoy el camino B FUNCIONA (en código), solo que el sender Meta está
pausado. Cuando Meta vuelva, se REVIERTE este guard del botón. Lo
documenta el comentario inline.

**Alternativas descartadas:**
1. **Solo dejar el copy.** Descartada: el copy es informativo; un cliente
   distraído puede ignorarlo. Quitar la opción es más fuerte.
2. **Mover camino B al backend (auto-detectar imagen y crear pedido sin proof).**
   Descartada: feature work grande, va en B9.
3. **Validar server-side y rechazar.** Descartada (complemento, no
   sustituto): ya validamos en `pickInitialStatus`. El bloqueo del
   botón es UI defensiva. Si alguien fuerza el POST por DevTools,
   sigue siendo válido crear el pedido en `awaiting_payment +
   needs_proof=true`. La intención es ayudar al cliente normal.

**Alcance:** ~5 líneas en [checkout-form.tsx](../../src/components/shop/checkout-form.tsx)
— extender la condición `disabled` del botón "Confirmar pedido" para
incluir `paymentMethod !== "cash" && !proofFile`. Comentario que indique
revertir cuando camino B vuelva.

**Cómo se valida:**
- Manual: escoger Bancolombia, no subir comprobante → botón disabled.
  Subir comprobante → botón habilitado.
- Manual: escoger efectivo → botón siempre habilitado (sin comprobante,
  sin guard).
- tsc + 37 tests verdes.

---

## Histórico de findings cerrados

(Cada fix marcado con `**fixed (commit-hash)**` queda aquí indexado para referencia rápida.)

- L07 (snapshot del nombre) — resuelto en este turno con migration 0007.
