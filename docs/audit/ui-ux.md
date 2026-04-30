# Auditoría — UI/UX

Fricción del usuario, estados invisibles, copy ambiguo, comportamientos inesperados. No bloquea funcionalmente pero erosiona confianza.

> Prefijo de IDs: **U**

---

## U01 · Badge de "Esperando comprobante (N min)" no se actualiza solo

- **Severidad:** medium
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/components/dashboard/order-card.tsx:91-130](../../src/components/dashboard/order-card.tsx#L91)

### Síntoma observable
El badge gradado del card del pedido (amarillo/naranja/rojo según `Date.now() - created_at`) calcula los minutos al render. Si el pedido queda sin cambios durante 30 min y no llega ningún evento Realtime nuevo, el card sigue mostrando "Esperando comprobante (5 min)" cuando ya van 35.

### Causa raíz
Decisión consciente: no agregamos `setInterval` para no re-renderear todos los cards cada minuto. Realtime fuerza re-render solo en cambios de DB.

### Fix propuesto
Un único `setInterval(() => forceRender(), 60_000)` a nivel del padre `OrdersBoard`. Re-renderea todos los cards cada minuto, costo despreciable con <50 cards en pantalla. ~10 minutos.

### Decisión de implementación · 2026-04-30

**Atacando:** badge gradado calcula minutos al render; no se actualiza
solo si no llega evento Realtime. Pedido abandonado puede mostrar
"5 min" cuando ya van 35.

**RULES:** §3 ningún memo. §2 sigue Client component (necesario para
hooks).

**Alcance final:** mover el `setInterval` DENTRO del `ProofWaitingBadge`
en lugar del padre. Razón: solo los badges visibles necesitan
recalcular; el padre re-renderearía todos los cards cada minuto en
vano. Cleanup en unmount.

**Alternativa descartada:** pasar un timestamp por prop desde el padre.
Acopla el badge al padre sin necesidad — el badge ya tiene su propio
input (`createdAt`).

---

## U02 · Toast persistente del beep se pierde con F5

- **Severidad:** medium
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/components/dashboard/orders-board.tsx:88-110](../../src/components/dashboard/orders-board.tsx#L88)

### Síntoma observable
Cuando llega un INSERT a `orders` en `awaiting_payment` o `new`, el panel emite un beep + toast persistente con `id = order.id`. Pero el toast vive en estado del cliente sonner — si el cajero refresca la página (F5 accidental, navega a `/menu` y vuelve), **el toast se pierde**. El cajero ya no escucha el beep ni ve la alerta, aunque el pedido sigue ahí esperando.

### Causa raíz
El toast es estado local del componente, no persistente en DB. La alerta se diseñó como "señal de evento", no como "estado pendiente".

### Fix propuesto
Al montar el panel, ejecutar una pasada inicial: para cada pedido `new` o `awaiting_payment` que cargue del server, emitir el toast persistente con su id. Al menos al volver al panel se reconstruye la lista de alertas pendientes. ~20 minutos.

### Decisión de implementación · 2026-04-30

**Atacando:** F5 destruye los toasts persistentes. Cajero no vuelve a
oír beep ni ver alerta para pedidos que ya estaban en
`awaiting_payment` o `new` antes de refrescar.

**Caveat de scope:** filtro temporal — solo replay de pedidos
RECIENTES (`created_at > now - 10min`). Sin esto, el cajero recibiría
una avalancha de toasts si refresca con 50 pedidos abandonados de
las últimas horas. La cota de 10 min cubre el caso normal (cajero
refresca por accidente, no por necesidad de revisar histórico).

**RULES:** §3 ningún memo. §2 client-only es necesario.

**Alcance:** solo `orders-board.tsx`. useEffect que itera `initial`
una vez al mount, filtra por `ALERTING_STATUSES` y `created_at`
reciente, emite toast usando el mismo formato del INSERT-handler.
**No reproduce el beep** — el cajero recién refrescó la página, ya
tiene la atención en pantalla; doble estímulo es ruido.

**Mensaje distinto al INSERT:** "Pedido pendiente" en lugar de
"Pedido nuevo" para indicar al cajero que es replay, no algo que acaba
de llegar.

---

## U03 · Audio puede estar bloqueado y el cajero no se da cuenta

- **Severidad:** medium
- **Estado:** in progress · 2026-04-30 — delegado a UI/UX Agent
- **Ubicación:** [src/components/dashboard/orders-board.tsx:51-72](../../src/components/dashboard/orders-board.tsx#L51)

### Síntoma observable
Por autoplay policy, el AudioContext se crea en el primer `pointerdown` o `keydown` del usuario. Si el cajero abre el panel y NO toca nada (solo mira), el audio nunca se desbloquea. Cuando llega un pedido, no hay beep — solo el toast. Si encima el toast tiene U02, el cajero no se entera de nada.

Tampoco hay indicación visual al cajero de que el audio está bloqueado.

### Causa raíz
La política del navegador es estándar; el problema es no surfacearlo al usuario.

### Fix propuesto
Banner persistente en la parte superior del panel: *"Activar sonidos"* con un botón. Al click, se crea el AudioContext y suena un beep de prueba. Banner desaparece. Si después de N segundos no se activa, mostrar un warning más prominente. ~1h.

### Decisión de implementación · 2026-04-30

**Atacando:** la autoplay policy bloquea el AudioContext hasta el primer
gesto del usuario. Si el cajero abre el panel y NO toca nada (solo
mira), el beep nunca suena. Combinado con U02 (toast persistente
recover after F5), el cajero se queda sin alertas hasta tocar algo.

**Por qué se delega a UI/UX Agent:** introduce un patrón nuevo del
design system (banner persistente con CTA), no presente hoy en el
proyecto. Feedback memory del proyecto explícito: *"cambios UI/UX que
tocan ≥3 archivos o introducen patrones del design system van por Task
tool, no inline"*.

**RULES a respetar (que la delegación debe honrar):**
- §1 Layering: el banner es UI puro; lógica de "audio activado" puede
  vivir en `OrdersBoard` o en `useReplayPendingOrderToasts` ampliado.
- §2 RSC default: el banner será Client (necesita estado de "activado").
- §3 Sin memos.
- §4 Tailwind v4 + tokens del design system del proyecto (terracota,
  mostaza, success).
- §5 Naming: `useAudioActivation` o `<ActivateAudioBanner>`.

**Alcance esperado:**
- Nuevo componente Client `<ActivateAudioBanner />` (o hook +
  componente UI separado).
- Banner aparece SOLO si AudioContext aún no se ha desbloqueado al
  cargar el panel. Desaparece tras click + beep de prueba.
- Si el usuario lo descarta, persistir en `localStorage` para que no
  vuelva a aparecer en la sesión (opcional, decisión del agente).
- Integración con `OrdersBoard`: el `audioCtxRef` actual se levanta a
  un hook compartido entre el banner y el board.

**Por qué NO se hace inline:** el componente es nuevo, requiere
decisiones de UX (mensaje exacto, posición del banner, comportamiento
tras descarte) y design (token de color, peso visual). Mejor decisión
agregada del UI/UX Agent que iterar inline.

**Estado:** se delega al UI/UX Agent en este turno.

---

## U04 · Mensajes de error genéricos en checkout

- **Severidad:** low
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/features/orders/actions.ts:303-307](../../src/features/orders/actions.ts#L303)

### Síntoma observable
Cuando `createOrder` falla por una causa real (DB caída, foto corrupta, dirección inválida), el cliente solo ve *"No pudimos crear tu pedido. Intenta de nuevo."* Si la causa fue un precio que cambió en el catálogo o un producto desactivado mientras armaba el carrito, el cliente reintentará y se frustrará.

### Causa raíz
El catch genérico oculta detalles. La política es no exponer stacktraces al cliente, lo cual es correcto, pero debería distinguir entre "intentar de nuevo" vs "tu carrito tiene productos que ya no están disponibles, vuelve al catálogo".

### Fix propuesto
Inspeccionar el tipo de error en el catch y mapear a mensajes específicos:
- Stock/precio/producto inactivo → *"Algunos productos del carrito ya no están disponibles. Vuelve al catálogo."*
- Network/timeout → *"Hubo un problema de conexión. Intenta de nuevo."*
- Datos inválidos (Zod ya cubre, raro acá) → *"Revisa los datos del formulario."*

~30 minutos.

### Decisión de implementación · 2026-04-30

**Atacando alcance reducido:** los mensajes de error específicos que YA
existen en `createOrder` (producto no disponible, sabores excedidos,
mitad-y-mitad inválida, sabor en tamaño incompatible) son técnicamente
correctos pero no le dicen al cliente QUÉ HACER. Mejorarlos para que
sean accionables: *"Vuelve al catálogo y actualiza tu pedido"* en lugar
de *"Producto o tamaño no disponible"*.

NO ataco el catch genérico — distinguir tipos de error desde un catch
es brittle (depende de mensajes de Postgres/Supabase). Ese trabajo es
deuda futura si el piloto muestra problemas reales.

**RULES:** todos n/a (cambio de copy en strings de error).

**Alcance:** [src/features/orders/actions.ts](../../src/features/orders/actions.ts)
4 strings de error reformulados. Sin cambios en UI ni en flujo.

**Cómo se valida:** los tests de createOrder (D04-A) capturan el shape
del INSERT pero no los mensajes de error específicos del item-loop.
Los mensajes nuevos son strings — el equivalente de tests sería
testear cada rama del item-loop, scope creep. Verificación manual:
crear un pedido con producto inactivo o sabores excedidos y leer el
toast.

---

## U05 · Toast del beep no identifica el pedido

- **Severidad:** low
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/components/dashboard/orders-board.tsx:104-110](../../src/components/dashboard/orders-board.tsx#L104)

### Síntoma observable
El toast persistente dice *"🍕 ¡Pedido nuevo! $25.000"*. Si llegan dos pedidos del mismo monto al tiempo (común en pizzería con 2 personales), el cajero ve dos toasts idénticos. ¿Cuál es cuál? No lo sabe hasta abrir cada card.

### Causa raíz
El payload del INSERT solo trae las columnas crudas de `orders` (no el customer joined). El componente decidió mostrar solo el monto.

### Fix propuesto
Agregar la hora de creación al toast: *"🍕 Pedido nuevo · $25.000 · 7:50 p. m."*. La hora viene en el `payload.new.created_at`. ~5 minutos.

Más ambicioso: hacer un fetch ligero del nombre del cliente para incluirlo. Pero suma latencia y queries.

### Decisión de implementación · 2026-04-30

**Atacando:** dos pedidos del mismo monto que llegan juntos producen
toasts idénticos; el cajero no distingue cuál es cuál.

**Por qué AHORA:** ~5 min, coherente con el fix que hicimos a las
notificaciones al cliente (mejora 1A). Una sola fuente de verdad
para "identificación humana de pedido = hora".

**RULES:** ✅ §3 ningún memo, ✅ §5 sin nombres nuevos, n/a el resto.

**Alcance:** [orders-board.tsx](../../src/components/dashboard/orders-board.tsx)
— inyectar hora formateada en el toast del INSERT. Reusa
`Intl.DateTimeFormat("es-CO", hour12)` que ya existe en `order-card.tsx`.

**Caveat:** el formatter está duplicado entre `send-order-update.ts`,
`order-card.tsx` y ahora orders-board. Consolidar es deuda menor — D-nuevo
no se justifica por 3 ocurrencias triviales (3 líneas cada una).

---

## U06 · Botón "Confirmar pedido" no protege contra dobles clicks por click rápido

- **Severidad:** low
- **Estado:** parcialmente mitigado
- **Ubicación:** [src/components/shop/checkout-form.tsx:710-730](../../src/components/shop/checkout-form.tsx)

### Análisis
El botón usa `disabled={submitting}` con `setSubmitting(true)` al inicio del `onSubmit`. React handles bien el estado, pero entre el click y el primer render del estado hay un microtask. En conexiones lentas con doble-click muy rápido, en teoría se podrían disparar dos `onSubmit` antes de que el primero alcance el `setSubmitting`.

En la práctica, el handler tiene un await asíncrono después de la primera línea, así que el doble-click del usuario es muy raro. Pero si pasa, ambos calls van a `createOrder` y se crean dos pedidos.

### Fix propuesto
Guardar `useRef<boolean>` para el "submitting" en lugar de state. Lectura síncrona, no espera React. ~10 minutos. Bajo prioridad — no se ha visto pasar.

---

## U07 · `/pedir/[token]` no avisa al cliente de F5 / pérdida de carrito

- **Severidad:** low
- **Estado:** open
- **Ubicación:** [src/components/shop/catalog.tsx](../../src/components/shop/catalog.tsx), [src/components/shop/checkout-form.tsx](../../src/components/shop/checkout-form.tsx)

### Síntoma observable
El carrito vive en localStorage con clave `pfd:cart:v1`. Si el cliente arma 5 productos y refresca, el carrito se mantiene. Pero si abre el link en una pestaña distinta del navegador (no privada), también ve el mismo carrito → potencialmente confuso si el cliente tiene varias órdenes en mente.

### Fix propuesto (a futuro)
Cuando el carrito está vacío en `/pedir/[token]/checkout`, mostrar mensaje: *"Tu carrito quedó vacío. Vuelve al catálogo para seleccionar productos."* + botón. Ya está implementado parcialmente, validar UX. **No urgente.**

---

## U08 · Webview de WhatsApp en iOS sigue siendo fuente de fricción real

- **Severidad:** high
- **Estado:** **mitigated** · 2026-04-30 — pista en el copy del greet; bug externo no se cierra del lado server
- **Ubicación:** Externa al código — bug del webview de WhatsApp iOS

### Síntoma observable
Cliente abre el link del menú **desde dentro de WhatsApp en iPhone** y a veces ve "This page couldn't load — A server error occurred. ERROR 1792931535" aunque el servidor responda 200. Probado: en Safari directo SÍ carga el catálogo, en otros dispositivos también, solo falla en webview iOS.

### Causa raíz
El webview in-app de WhatsApp en iOS cachea agresivamente respuestas y a veces se aferra a un error 5xx anterior, o tiene problemas con chunks de Next.js de hash mutables.

### Fix propuesto
Agregar al copy del greet de Twilio una nota: *"Si la página no carga al abrir el link, copia el link y pégalo en Safari."* Imperfecto pero realista. **5 minutos.**

A futuro: forzar `dynamic = "force-dynamic"` en `/pedir/[token]/page.tsx` y reducir el bundle del cliente para minimizar problemas de chunks. Investigación más profunda.

### Decisión de implementación · 2026-04-30

**Atacando:** el webview in-app de WhatsApp iOS es un bug externo que
no podemos arreglar server-side. Mejor mitigación realista hoy: una
línea en el copy del greet que le dice al cliente cómo abrirlo en
Safari si la página no carga.

**RULES:** ✅ todos n/a. Solo copy.

**Alcance:** [whatsapp-twilio/greet.ts](../../src/features/whatsapp-twilio/greet.ts).
Cuando Meta vuelva, replicar la misma pista en el template `pf_greet`
(o aprobarlo con la nota incluida).

**Caveat:** el iPhone iOS es ~50% del mercado en Colombia. El cliente
real va a tener este problema seguido al abrir en WhatsApp por primera
vez. Esta mitigación NO lo resuelve, solo le da una vía de escape.
La investigación de "force-dynamic + bundle reduction" queda como D-nuevo
si el problema persiste tras el copy fix.

---

## U09 · Hint del comprobante no menciona qué hacer si falla

- **Severidad:** low
- **Estado:** in progress · 2026-04-30
- **Ubicación:** [src/components/shop/checkout-form.tsx:570-582](../../src/components/shop/checkout-form.tsx#L570)

### Síntoma observable
Hoy el copy dice *"Si tienes problemas para subir el archivo aquí, comunícate con el restaurante."* — vago. ¿Por dónde se comunica? ¿Por el WhatsApp original? ¿A qué número? No da pista.

### Causa raíz
Cambiamos el copy en este turno para sesgar contra camino B (que no funciona en Twilio), pero quedó genérico.

### Fix propuesto
Si tenemos `settings.business_name` y un teléfono de contacto en `settings`, mostrar:
> *Si tienes problemas para subir el archivo aquí, escribe a {business_name} al WhatsApp donde recibiste este link.*

Ya tenemos `business_name`. Ajustar copy. ~5 minutos.

### Decisión de implementación · 2026-04-30

**Atacando:** copy genérico que no le da al cliente una vía concreta
de acción si el upload falla.

**RULES:** ✅ todos n/a. Solo cambia copy.

**Alcance:** [checkout-form.tsx](../../src/components/shop/checkout-form.tsx)
recibe `settings: Settings` por prop. `settings.business_name` existe.
Reemplazar el texto genérico por uno que mencione el nombre del
restaurante y refiera al WhatsApp donde recibió el link (no
necesitamos un teléfono nuevo — el cliente YA está conectado por ese
canal).

---

## Histórico de findings cerrados

(Vacío por ahora.)
