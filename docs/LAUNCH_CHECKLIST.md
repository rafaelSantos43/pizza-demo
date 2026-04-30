# Launch Checklist — del prototipo al primer cliente

> **Para qué sirve este archivo:** lista concreta de lo que DEBE estar listo antes de ofrecerle el sistema a la primera pizzería, y lo que se construye después del "sí" verbal. Genérico — no personalizado a Pizzas Family ni a ningún cliente específico. Cualquier pizzería single-location puede ser el primer prospecto.
>
> **Cómo se usa:** tachar ítems con `- [x]` conforme se completen. No mezclar con ENGRAM (que es decisiones) ni con PRD (que es alcance).

**Última revisión:** 2026-04-17 (A1-A6 completados; demo en producción corriendo en https://pizza-demo-five.vercel.app)

---

## Bloque A — Para poder vender (2h de trabajo)

Sin esto no hay producto, hay prototipo. **Todo lo que hay en el repo corre en demo mode (memoria) — nunca se ha probado un pedido real contra Supabase.** Esa es la brecha que cierra este bloque.

- [x] **A1.** Supabase project montado (free tier), URL + ANON_KEY + SERVICE_ROLE_KEY en `.env.local`
- [x] **A2.** `bunx supabase db push` aplica las 4 migrations limpio (0003 pg_cron skipped — requiere Pro)
- [x] **A3.** Seed aplicado vía Studio (33 pizzas + settings)
- [x] **A4.** Admin profile creado en Supabase Studio
- [x] **A5.** **UN pedido end-to-end probado de verdad** — desde celular al catálogo → arma carrito → confirma → aparece en `/pedidos` → transicionar estados
- [x] **A6.** Deploy a Vercel con URL pública: https://pizza-demo-five.vercel.app
- [ ] **A7.** Video Loom de 2 min mostrando el flujo completo.
- [ ] **A8.** Pitch de 60 segundos memorizado (no leído). Ancla en UN dolor concreto, no en features.

---

## Bloque B — Para operar 30 días de piloto (post-"sí", sin Meta aprobado)

Meta tarda 3-4 semanas en aprobar WhatsApp Business Cloud + plantillas. Mientras tanto el sistema opera con mensajes manuales pero igual ahorra caos. **Solo se construye después del "sí" verbal del cliente.**

- [ ] **B1.** `/settings` funcional: editar zonas de entrega + ETAs, `business_name`, cuentas de pago (Nequi / Bancolombia / Llave). Sin esto, cambiar precios de zona requiere llamar al dev.
- [ ] **B2.** Botón "Nuevo pedido manual" en el panel: cajero ingresa teléfono + nombre → sistema genera token → muestra link copiable para pegar en WhatsApp personal. Reemplaza al webhook de F1 mientras Meta se aprueba.
- [ ] **B3.** Mensajes copiables en cada transición de estado: toast o modal con "copia este texto y pégalo en WhatsApp" (reemplazo manual de F6 hasta que Meta esté activo).
- [ ] **B4.** Botón copy-to-clipboard de dirección en cards del panel y vista mensajero (para pegar en Maps sin retipear).
- [ ] **B5.** **Autocomplete del cliente recurrente en checkout** (PRD §F2, prometido pero no construido). Query `getCustomerByToken` que devuelva `{ name, addresses[] }`; form hidrata `defaultValues` y agrega selector "Usar dirección guardada" si el cliente ya tiene direcciones. Sin esto los clientes de semana 2+ se cansan de re-llenar todo.
- [ ] **B6.** **Vista de histórico de pedidos** `/pedidos/historico` con filtros básicos (fecha, teléfono, estado). Hoy `listActiveOrders` filtra `delivered`/`cancelled` → desaparecen del panel pero siguen en DB. Sin la vista, el cajero no puede atender una reclamación tipo "mi pedido del viernes pasado". Reusa `getOrderDetail` para abrir el sheet existente. ~1-2 días. **No urgente para piloto** (poco volumen, el cajero recuerda); hacerlo cuando llegue la primera reclamación o cuando el dueño lo pida.
- [ ] **B7.** **Página `/admin/metricas` (PRD §15)** con 6 números grandes: pedidos hoy, pedidos esta semana, % entregas a tiempo (eta_at vs delivered_at), reclamos manuales, % autocompletado, tasa uso del link. Lee de `orders` y `order_status_events`. ~1 día. Hacerlo después de B6 para poder responder al dueño "¿cómo va el negocio?".
- [ ] **B8.** **Política de retención de comprobantes 90 días** (PRD §8, §14). Script mensual (cron en Supabase o Vercel Cron) que borra archivos del bucket `payment-proofs` con `created_at < now() - interval '90 days'`. NO borra filas de `orders` — solo el archivo. La fila mantiene `payment_approved_at` como evidencia de que se validó en su momento. ~2h. Necesario antes de saturar el free tier de Storage (~360 MB con tráfico estimado del PRD).
- [ ] **B9.** **Camino B (comprobante por WhatsApp) en webhook de Twilio.** Hoy `app/api/webhooks/twilio/route.ts` solo dispara `greet` para CUALQUIER mensaje entrante. Replicar la lógica de `handle-incoming.ts` (Meta) para Twilio: detectar `MediaUrl0`, descargar con auth Twilio, asociar al pedido pendiente del teléfono. ~1 día. **Bloqueado por:** mientras Twilio sea sandbox (provisional, no escala a clientes reales), construir el handler completo es trabajo especulativo. Si Meta resuelve el trámite primero, este ítem se descarta — la lógica ya existe en `handle-incoming.ts`. Movido desde audit/logica.md L08.
- [ ] **B10.** **Activar migrations `.skip` cuando se suba a Supabase Pro.** Hoy hay dos crons de WhatsApp dormidos:
  - `supabase/migrations/0003_delay_alerts.sql.skip` — alerta proactiva de retraso (PRD §F8)
  - `supabase/migrations/0006_proof_reminders_cron.sql.skip` — recordatorio de comprobante (mejora 2026-04-30)

  Procedimiento al activar Supabase Pro:
  1. Renombrar `0003_delay_alerts.sql.skip` → `0003_delay_alerts.sql` y `0006_proof_reminders_cron.sql.skip` → `0006_proof_reminders_cron.sql`
  2. `bunx supabase db push` (o ejecutar el SQL en Studio → SQL Editor)
  3. Supabase Studio → Table Editor → `cron_config`. Actualizar:
     - `delay_alerts_url` → `https://pizza-demo-five.vercel.app/api/cron/delay-alerts`
     - `proof_reminders_url` → `https://pizza-demo-five.vercel.app/api/cron/proof-reminders`
     - `cron_secret` → mismo valor que la env var `CRON_SECRET` en Vercel Production
  4. Verificar que los jobs están programados:
     ```sql
     select jobname, schedule, command from cron.job
     where jobname in ('delay_alerts_every_2min', 'proof_reminders_every_2min');
     ```
  5. Ver historial de ejecuciones (debe haber filas dentro de los 4 minutos siguientes):
     ```sql
     select start_time, status from cron.job_run_details
     where jobid in (select jobid from cron.job where jobname like '%every_2min')
     order by start_time desc limit 10;
     ```

  Sin este paso, F8 (alerta de retraso) y los recordatorios de comprobante quedan apagados sin alerta visible. ~20 min total. Movido desde audit/deuda-tecnica.md D10.

Tiempo estimado: ~1 día (B1–B5) + ~3 días (B6–B8) = ~4 días total.

---

## Bloque C — Explícitamente FUERA de scope hasta segundo aviso

- ❌ **Integración PrintNode / ESC/POS**: vendida como feature, pero se construye con la ticketera REAL del cliente en la semana 1 post-venta. Antes es trabajo especulativo.
- ❌ **Webhook WhatsApp activo** (F1, F6, F7, F9 Camino B): bloqueado por verificación Meta (3-4 semanas). El código YA existe dormido.
- ❌ **pg_cron alertas de retraso F8**: depende de Meta para enviar plantillas.
- ❌ **Multi-branch / multi-sede**: bloqueado hasta commit del cliente. Si el primer cliente tiene múltiples sedes, es ~1 semana extra post-"sí".
- ❌ **Upload nativo de imágenes de producto**: admin pega URL por ahora (Imgur/Cloudinary).
- ❌ **Export CSV/JSON**, **banner plan vencido**, **panel super-admin**: se agregan al momento de necesitarlos con un cliente real, no antes.
- ❌ **Schema refactor para productos no-pizza** (hamburguesas, bebidas, etc.): bloqueado hasta que el cliente lo pida — la mayoría de pizzerías venden mayormente pizzas.

---

## Bloque D — Ajustes de copy/UX pendientes de feedback real

Cambios pequeños identificados durante el dev que NO se tocan hasta que un cliente real los pida. Principio: no inventar objeciones.

- [ ] **D1.** Selector de zona en checkout: `{zona} (~{min} min)` → `{zona} (aprox. {min} min)`. Palabra completa en lugar de símbolo. Solo aplicar si un cliente dice que el `~` confunde.
- [ ] **D2.** ETA como rango (`25–35 min` en lugar de `30 min`). Requiere cambio de schema (`eta_min_low` + `eta_min_high`). Hacerlo si un cliente pide más honestidad en la expectativa.
- [ ] **D3.** Ocultar ETA del selector de zona (solo mostrar nombre, sin tiempo). Solo si un cliente no quiere comprometer tiempos por política. (Resuelto parcialmente 2026-04-20: la zona se sacó del checkout entero, ver ENGRAM.)
- [ ] **D4.** Modelo de cobro de domicilio. Hoy el sistema asume "domicilio incluido en el precio" ([ENGRAM 2026-04-16](ENGRAM.md)). Validar con el primer cliente real si: (a) sigue así, (b) se cobra fijo (ej. $7.000), o (c) varía por zona. Si cambia → ~1-2h de trabajo: migration con `delivery_cost_cents` en `orders` (o config en `settings.delivery_zones`), suma en `createOrder` al `total_cents`, línea "Domicilio: $X" en checkout / `/gracias` / panel staff, copy de políticas actualizado, ENGRAM revertido.

---

## Orden recomendado

1. **Hoy/mañana:** completar bloque A. No se puede vender con `NEXT_PUBLIC_DEMO_MODE=true`.
2. **Grabar Loom** solo cuando A5 esté verde.
3. **Armar lista de 5-10 prospectos** (pizzerías single-location en Medellín, WhatsApp Business azul, Insta con 1k+ seguidores, 1+ año operando).
4. **Enviar Loom + pitch corto** por WhatsApp a los 5-10. Agendar reunión de 20 min con quien conteste.
5. **En la reunión:** pitch 60 seg + demo en vivo 3 min + la pregunta ancla ("¿Cuántas veces a la semana le pasa esto?" mostrando capturas de chat).
6. **Cierre:** oferta de piloto gratis 30 días. Pedir commit escrito por WhatsApp.
7. **Después del commit:** arrancar bloque B.

---

## Riesgo #1 hoy

**A5 (pedido end-to-end real) no está probado.** Si el dueño pregunta *"¿esto realmente funciona?"* y la respuesta honesta es *"todavía no lo he probado contra DB real"*, la venta se cae. **1 hora resuelve esto.** Es la prioridad cero.
