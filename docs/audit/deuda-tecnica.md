# Auditoría — Deuda Técnica

Patrones inconsistentes, "TODOs", "por ahora", refactors latentes que hoy no duelen pero después sí.

> Prefijo de IDs: **D**

---

## D01 · Inconsistencia entre `greet` y `createOrder` con `customer.name`

- **Severidad:** low
- **Estado:** mitigado por L07 fix
- **Ubicación:** [src/features/whatsapp/greet.ts:51-58](../../src/features/whatsapp/greet.ts#L51), [src/features/whatsapp-twilio/greet.ts:36-43](../../src/features/whatsapp-twilio/greet.ts#L36), [src/features/orders/actions.ts:117-121](../../src/features/orders/actions.ts#L117)

### Análisis
Los dos `greet` (Meta y Twilio) NO sobreescriben `customers.name` si ya existe (lógica explícita: *"Solo seteamos name si no había uno"*). Pero `createOrder` SÍ lo sobreescribe siempre con el nombre del checkout (*"siempre gana"*). Inconsistencia interna en cómo el código trata el nombre vivo del cliente.

Después de L07 (snapshot del nombre en orders), el daño operativo está mitigado: el histórico es fiel. Pero la inconsistencia en `customers.name` sigue.

### Fix propuesto
Decidir una política única:
- **Opción A:** El nombre vivo siempre refleja el último checkout (status quo de createOrder, cambiar greet)
- **Opción B:** El nombre vivo solo se actualiza si está vacío (cambiar createOrder, alinear con greet)
- **Opción C:** Una bandera explícita en checkout *"Actualizar mis datos para futuros pedidos"*

A discutir con el cliente real. ~30 minutos cualquiera de las 3.

---

## D02 · `templateForStatus("payment_rejected")` retorna null en Meta sender

- **Severidad:** low
- **Estado:** open
- **Ubicación:** [src/features/whatsapp/templates.ts:58-63](../../src/features/whatsapp/templates.ts#L58)

### Análisis
El adapter Twilio (`send-order-update.ts`) cubre el caso `payment_rejected` con un mensaje plano. Pero cuando Meta vuelva, hay que aprobar el template `pf_payment_rejected` en Meta Business Manager y mapearlo en `templateForStatus`. Hoy el código Meta ignora silenciosamente este estado.

### Fix propuesto
Cuando se reactive Meta:
1. Aprobar `pf_payment_rejected` en Meta Business Manager con el mismo copy del adapter Twilio
2. Agregar `payment_rejected: { name: "pf_payment_rejected", language: "es_CO", bodyParams: 0 }` a `TEMPLATES`
3. Mapearlo en `templateForStatus`

15 minutos cuando llegue el momento.

---

## D03 · Sin tests E2E (Playwright)

- **Severidad:** medium
- **Estado:** **deferred to backlog** · 2026-04-30
- **Ubicación:** [package.json](../../package.json)

### Análisis
**Corrección al hallazgo original:** Playwright NO está instalado en
`package.json` (verificado 2026-04-30). El PRD §7.2 lo lista como
dependencia planeada pero nunca se ejecutó `bun add -d @playwright/test`.

### Specs mínimos sugeridos
- `e2e/order-flow.spec.ts`: cliente arma pedido en `/pedir/[token]`, confirma efectivo, verifica `/gracias`
- `e2e/cashier-panel.spec.ts`: login staff, ve un pedido nuevo, lo aprueba/transiciona, verifica que cambia estado
- `e2e/expired-link.spec.ts`: abre token expirado, click "Pedir nuevo link", verifica respuesta

### Decisión de implementación · 2026-04-30

**Diferido. NO se implementa ahora.**

**Por qué:** la estimación original de "~1 día" estaba subestimada.
Realista: instalar Playwright + browsers (~10 min), `playwright.config.ts`
(~30 min), decisión de DB de tests (Supabase shadow project, mock o
fixture? — ~1h de evaluación), specs (~1-2h cada uno con flakiness
debugging). Total: 4-6 horas pre-piloto. Para un MVP de 1 dev con
piloto inminente, el ROI es bajo: en piloto el código se toca poco;
los tests E2E flaky pueden generar más fricción que valor.

**Compensación:** D04 (tests unitarios para Server Actions) se eleva a
in-progress en el mismo turno con alcance acotado. Los unitarios son
más baratos, más estables y cubren las decisiones críticas (matriz de
roles L02, comprobante check, transitions inválidas) sin el costo de
infraestructura E2E.

**Trigger para reabrir D03:**
- Se contrata segundo dev (los E2E pagan en el handoff)
- Un cambio post-piloto rompe silenciosamente y solo se descubre por
  reporte del cliente
- Cualquiera de los dos lo eleva a `in progress`.

---

## D03-skip nota: Playwright dependencia ausente

Si en el futuro alguien retoma D03, recordar: `bun add -d @playwright/test`
y `bunx playwright install` antes de escribir el primer spec.

---

## D04 · Sin tests para Server Actions

- **Severidad:** medium
- **Estado:** **fixed** · 2026-04-30 — `transitionOrder` (12 tests) + `createOrder` (6 tests) cubiertos. `assignDriver` y catalog actions diferidos a D04-B
- **Ubicación:** [src/features/orders/actions.ts](../../src/features/orders/actions.ts), [src/features/catalog/actions.ts](../../src/features/catalog/actions.ts)

### Análisis
`createOrder` tiene >200 líneas de lógica crítica (validación de productos, cálculo de precios, cascada de INSERTs). El único test unitario relacionado es `compute-unit-price.test.ts` (función pura). El path completo de `createOrder` no se testea — depende del E2E del D03 o de testear contra Supabase real.

### Fix propuesto
Mock `supabaseAdmin` con vitest y tests para los caminos:
- Pedido cash con producto válido → `status='preparing'`
- Pedido transferencia con proof → `status='awaiting_payment', needs_proof=false`
- Pedido transferencia sin proof → `status='awaiting_payment', needs_proof=true`
- Pedido con sabor inválido para tamaño → error
- Pedido con producto inactivo → error

~1 día.

### Decisión de implementación · 2026-04-30

**Atacando alcance reducido:** del bosquejo original (~1 día completo),
priorizamos los tests de **`transitionOrder`** porque acaba de cerrarse
en L02 una vulnerabilidad de privilege escalation alta. Sin tests,
cualquier refactor futuro a la matriz de roles puede regresar el bug
silenciosamente. `createOrder` queda como **D04-A** (más complejo —
cascada de INSERTs, mocks múltiples — y menos crítico hoy).

**Por qué AHORA:** L02 vive en código fresco, el contexto está vivo,
el riesgo de regresión es real. Costo realista: ~1.5h con setup de
mocks. Tests pequeños, foco en la matriz.

**Compatibilidad RULES:**
- §1, §2, §3, §4: ✅ test code, no toca dominio.
- §5: ✅ naming claro de tests.
- §6: la propia regla §6 implica tests; este fix la honra parcialmente.

**Contradice algún hallazgo:** no.

**Alternativas descartadas:**
1. **Tests integración contra Supabase de prueba.** Descartada: requiere
   shadow project + seed scripts + cleanup. >2h solo de setup.
2. **Refactor para inyectar el cliente Supabase.** Descartada:
   abstracción especulativa. Mock con `vi.mock` resuelve sin tocar
   producción.
3. **Cubrir todo (transitionOrder + createOrder + assignDriver).**
   Descartada por alcance: ~1h cada uno con sus mocks. Mejor cubrir
   bien uno crítico que mal tres.

**Alcance:**
- Nuevo archivo `src/features/orders/__tests__/transition-order.test.ts`.
- Tests para la matriz L02 (10-12 casos: cada combinación rol×status
  más casos de driver-asignado y comprobante).
- Mocks via `vi.mock` para `@/lib/supabase/admin`,
  `@/features/auth/queries` (getCurrentStaff), y
  `@/features/notifications/send-order-update` (no disparar Twilio).
- ~150 líneas de test.

**Cómo se valida:**
- `bunx vitest run` debe mostrar 37 + N tests pasando (donde N es el
  número de casos de la matriz, esperado ~12).
- Cobertura conceptual: cada celda del cuadro de la matriz L02 tiene
  al menos un caso correspondiente en el test file.

**Deuda residual D04-A:** tests para `createOrder`. Trigger: próxima
vez que se modifique la lógica de `createOrder` (precio, validación
de sabores, status inicial). Sin tests previos, refactor es a ciegas.

**Caveat técnico para D04-A:** `vi.clearAllMocks()` NO limpia el queue
de `mockResolvedValueOnce`. Si un test hace `mockResolvedValueOnce`
pero el código early-retorna sin consumirlo, el valor queda en el
queue y se filtra al siguiente test. **Usar `vi.resetAllMocks()`** en
beforeEach (que sí limpia queue + implementations) y re-establecer
implementations por test.

### Decisión de implementación D04-A · 2026-04-30

**Atacando:** `createOrder` no tiene cobertura de tests. Recientemente
movimos `markTokenUsed` al inicio (L01) y agregamos
`payment_proof_source` (mejora 2). Si alguien refactora la cascada,
cualquier regresión silenciosa pasa hasta producción.

**Por qué AHORA:** L01 y mejora 2 viven en código fresco, justo antes
del piloto. La red de seguridad paga apenas haya un refactor.

**Compatibilidad RULES:**
- §1, §2, §3, §4, §5: ✅ test code, no toca dominio.
- §6: ✅ honra parcialmente "tests" en pre-delivery checklist.

**Alcance acotado a 6 tests críticos** (no exhaustivo):
1. Happy path cash → `status='preparing'`, `payment_proof_source=null`,
   `needs_proof=false`.
2. Happy path transferencia + proof → `status='awaiting_payment'`,
   `payment_proof_source='web'`, `needs_proof=false`.
3. Happy path transferencia sin proof → `status='awaiting_payment'`,
   `needs_proof=true`, `payment_proof_source=null`.
4. `markTokenUsed` falla → error + NO se ejecuta la cascada (verifica
   el comportamiento de L01).
5. `verifyToken` falla → error con el mensaje del `TOKEN_REASON_MESSAGES`
   correspondiente, NO se llama `markTokenUsed` ni nada después.
6. Datos inválidos Zod → `"Datos inválidos"` + NO se llama nada.

**Alternativas descartadas:**
1. **Cobertura completa de todos los caminos.** Descartada — alcance
   crece a >2h. Los 6 tests cubren el 80% del valor de regresión.
2. **Tests integración contra Supabase real.** Descartada (mismo
   argumento que D04 base).

**Caveat de implementación:** la cascada de `createOrder` toca 8 tablas
con chains distintas. El mock de `supabaseAdmin` es más complejo que
el de `transitionOrder`. Estimación realista: ~1.5-2h con setup +
escritura.

**Cómo se valida:**
- `bunx vitest run` muestra 49+6 = 55 tests pasando.
- Todos los tests del happy path verifican el `INSERT orders` con el
  payload completo (incluyendo `customer_name`, `payment_proof_source`).

### D04-A resuelta · 2026-04-30
6 tests creados en
[src/features/orders/__tests__/create-order.test.ts](../../src/features/orders/__tests__/create-order.test.ts):
- 3 happy paths (cash, transferencia con/sin proof) verifican el shape
  exacto del INSERT en `orders` incluyendo `customer_name`,
  `payment_proof_source` y status correcto.
- 3 guardas tempranas: `markTokenUsed` falla → cascade NO se ejecuta
  (regresión-test de L01); token expirado → mensaje específico sin
  tocar DB; input Zod inválido → "Datos inválidos" sin tocar nada.
- 55/55 tests verdes.

**Deuda residual D04-B:** tests para `assignDriver` y `catalog/actions.ts`.
Trigger: próximo refactor de cualquiera de los dos. Probablemente nunca
porque son superficie chica y estable.

---

---

## D05 · Mensajes hardcodeados en español (sin i18n)

- **Severidad:** low
- **Estado:** explícitamente FUERA de scope para MVP
- **Ubicación:** todo el código

### Análisis
Strings de UI y respuestas WhatsApp están hardcoded en español. Cero infraestructura i18n.

### Fix propuesto
NO hacer nada hasta que aparezca un cliente que necesite otro idioma (probablemente nunca para una pizzería en Colombia). Documentado para no inventar trabajo.

---

## D06 · `addresses` siempre crea fila nueva (no dedupe)

- **Severidad:** low
- **Estado:** open
- **Ubicación:** [src/features/orders/actions.ts:123-139](../../src/features/orders/actions.ts#L123)

### Análisis
Cliente Juan que pide 100 veces a la misma dirección genera 100 filas idénticas en `addresses`. La tabla acumula basura silenciosa. Ya cubierto en logica.md L09.

### Fix propuesto
Ver L09. Aquí queda como deuda técnica con expectativa de hacerse cuando un cliente tenga >50 pedidos.

---

## D07 · `next/image unoptimized` en imágenes de producto

- **Severidad:** low
- **Estado:** **fixed (parcial)** · 2026-04-30 — comprobantes optimizados; productos siguen `unoptimized` hasta que el cliente defina dónde aloja sus imágenes
- **Ubicación:** [src/components/shop/pizza-builder.tsx:140](../../src/components/shop/pizza-builder.tsx#L140), [src/components/dashboard/menu-list.tsx](../../src/components/dashboard/menu-list.tsx)

### Análisis
ENGRAM 2026-04-16 documentó: *"`next/image` con `unoptimized` para evitar tocar `next.config.ts` `images.remotePatterns`. Deuda menor: cuando el catálogo crezca, configurar el dominio de Supabase Storage."*

Hoy el catálogo tiene 33 pizzas. Si las imágenes cargan rápido en piloto, no es problema. Si el cliente sube fotos pesadas (>500 KB), el rendimiento del catálogo móvil va a notar.

### Fix propuesto
1. Agregar `images.remotePatterns` con el dominio de Supabase Storage en `next.config.ts`
2. Quitar `unoptimized` de los `<Image>` que apunten a Storage
3. Verificar que carga vía CDN de Vercel y no rompe permisos del bucket

~30 minutos.

### Decisión de implementación · 2026-04-30

**Atacando un alcance reducido del problema original:** al revisar
`supabase/seed.sql` se constata que las 33 pizzas NO tienen `image_url`
seteado (campo NULL), entonces hoy NO hay imágenes de producto que
optimizar. Las únicas imágenes que renderiza la app vía `<Image>`
con `unoptimized` son los **comprobantes de pago** del bucket
`payment-proofs` (signed URLs de Supabase Storage). El fix aplica
solo a esas dos imágenes en `detail-body.tsx`.

**Por qué AHORA:** cuesta poco (~10 min en lugar del 30 estimado),
deja la infra de `remotePatterns` lista para cuando los productos
tengan imagen, y mejora UX del cajero al revisar comprobantes (la
thumbnail de 320×200 hoy descarga la imagen original completa).

**Compatibilidad RULES:**
- §1 Layering: ✅ config + componentes.
- §2 RSC: n/a.
- §3 Memoización: n/a.
- §4 Validación bordes: n/a.
- §5 Naming: n/a.
- §6 Pre-delivery: tsc, sin `any`. Verificar visualmente que el
  comprobante carga.

**Contradice algún hallazgo:** no.

**Alternativas descartadas:**
1. **Optimizar también productos.** Descartada: como `image_url` está
   NULL en seed, no hay nada que optimizar todavía. Y cuando el cliente
   real suba imágenes, vendrán de URL externos desconocidos (probable
   Cloudinary o similar). Sin saber qué dominios, no podemos configurar
   remotePatterns específicos.
2. **Permitir `https://*` en remotePatterns.** Descartada: demasiado
   permisivo. Vercel optimizaría cualquier imagen que el admin pegue,
   con riesgo de SSRF o abuso.

**Alcance:**
- [next.config.ts](../../next.config.ts): agregar `images.remotePatterns`
  con el dominio de Supabase Storage del proyecto activo.
- [src/components/dashboard/order-detail/detail-body.tsx](../../src/components/dashboard/order-detail/detail-body.tsx):
  quitar `unoptimized` de las dos `<Image>` del comprobante.
- Otros archivos (`catalog.tsx`, `pizza-builder.tsx`, `menu-list.tsx`)
  conservan `unoptimized` con un comentario que explica el porqué.

**Deuda residual (D07-A):** cuando los productos tengan imágenes
reales, agregar el dominio elegido a `remotePatterns` y quitar
`unoptimized` de los archivos restantes. Si las imágenes terminan en
Supabase Storage (bucket nuevo `product-images` o similar), el dominio
ya estará permitido y el cambio será mecánico (~5 min).

**Cómo se valida:**
- Manual: en el panel del cajero, abrir un pedido con comprobante.
  Verificar que la thumbnail carga (debería cargar más rápido en móvil).
- DevTools Network: la URL de la imagen debe pasar por `/_next/image?url=...`
  (signo de optimización activa) en lugar de ir directa a Supabase.
- tsc + 37 tests verdes.

---

## D08 · Comentarios "TODO" / "por ahora" sin tracking

- **Severidad:** low
- **Estado:** **fixed** · 2026-04-30
- **Ubicación:** ver grep `TODO\|provisional\|por ahora` en el repo

### Análisis
Hay varios comentarios en el código que dicen "TODO: cuando Meta vuelva", "Provisional", "por ahora", etc. Sin un sistema de tracking, estos se pierden. ENGRAM/LAUNCH_CHECKLIST cubren algunos pero no todos.

### Fix propuesto
Convertirlos en entradas de `audit/` o `LAUNCH_CHECKLIST.md` según corresponda. Eliminarlos del código una vez documentados. Convención: comentarios "TODO" se permiten **solo si tienen un ID de auditoría asociado** (`// TODO L02: chequeo de rol`).

~1h para limpiar.

### Decisión de implementación · 2026-04-30

**Atacando:** 5 referencias residuales detectadas con grep
`TODO|FIXME|por ahora|provisional|por el momento|temporalmente`:

1. `whatsapp-twilio/README.md:54` — "temporalmente" en docs README sobre
   ngrok. **Legítimo** (es prosa, no TODO de código). Sin cambio.
2. `whatsapp/templates.ts:59` — TODO sobre `pf_payment_rejected`.
   **Reformulado** para apuntar a D02 ("Ver D02").
3. `lib/supabase/{client,server,admin}.ts` — TODO sobre tipos `Database`.
   **Reformulado** para apuntar a D13 (creado en este turno).

**Convención fijada:** los comentarios `TODO` se permiten **solo si
referencian un ID de auditoría** (D## o L##). El grep mensual usa esa
convención: cualquier `TODO:` sin ID es deuda no rastreada y se debe
formalizar.

**Compatibilidad RULES:**
- §5: ✅ los comentarios respetan "explicar el POR QUÉ" — apuntan al
  ID donde está la justificación completa.
- Resto: n/a.

**Cómo se valida:**
- `grep -rn "TODO" src/` debe devolver solo entradas que mencionan un
  ID (`D##` o `L##`).
- Manual revisión cada vez que se haga el grep.

---

## D09 · Sin tests para el adapter de notificaciones

- **Severidad:** low
- **Estado:** open
- **Ubicación:** [src/features/notifications/send-order-update.ts](../../src/features/notifications/send-order-update.ts)

### Análisis
El adapter `send-order-update.ts` es el ÚNICO punto de envío de notificaciones al cliente. Cuando Meta vuelva, el código va a cambiar acá. Sin tests, refactors van a ciegas.

### Fix propuesto
Test unitarios con `supabaseAdmin` mockeado:
- `sendOrderUpdate(orderId, "preparing")` → llama `sendTwilioText` con mensaje "Tu pedido de las {hora} está en preparación 🍕"
- `sendOrderUpdate(orderId, "new")` → no llama nada, retorna `{ok: true}` (estado sin notificación)
- Sin teléfono → `{ok: false, error: "no phone for order"}`

~1h.

---

## D10 · Migrations `.skip` requieren intervención manual al subir a Supabase Pro

- **Severidad:** medium
- **Estado:** **moved to LAUNCH_CHECKLIST B10** · 2026-04-30
- **Ubicación:** [supabase/migrations/0003_delay_alerts.sql.skip](../../supabase/migrations/0003_delay_alerts.sql.skip), [supabase/migrations/0006_proof_reminders_cron.sql.skip](../../supabase/migrations/0006_proof_reminders_cron.sql.skip)

### Análisis
Cuando el cliente suba a Supabase Pro, hay 2 migrations dormidas que activan crons de WhatsApp. El `.skip` evita que se apliquen automáticamente. Pero el dev tiene que recordar:
1. Renombrar quitando `.skip`
2. Aplicar a Supabase
3. Actualizar `cron_config` con la URL del proyecto y `cron_secret`
4. Verificar que el cron está corriendo

Si esto se olvida, el sistema corre OK pero F8 (alerta de retraso) y proof reminders quedan apagados sin alerta.

### Fix propuesto
- Documentar el procedimiento en `LAUNCH_CHECKLIST.md` como **A6** (paso del bloque A, "para poder vender") con checklist explícita.
- Health check: agregar a `/admin/metricas` (cuando se construya, ver B7) un indicador "Crons activos: 2/2" leyendo `cron.job` table de pg_cron. Si está caído, alerta visible.

20 min documentar; el health check va con B7.

### Decisión de implementación · 2026-04-30

**Hecho parcialmente.** El procedimiento explícito quedó en
[LAUNCH_CHECKLIST.md B10](../LAUNCH_CHECKLIST.md) (con SQL exacto para
verificar). La parte de health check sigue diferida — depende de B7
(`/admin/metricas`).

Bloque A estaba ocupado (A1-A8 ya existían), entonces se ubicó en B10
(post-piloto, post-Pro). Coherente: el procedimiento de activar pg_cron
solo aplica cuando suben a Pro, que es post-piloto.

---

## L01-A · Atomicidad estricta de `createOrder` (stored procedure o idempotency key)

- **Severidad:** medium
- **Estado:** open (porción diferida de L01)
- **Ubicación:** [src/features/orders/actions.ts:115-300](../../src/features/orders/actions.ts#L115-L300)

### Análisis
L01 (en `audit/logica.md`) cerró la parte user-facing más urgente: mover
`markTokenUsed` al inicio para evitar duplicados en el panel cuando el
cliente reintenta. Lo que quedó pendiente es la atomicidad real:
- Si `INSERT addresses` tiene éxito pero `INSERT orders` falla → fila
  huérfana en `addresses`. Hoy invisible (no se muestra en UI), solo
  acumula bytes en DB.
- Si `INSERT orders` tiene éxito pero `INSERT order_items` falla →
  order huérfana sin items. Las queries ya filtran `item_count > 0`,
  así que no aparece en el panel; sigue acumulando bytes.

Ambos son tolerables hoy porque (a) la tasa de fallos parciales es
baja, (b) las queries ya filtran orphans, (c) los bytes son
despreciables.

### Fix propuesto cuando se eleve
**Stored procedure** `create_order(jsonb)` que envuelva la cascada
completa en una transacción. Server Action sigue siendo el dueño de la
lógica de dominio (Zod, computeUnitPrice, pickInitialStatus); solo
delega los INSERTs cascade al RPC para garantizar atomicidad.

**Trigger para activar:** uno de los siguientes:
- ≥3 incidentes mensuales de orphans/duplicados detectados en piloto.
- `select count(*) from orders o where not exists (select 1 from order_items where order_id = o.id)` supera 10 filas en cualquier momento.
- Un cliente reporta haber pagado y no ver pedido (síntoma de orphan address sin order).

**Costo:** ~1 día. Tensiona §1 RULES (lógica en DB) pero solo el cascade
INSERT, no validación. Aceptable como excepción documentada.

---

## D13 · Clientes de Supabase sin tipos generados (`Database`)

- **Severidad:** low
- **Estado:** open
- **Ubicación:** [src/lib/supabase/client.ts](../../src/lib/supabase/client.ts), [server.ts](../../src/lib/supabase/server.ts), [admin.ts](../../src/lib/supabase/admin.ts)

### Análisis
Los tres clientes de Supabase no parametrizan `<Database>`. Resultado:
todas las queries devuelven `unknown`, y forzamos casts manuales en
queries.ts y actions.ts (`as unknown as ActiveOrderRow[]`, etc.). Eso
elimina la safety neta de TypeScript: si una columna se renombra o se
agrega, los tipos en code no se actualizan.

### Fix propuesto
1. Linkear el proyecto:
   ```bash
   bunx supabase login
   bunx supabase link --project-ref oqkhzqgvofqkjbgreoli
   ```
2. Generar tipos:
   ```bash
   bunx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
   ```
3. Parametrizar los tres clientes con `<Database>` y borrar los casts
   manuales de queries.

~1h una sola vez + ~10 min cada vez que cambien las migrations (regenerar
tipos como parte del flujo de migration).

**Cuándo:** próxima vez que se toque alguna migration (sale gratis). O
si una columna nueva se rompe sin que TypeScript avise (síntoma del
problema). Antes del piloto si hay tiempo.

---

## D12 · Tres helpers de tokens duplican lógica HMAC + lookup

- **Severidad:** low
- **Estado:** open
- **Ubicación:** [src/features/order-tokens/verify.ts](../../src/features/order-tokens/verify.ts)

### Análisis
Hay tres helpers que comparten la mayor parte del código:
- `verifyToken(token)` — acepta solo tokens vivos (no expirados, no usados)
- `getCustomerIdFromExpiredToken(token)` — acepta solo expirados o usados
- `resolveTokenCustomer(token)` — acepta cualquier estado (introducido en
  el fix de L04)

Cada uno repite: parsing del formato `id.iat.sig`, verificación HMAC con
`timingSafeEqual`, lookup por `token_hash`. Solo difieren en el filtro
final de estado.

### Fix propuesto
Refactorizar a un único helper base `resolveTokenWithStatus(token)` que
retorne `{ok, customerId, tokenId, status: "valid"|"expired"|"used"}`,
y mantener los 3 actuales como wrappers delgados que filtran por status.

```ts
// resolveTokenWithStatus → fuente única
// verifyToken → wrapper que rechaza !valid
// getCustomerIdFromExpiredToken → wrapper que rechaza valid
// resolveTokenCustomer → wrapper que acepta todo
```

~1h. Sin tests para los wrappers (cubierto por tests del base).

**Cuándo:** no urgente. Hacerlo cuando se vuelva a tocar `verify.ts` por
cualquier motivo (ej. agregar `nbf` o expandir el formato del token).

---

## D11 · `requireStaff()` redirige a `/pedidos` cuando el rol no aplica (no hay /403)

- **Severidad:** low
- **Estado:** open (decisión consciente)
- **Ubicación:** [src/features/auth/guards.ts:16-19](../../src/features/auth/guards.ts#L16)

### Análisis
ENGRAM 2026-04-16 documentó: *"requireStaff redirige a /pedidos si el rol no aplica (no creamos /403); todos los staff pueden ver la cola base, es un aterrizaje neutro."*

OK para MVP. Pero conviene revisar después del piloto si los drivers se confunden al intentar abrir `/menu` y caer en `/pedidos`.

### Fix propuesto
Si en piloto se reportan confusiones, crear `/403` con mensaje claro: *"No tienes permiso para esta sección. Contacta al administrador."*. ~15 min.

---

## Histórico de findings cerrados

(Vacío por ahora.)
