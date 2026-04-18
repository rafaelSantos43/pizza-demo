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

### 2026-04-16 — Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`)
**Qué:** [src/lib/demo.ts](../src/lib/demo.ts) define `isDemoMode()` + placeholders de env. Cuando `NEXT_PUBLIC_DEMO_MODE=true`:
- `getClientEnv()` y `getServerEnv()` retornan placeholders válidos (no tiran).
- `middleware.ts` hace passthrough sin tocar Supabase real.
- `getCurrentStaff()` retorna `DEMO_STAFF` (admin).
- `listActiveOrders()`, `getOrderDetail()`, `getOrderConfirmation()` retornan fixtures de [src/features/orders/demo-fixtures.ts](../src/features/orders/demo-fixtures.ts) (5 pedidos cubriendo `awaiting_payment` con/sin proof, `preparing`, `ready`, `on_the_way + delayed`).
- `transitionOrder`, `approvePayment`, `rejectPayment`, `assignDriver` son no-ops `{ ok: true }`.
- `getSignedProofUrl()` retorna null.
**Por qué:** permite navegar el panel y validar UI/UX sin ceremonia de setup de Supabase. Útil para revisiones rápidas, screenshots, o desarrollo de componentes nuevos sin DB. Activación opt-in (no auto-detect) para evitar que se cuele a producción.
**Cómo aplica:**
- Activar: `echo "NEXT_PUBLIC_DEMO_MODE=true" > .env.local` + restart dev server (Next no recarga `.env.local` con HMR).
- Desactivar: borrar la línea (o ponerla en `false`) y llenar el resto del `.env.local` con creds reales.
- **Solo cubre el panel.** El catálogo del cliente (`/pedir/[token]`) NO está en demo — las queries de catalog y order-tokens siguen yendo a Supabase real. Si se necesita después, extender el patrón a esas features.
- Hidratación: los formatters tipo `Intl.DateTimeFormat` deben pinear `timeZone: "America/Bogota"` para que server y client renderen igual (ver `OrderCard`); cuando agreguemos formatters relativos ("hace 5 min"), evaluar moverlos a client-only para evitar mismatches.

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
**Qué:** el cliente nunca se autentica. Se identifica por `phone` (E.164) como clave natural. El acceso al catálogo es por token firmado (HMAC, 30 min, one-time).
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
