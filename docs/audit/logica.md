# Auditoría — Lógica

Bugs silenciosos del modelo de datos, condiciones de carrera, autorización, integridad. Cosas que funcionan en el caso feliz pero rompen en edge cases reales.

> Prefijo de IDs: **L**

---

## L01 · `createOrder` no es atómico → pedidos zombi e direcciones huérfanas

- **Severidad:** high
- **Estado:** open
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

---

## L02 · Falta validación de rol en acciones críticas (privilege escalation)

- **Severidad:** high
- **Estado:** open
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

---

## L03 · `uploadPaymentProof` no valida `used_at` del token

- **Severidad:** medium
- **Estado:** open
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

---

## L04 · `getOrderConfirmation` permite leer cualquier pedido sin autorización

- **Severidad:** medium
- **Estado:** open
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

---

## L05 · Realtime del panel no maneja expiración de sesión

- **Severidad:** medium
- **Estado:** open
- **Ubicación:** [src/components/dashboard/orders-board.tsx:73-89](../../src/components/dashboard/orders-board.tsx#L73)

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

---

## L06 · Recordatorios y alertas no reintenta si el send falla

- **Severidad:** low
- **Estado:** open (decisión consciente, registrar para historia)
- **Ubicación:** [src/features/payments/proof-reminders/run.ts](../../src/features/payments/proof-reminders/run.ts), [src/features/delay-alerts/run.ts](../../src/features/delay-alerts/run.ts)

### Síntoma observable
Si Twilio o Meta están temporalmente caídos cuando el cron corre, el flag (`proof_reminder_sent_at` / `delay_notified_at`) se marca PRIMERO y luego se intenta el send. Si el send falla, el flag queda y el cliente NO recibe NUNCA el recordatorio (ni en el próximo cron ni en los siguientes — la guardia `is null` ya no aplica).

### Causa raíz
Decisión consciente registrada en ENGRAM (F8): "si falla el send NO revertimos el flag para evitar ráfagas si el sender está intermitente". Trade-off entre correctness y no spammear.

### Fix propuesto (a futuro, no urgente)
Tabla separada `notification_attempts` con estado `pending|sent|failed_retry|dead` para reintentos exponenciales con cap. 1-2 días. Solo necesario si el piloto muestra >5% de pérdidas.

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
- **Estado:** open
- **Ubicación:** [app/api/webhooks/twilio/route.ts:79-83](../../app/api/webhooks/twilio/route.ts#L79)

### Síntoma observable
Si un cliente manda una foto del comprobante por WhatsApp al sandbox de Twilio (camino B del PRD §F9), Twilio recibe la imagen pero el handler **siempre llama `greetCustomerByPhoneTwilio`** sin importar el tipo de mensaje. Resultado: el cliente recibe un link al menú nuevo en lugar de tener su comprobante asociado al pedido pendiente. La imagen se pierde y el pedido queda atascado en `awaiting_payment + needs_proof`.

Mismo síntoma con intent "¿ya viene?" — debería responder con estado del pedido pero responde con greet.

### Causa raíz
El handler de Twilio fue escrito como "MVP de prueba" (comentario explícito en el código). La lógica equivalente para Meta (`handle-incoming.ts`) sí distingue text/image/intent, pero esa ruta está pausada por el trámite Meta.

### Fix propuesto
Replicar la lógica de `handle-incoming.ts` en el handler de Twilio: detectar `MediaUrl0` en el payload de Twilio para imagen, descargar con auth Twilio, asociar al pedido pendiente del teléfono, etc. ~1 día. Mientras tanto, documentado en checkout como camino B no soportado.

---

## L09 · `addresses` se crea NUEVA en cada pedido aunque sea idéntica

- **Severidad:** low
- **Estado:** open
- **Ubicación:** [src/features/orders/actions.ts:123-139](../../src/features/orders/actions.ts#L123)

### Síntoma observable
Cliente Juan que pide 30 veces a la misma casa genera 30 filas en `addresses` con datos idénticos. La tabla acumula basura silenciosa.

### Causa raíz
Decisión consciente del PRD §9.3: snapshot por pedido. Pero no se hace deduplicación cuando los campos son idénticos.

### Fix propuesto
Antes del INSERT, buscar `addresses` con los mismos campos para `customer_id` y reusar `id` si existe. Hash de los campos no-nulos como criterio. ~30 minutos. Solo vale la pena cuando se observe acumulación real (>50 addresses por cliente).

---

## L10 · `pickInitialStatus` puede dejar pedidos en limbo si el cliente no entiende camino B

- **Severidad:** low
- **Estado:** open (mitigado por copy del checkout)
- **Ubicación:** [src/features/orders/actions.ts:71-85](../../src/features/orders/actions.ts#L71-L85)

### Síntoma observable
Un cliente que confirma un pedido con método transferencia/Nequi/Llave SIN subir comprobante queda con `awaiting_payment + needs_proof=true`. Si nunca manda el comprobante por WhatsApp (porque el camino B en Twilio sandbox no lo procesa, ver L08), el pedido queda en limbo. El recordatorio se manda a los 5 min, pero si el cliente no responde, el pedido se queda ahí.

### Causa raíz
El flujo asume que el cliente entiende qué hacer. Hoy el copy del checkout dice "Si tienes problemas para subir el archivo aquí, comunícate con el restaurante" — mejor que antes pero no obliga a subir. Si combinamos esto con L08 (Twilio no procesa imagen), el camino B simplemente no funciona.

### Fix propuesto
A corto plazo: bloquear el botón "Confirmar pedido" si `paymentMethod !== cash` y `proofFile === null`. Forzar camino A. **5 minutos.** Mantener camino B en código para cuando Meta vuelva (L08 resuelto).

---

## Histórico de findings cerrados

(Cada fix marcado con `**fixed (commit-hash)**` queda aquí indexado para referencia rápida.)

- L07 (snapshot del nombre) — resuelto en este turno con migration 0007.
