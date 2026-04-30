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

## D03 · Sin tests E2E (Playwright instalado pero sin specs)

- **Severidad:** medium
- **Estado:** open
- **Ubicación:** [package.json:devDependencies](../../package.json)

### Análisis
Playwright está instalado (`@playwright/test`) pero no hay carpeta `e2e/` ni specs. El proyecto solo tiene unit tests con vitest (37 tests). Para un MVP single-tenant es justificable pero antes del piloto vale la pena agregar 2-3 specs críticos.

### Specs mínimos sugeridos
- `e2e/order-flow.spec.ts`: cliente arma pedido en `/pedir/[token]`, confirma efectivo, verifica `/gracias`
- `e2e/cashier-panel.spec.ts`: login staff, ve un pedido nuevo, lo aprueba/transiciona, verifica que cambia estado
- `e2e/expired-link.spec.ts`: abre token expirado, click "Pedir nuevo link", verifica respuesta

~1 día. Bajo prioridad pero alto retorno.

---

## D04 · Sin tests para Server Actions

- **Severidad:** medium
- **Estado:** open
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
- **Estado:** open
- **Ubicación:** [src/components/shop/pizza-builder.tsx:140](../../src/components/shop/pizza-builder.tsx#L140), [src/components/dashboard/menu-list.tsx](../../src/components/dashboard/menu-list.tsx)

### Análisis
ENGRAM 2026-04-16 documentó: *"`next/image` con `unoptimized` para evitar tocar `next.config.ts` `images.remotePatterns`. Deuda menor: cuando el catálogo crezca, configurar el dominio de Supabase Storage."*

Hoy el catálogo tiene 33 pizzas. Si las imágenes cargan rápido en piloto, no es problema. Si el cliente sube fotos pesadas (>500 KB), el rendimiento del catálogo móvil va a notar.

### Fix propuesto
1. Agregar `images.remotePatterns` con el dominio de Supabase Storage en `next.config.ts`
2. Quitar `unoptimized` de los `<Image>` que apunten a Storage
3. Verificar que carga vía CDN de Vercel y no rompe permisos del bucket

~30 minutos.

---

## D08 · Comentarios "TODO" / "por ahora" sin tracking

- **Severidad:** low
- **Estado:** open
- **Ubicación:** ver grep `TODO\|provisional\|por ahora` en el repo

### Análisis
Hay varios comentarios en el código que dicen "TODO: cuando Meta vuelva", "Provisional", "por ahora", etc. Sin un sistema de tracking, estos se pierden. ENGRAM/LAUNCH_CHECKLIST cubren algunos pero no todos.

### Fix propuesto
Convertirlos en entradas de `audit/` o `LAUNCH_CHECKLIST.md` según corresponda. Eliminarlos del código una vez documentados. Convención: comentarios "TODO" se permiten **solo si tienen un ID de auditoría asociado** (`// TODO L02: chequeo de rol`).

~1h para limpiar.

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
- **Estado:** open (intencional)
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
