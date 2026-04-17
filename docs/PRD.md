# PRD — Pizza Demo

> Sistema operativo para pizzería familiar: WhatsApp → catálogo web → pedido estructurado → panel de cocina → domiciliarios propios. **Chiquito, barato, útil desde el día 30.**

**Versión:** 2.0 (redimensionada)
**Estado:** Listo para construir
**Última actualización:** 2026-04-16
**Owner:** backend@codecraftdev.com

---

## 1. Resumen ejecutivo

El restaurante vende 100% por WhatsApp y **tiene sus propios domiciliarios**. Funciona, pero pierde pedidos en el chat, responde 30+ veces al día "¿ya viene?", y nadie sabe qué hay en cocina vs en camino.

**No cambiamos cómo vende.** Construimos una capa mínima detrás de WhatsApp:
1. El cliente llega por WhatsApp y recibe un link al catálogo.
2. El pedido se arma en el catálogo web (estructurado, sin texto libre).
3. El pedido aparece en pantalla de cocina + **se imprime en ticketera**.
4. El domiciliario ve en su móvil qué pedido llevar.
5. Los cambios de estado disparan avisos automáticos por WhatsApp.

**Sin sobredimensionar:** MVP en **4 semanas**, single-tenant (un solo restaurante), infra ~$25.000 COP/mes, sin analytics ni PWA ni IA ni panel super-admin en v1.

**Modelo comercial:** trial de 14 días y mensualidad de **$99.000 COP**. Cobro 100% manual por fuera del software (Google Calendar + WhatsApp + Nequi/Bancolombia + Supabase Studio). Multi-tenant y pasarela llegan cuando aparezca el 2do cliente. Ver §17.

---

## 2. Contexto y dolores reales

| Dolor | Frecuencia | Costo hoy |
|-------|-----------|-----------|
| Pedidos perdidos en el chat | Diario | Plata directa |
| "¿ya viene?" saturando al personal | ~30/día | 2h/día de cajera escribiendo |
| Cocina no sabe qué está pendiente | Constante | Pedidos tarde |
| Domiciliario sale sin claridad de la ruta | Diario | Entregas dobladas, tiempo perdido |
| Cliente reclama antes que el restaurante reaccione | Semanal | Mala reputación |

> **Hipótesis:** no es WhatsApp, es la ausencia de sistema detrás.

---

## 3. Objetivos (medibles, honestos)

**Primera fase (semanas 1-2 del go-live): medir baseline real.** No inventamos targets sin datos.

Métricas que vamos a medir desde el día 1:
- Mensajes salientes por pedido
- % pedidos con error (dirección, producto, pago)
- Diferencia entre ETA y hora real de entrega
- Reclamos/semana por demora
- Tiempo del primer "hola" a confirmación

**Target implícito:** mover cada métrica en la dirección correcta en los primeros 60 días. Los números concretos los ponemos **con datos reales**, no con humo.

### 3.1 No-objetivos (explícitos)

- NO reemplazar WhatsApp
- NO app móvil nativa para cliente ni staff
- NO integración con Rappi/Didi Food
- NO inventario ni costos ni contabilidad
- NO IA conversacional (v2)
- NO tracking GPS del domiciliario (v2)
- NO multi-sucursal
- NO programa de fidelización

---

## 4. Personas

| Rol | Dispositivo | Dolor principal |
|-----|-------------|-----------------|
| **Admin / Dueño** | Desktop o laptop | No ve el negocio, decide a ciegas |
| **Cajero/operador** | Tablet o laptop en mostrador | Escribe 100 mensajes al día |
| **Cocinero** | Tablet en cocina **+ ticket impreso** | No sabe qué hacer primero |
| **Domiciliario (propio)** | Móvil personal | Sale sin ruta clara, vuelve a preguntar |
| **Cliente final** | WhatsApp + link al catálogo móvil | Escribe pedido, pregunta mil veces el estado |

> **Autenticación:**
> - Admin, cajero, cocinero, domiciliario → login con magic link de Supabase
> - Cliente final → **nunca** inicia sesión, se identifica por teléfono

---

## 5. Alcance v1 (MVP — lo que SÍ se construye)

Solo 7 funcionalidades. Cada una responde a un dolor concreto.

### F1 — Saludo por WhatsApp + link al catálogo
Cliente escribe cualquier cosa al WhatsApp del restaurante. El bot:
1. Busca el teléfono en la DB
2. Genera un link firmado (HMAC, expira 30 min, un solo uso)
3. Responde con plantilla aprobada:

> *"¡Hola [nombre]! 🍕 Aquí está nuestro menú: https://.../pedir/<token>. El link es solo para ti."*

Si el mensaje es ambiguo (audio, foto manuscrita, texto raro), el bot envía el link **igual** y pone una alerta en el panel del cajero: *"Cliente envió audio, revisar manualmente."*

### F2 — Catálogo web público
Ruta `/pedir/[token]`:
- Sin login, sin password
- Categorías + productos con foto, descripción y **precios por tamaño**:
  - Personal, Pequeña, Mediana, Grande, Familiar (5 tamaños con precios distintos)
  - **Regla visible:** "A partir de Pequeña puedes elegir hasta 2 sabores (mitad y mitad)"
- Carrito persistente (localStorage)
- **Dirección estructurada** (formato Colombia):
  - Calle/Carrera + número (ej: "Cll 63b # 105-95")
  - Conjunto / edificio (opcional)
  - Torre (opcional)
  - Apartamento / casa (opcional)
  - Referencias / indicaciones
  - Barrio / zona (para cálculo de zona)
- **Método de pago en el checkout:**
  - Efectivo
  - Bancolombia (transferencia)
  - Nequi (por código)
  - Llave (pago digital)
- **Si NO es efectivo → comprobante de pago obligatorio** (2 caminos aceptados, híbrido):
  - **A)** Upload directo de imagen en el mismo checkout (queda asociado al pedido automáticamente)
  - **B)** Enviarlo después por WhatsApp: el bot detecta la imagen y la asocia al último pedido pendiente de ese teléfono
  - En el checkout se muestra: *"Sube tu comprobante aquí **o** envíalo por WhatsApp al [número]."*
- **Políticas fijas visibles** en el checkout:
  - *"Una vez finalizado, tu pedido no admite cambios."*
  - *"Cada pizza incluye una lechera y una bolsita de condimentos."*
  - *"El valor del domicilio ya está incluido en el precio."*
- Checkout en un paso:
  - **Cliente nuevo:** nombre + dirección estructurada + método de pago (+ comprobante si aplica)
  - **Cliente recurrente:** datos autocompletados, selector de direcciones guardadas, solo confirma o edita
- Mobile-first, Tailwind v4

### F3 — Panel único de pedidos (cajero + cocina comparten)
Lista en tiempo real (Supabase Realtime) con filtro por estado. **El cajero y la cocina usan el mismo panel** — el ticket impreso ya resuelve la lectura en cocina, no hace falta una vista aparte.

- **Nuevo → Esperando pago → Pago aprobado → En preparación → Listo → En camino → Entregado**
- Cada pedido muestra: cliente, productos con tamaño/sabores, dirección completa, hora, ETA, método de pago
- Si es transferencia/Nequi/Llave → miniatura del comprobante y botón **"Aprobar pago"**
- Si es efectivo → el pedido salta directo de `new` a `preparing` al confirmarse
- Botones grandes para cambiar estado
- Alerta visual (badge rojo) si superó el ETA por más de 10 min
- Si más adelante piden pantalla dedicada de cocina, se agrega en v1.1 (~1 día)

### F4 — Ticket impreso en cocina
Cada pedido nuevo **se imprime automáticamente** en la ticketera de cocina:
- Productos, modificadores, notas del cliente
- Número de pedido + hora
- Dirección (para el domiciliario)

Implementación: impresora térmica compatible con **ESC/POS vía red** o **QZ Tray / PrintNode** desde el panel.

### F5 — Vista móvil del domiciliario
Ruta `/mensajero` (login propio, rol `driver`):
- Lista de pedidos **asignados a él**, en orden
- Por cada pedido: dirección + botón `Ver en Google Maps`
- Dos botones: **"Salgo"** y **"Entregado"**
- Cada botón dispara notificación automática al cliente

### F6 — Notificaciones automáticas por cambio de estado
Cada transición del panel → plantilla aprobada de WhatsApp:

| Cambio | Mensaje al cliente |
|--------|--------------------|
| (checkout con transferencia) | *"Recibimos tu comprobante, lo estamos validando 💳"* |
| awaiting_payment → payment_approved | *"Pago aprobado ✅ Arrancamos tu pedido 🍕"* |
| new/payment_approved → preparing | *"Tu pedido está en preparación 🍕"* |
| preparing → ready | *"Tu pedido está listo, sale en minutos."* |
| ready → on_the_way | *"Tu pedido está en camino 🚗"* |
| on_the_way → delivered | *"Entregado ✅ ¡Gracias por preferirnos!"* |

El staff **no escribe mensajes**, solo toca botones.

### F7 — Respuesta automática a "¿ya viene?"
Si el cliente escribe "ya?", "¿cuánto falta?", "¿viene?" → bot busca el último pedido activo del teléfono y responde:

> *"Tu pedido está [estado]. Llega en ~[minutos] min 🍕"*

Si no tiene pedido activo, responde con el link al catálogo.

### F8 — Alerta proactiva de retraso (subida a MVP)
**Escenario real del restaurante:** cliente confirma a las 19:11, ETA 40 min, y a las 20:17 tuvo que preguntar él si "pasó algo con el domicilio". Esto es exactamente lo que evitamos.

Cron en Postgres (`pg_cron`) cada 2 minutos revisa pedidos activos:

- Si `eta_at + 10 min < now()` y el pedido **no está en `delivered` ni `cancelled`**:
  1. Marca `orders.delayed = true` → badge rojo en el panel
  2. Envía plantilla automática al cliente:
     > *"Disculpa la demora 🙏 Tu pedido está tomando un poco más, ya va saliendo."*
  3. Solo se dispara **una vez** por pedido (flag `delay_notified_at`)

> **Regla clave:** el cliente se entera ANTES de tener que preguntar. Esa es la diferencia.

### F9 — Validación manual de comprobante de pago (híbrido)
El comprobante puede llegar por **dos caminos**, el sistema los unifica:

**Camino A — Upload en el checkout**
- Al confirmar el pedido, el archivo sube a Supabase Storage
- El pedido entra al panel en `awaiting_payment` con miniatura lista

**Camino B — Envío por WhatsApp**
- Cliente confirma el pedido sin subir comprobante
- Bot responde: *"Envíame tu comprobante por este chat 📸"*
- El pedido entra en `awaiting_payment` con flag `needs_proof=true`
- Cuando llega la imagen por WhatsApp:
  1. Webhook detecta `type=image` en el mensaje
  2. Descarga la imagen desde Meta y la sube a Storage
  3. Busca el pedido más reciente del teléfono con `needs_proof=true`
  4. La asocia: `payment_proof_url = <url>`, `needs_proof=false`
  5. Notifica al panel por Realtime

**Validación manual (igual en ambos casos):**
1. Cajero ve la miniatura del comprobante en el detalle del pedido
2. Dos botones: **"Aprobar pago"** / **"Rechazar comprobante"**
3. Al aprobar → estado `payment_approved` → WhatsApp automático + ticket imprime
4. Al rechazar → estado `payment_rejected` → WhatsApp automático al cliente pidiendo nuevo comprobante (puede reenviar por cualquiera de los 2 caminos)

---

## 6. Fuera del MVP (se deja documentado, se construye después)

| Feature | ¿Por qué no ahora? |
|---------|-------------------|
| Cálculo dinámico de ETA por carga | V1: ETA fijo por zona. Necesitamos datos reales primero. |
| Analytics / dashboard de métricas | V2: primero los datos se recolectan, después se grafican. |
| PWA, modo offline | V2: solo si el uso lo exige. |
| Parsing de audio/texto libre con IA | V2: sobre WhatsApp Cloud + Whisper si vale la pena. |
| Tracking GPS del domiciliario | V2. |
| Asignación automática de pedidos a domiciliarios | V2 — por ahora, el cajero asigna manual. |
| Session replay, feature flags, A/B | Nunca para este tamaño de negocio. |

---

## 7. Stack tecnológico (mínimo viable)

### 7.1 Core

| Capa | Tecnología | Por qué |
|------|------------|---------|
| Framework | **Next.js 16** (App Router) | Ya instalado, RSC + Server Actions |
| Lenguaje | TypeScript + React 19 | Ya instalado |
| Package manager | **Bun** | Ya instalado (`bun.lock`) |
| Backend/DB/Auth/Realtime | **Supabase** | Free tier cubre el MVP |
| Estilos | **Tailwind v4 (exclusivo)** | Ya instalado. Sin CSS-in-JS ni CSS Modules |
| Hosting | **Vercel Hobby (free)** | Gratis hasta cierto tráfico |
| WhatsApp | **WhatsApp Cloud API (Meta)** | Oficial, free hasta 1k conversaciones/mes |

### 7.2 Librerías a agregar (solo lo esencial)

```bash
# Supabase + validación
bun add @supabase/supabase-js @supabase/ssr zod

# UI mínima
bun add lucide-react sonner clsx tailwind-merge class-variance-authority
bunx shadcn@latest init

# Formularios
bun add react-hook-form @hookform/resolvers

# Dev
bun add -d vitest @playwright/test
```

**Eso es todo.** No agregamos:
- ❌ Zustand (el estado de filtros cabe en URL params)
- ❌ TanStack Query (RSC + Realtime lo resuelven)
- ❌ Drizzle (el client de Supabase alcanza)
- ❌ PostHog (Vercel Analytics free si hace falta)
- ❌ Inngest, Trigger.dev (pg_cron para las 2 tareas programadas)
- ❌ Upstash Redis (rate limiting: suficiente con límites del Route Handler)
- ❌ Sentry en v1 (logs de Vercel + Supabase bastan al principio; agregar si hay bugs difíciles)
- ❌ Biome (ESLint ya está, no cambiar lo que funciona)

### 7.3 Integración de impresora

Dos opciones realistas, elegir según la ticketera:

**Opción A — PrintNode (recomendada, $5/mes):**
- Agente en la máquina de cocina
- API HTTP desde el backend
- Funciona con 99% de impresoras térmicas

**Opción B — Impresora de red ESC/POS:**
- Solo si la ticketera tiene IP y está en la misma red Wi-Fi
- Gratis pero frágil (Wi-Fi se cae = no imprime)

Decisión a validar la **primera semana** viendo qué ticketera tiene el restaurante.

---

## 8. Costos estimados (mensual, USD)

| Concepto | Plan | Costo |
|----------|------|-------|
| Vercel | Hobby (free) | $0 |
| Supabase | Free tier | $0 |
| Dominio | `.com` anual | ~$1/mes |
| WhatsApp Cloud API | 1k conversaciones gratis | $0 (si <1k/mes) |
| PrintNode (si aplica) | Básico | $5 |
| **Total mes 1-3** | | **~$6/mes** |

**Cuando haya que subir a planes pagos:**
- Supabase Pro $25/mes (cuando pase tier free, necesite backups diarios, o Storage supere 1 GB por comprobantes)
- Vercel Pro $20/mes (solo si hay mucho tráfico)
- WhatsApp: ~$0.01-0.05 por conversación adicional

**Techo realista a 1000 pedidos/mes:** ~$50/mes.

**Storage de comprobantes estimado:**
- Comprobante promedio: ~200 KB
- 1000 pedidos/mes × 60% transferencia × 200 KB ≈ 120 MB/mes
- Con política de retención a 90 días → ~360 MB máx (cabe en free tier, pero monitorear)

---

## 9. Arquitectura

### 9.1 Diagrama

```
┌───────────┐         ┌─────────────────────────────────────┐
│  Cliente  │         │         Vercel (Next.js 16)         │
│ WhatsApp  │         │                                     │
└─────┬─────┘         │  ┌──────────────┐  ┌─────────────┐  │
      │               │  │ /pedir/[tok] │  │  Dashboard  │  │
      │               │  │ (público)    │  │  (staff)    │  │
      ▼               │  └──────┬───────┘  └──────┬──────┘  │
┌──────────────┐      │         │                 │          │
│ WhatsApp     │──────▶  ┌──────▼─────────────────▼──────┐  │
│ Cloud API    │webhook│ │ Server Actions + Route Handler│  │
└──────┬───────┘      │  └──────────────┬────────────────┘  │
       │              └─────────────────┼─────────────────────┘
       │                                │
       │         ┌──────────────────────▼──────────────────┐
       │         │              Supabase                    │
       │         │  Postgres + Auth + Realtime + pg_cron    │
       │         └──────────────────────┬──────────────────┘
       │                                │
       │         ┌──────────────────────▼──────────────────┐
       ◀─plantilla│   Notificación WhatsApp (salida)        │
                 └──────────────────────────────────────────┘

                 ┌──────────────────────┐
                 │ PrintNode (opcional) │◀─── nueva orden
                 │ → Ticket impreso     │
                 └──────────────────────┘
```

### 9.2 Flujo de un pedido

```
 1. Cliente → "hola" al WhatsApp
 2. Webhook:
    - busca/crea customer por teléfono
    - genera token firmado (30 min, one-time)
    - responde con link al catálogo
 3. Cliente abre /pedir/[token] en el móvil
    - servidor valida token, resuelve customer
    - autocompleta si es recurrente
 4. Cliente arma carrito (productos + tamaño + sabores)
    llena dirección estructurada, elige método de pago
    si NO es efectivo → sube comprobante AQUÍ
    (o lo deja para mandarlo por WhatsApp después)
    acepta políticas, confirma checkout

 4.b (opcional) Si no subió comprobante en el checkout:
    - el pedido queda con needs_proof=true
    - bot le pide el comprobante por WhatsApp
    - cuando cliente manda la imagen, webhook:
      · descarga desde Meta, sube a Storage
      · la asocia al pedido pendiente de ese teléfono
      · la muestra en el panel
 5. Server Action:
    - valida con Zod (incluyendo comprobante si aplica)
    - INSERT orders + order_items + sube comprobante a Storage
    - invalida token
    - calcula ETA fijo (por zona)
    - estado inicial:
        · efectivo        → status='preparing' (salta validación)
        · transferencia   → status='awaiting_payment'
    - si preparing: llama PrintNode → imprime ticket
    - trigger realtime → panel actualizado
 6. (Si awaiting_payment) Cajero revisa comprobante:
    - "Aprobar pago" → status='payment_approved'
      → imprime ticket, notifica al cliente
    - "Rechazar"    → status='payment_rejected'
      → pide nuevo comprobante al cliente
 7. Cocina toca "Listo" cuando está hecho
 8. Cajero asigna domiciliario desde el panel
 9. Domiciliario en /mensajero ve el pedido, toca "Salgo"
    → cliente recibe "En camino 🚗"
10. Domiciliario entrega, toca "Entregado"
    → cliente recibe "Entregado ✅"

--- EN PARALELO ---
pg_cron (cada 2 min):
  Para cada pedido activo con eta_at + 10min < now():
    - UPDATE delayed=true, delay_notified_at=now()
    - envía plantilla "Disculpa la demora..."
    - badge rojo en el panel
```

### 9.3 Modelo de datos

```sql
-- =====================================================
-- SINGLE-TENANT en v1. Un solo restaurante.
-- Cuando aparezca el 2do cliente, se agrega tenant_id
-- con un script de migración. Ver §17.3.
-- =====================================================

-- Clientes finales del restaurante (sin auth, phone = clave)
customers (
  id uuid PRIMARY KEY,
  phone text UNIQUE NOT NULL,      -- E.164
  name text,
  default_address_id uuid,
  last_order_at timestamptz,
  created_at timestamptz DEFAULT now()
)

-- Dirección ESTRUCTURADA (formato Colombia)
addresses (
  id uuid PRIMARY KEY,
  customer_id uuid REFERENCES customers,
  street text NOT NULL,            -- "Cll 63b # 105-95"
  complex_name text,               -- "Cantares"
  tower text,                      -- "Torre 10"
  apartment text,                  -- "Apto 203"
  neighborhood text,               -- barrio
  references text,                 -- indicaciones extra
  zone text,                       -- para ETA y costo por zona
  created_at timestamptz DEFAULT now()
)

-- Catálogo: producto base (pizza, bebida, etc.)
products (
  id uuid PRIMARY KEY,
  name text NOT NULL,              -- "Hawaiana"
  category text,                   -- "pizza" | "bebida" | "adicional"
  description text,
  image_url text,
  active boolean DEFAULT true,
  max_flavors int DEFAULT 1,       -- cuántos sabores admite (para mitad y mitad)
  min_size_for_multiflavor text    -- "pequena" (a partir de qué tamaño)
)

-- Precio por tamaño (5 tamaños)
product_sizes (
  id uuid PRIMARY KEY,
  product_id uuid REFERENCES products,
  size text NOT NULL,              -- personal | pequena | mediana | grande | familiar
  price_cents int NOT NULL,
  UNIQUE(product_id, size)
)

-- Pedidos
orders (
  id uuid PRIMARY KEY,
  customer_id uuid REFERENCES customers,
  address_id uuid REFERENCES addresses,
  status text NOT NULL,
  -- new | awaiting_payment | payment_approved | payment_rejected
  -- | preparing | ready | on_the_way | delivered | cancelled
  total_cents int NOT NULL,
  payment_method text NOT NULL,    -- cash | bancolombia | nequi | llave
  payment_proof_url text,          -- Supabase Storage (si no es efectivo)
  needs_proof boolean DEFAULT false, -- true si falta y se espera por WhatsApp
  payment_approved_at timestamptz,
  eta_at timestamptz,
  delayed boolean DEFAULT false,
  delay_notified_at timestamptz,   -- para no notificar 2 veces
  driver_id uuid REFERENCES profiles,
  notes text,                      -- notas libres del cliente
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz
)

order_items (
  id uuid PRIMARY KEY,
  order_id uuid REFERENCES orders,
  product_id uuid REFERENCES products,
  size text NOT NULL,              -- tamaño elegido
  qty int NOT NULL,
  unit_price_cents int NOT NULL,
  flavors text[],                  -- ["pepperoni", "mexicana"] para mitad y mitad
  notes text                       -- notas por item
)

-- Tokens de acceso al catálogo (passwordless)
order_tokens (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
)

-- Staff (admin, cashier, kitchen, driver)
profiles (
  id uuid PRIMARY KEY REFERENCES auth.users,
  role text NOT NULL,              -- admin|cashier|kitchen|driver
  display_name text,
  active boolean DEFAULT true
)

-- Auditoría de estados (incluye transiciones de pago)
order_status_events (
  id uuid PRIMARY KEY,
  order_id uuid REFERENCES orders,
  from_status text,
  to_status text,
  actor_id uuid,                   -- null si fue el sistema (cron, cliente)
  created_at timestamptz DEFAULT now()
)

-- Configuración general del restaurante (1 fila)
settings (
  id uuid PRIMARY KEY,
  business_name text NOT NULL,
  trial_ends_at date,
  paid_until date,                 -- tú actualizas esto cada mes tras recibir pago
  delivery_zones jsonb,            -- [{zone:"A", eta_min:30}, ...]
  payment_accounts jsonb,          -- {nequi:"3xx", bancolombia:"xxx", llave:"..."}
  updated_at timestamptz DEFAULT now()
)

-- Supabase Storage bucket: "payment-proofs" (privado, solo staff)
```

### 9.4 Estados del pedido

```
Flujo EFECTIVO:
new ─────────────────────▶ preparing → ready → on_the_way → delivered

Flujo TRANSFERENCIA / NEQUI / LLAVE:
new → awaiting_payment ──▶ payment_approved → preparing → ready → on_the_way → delivered
              ↘ payment_rejected  (cliente reintenta)

En cualquier punto activo → cancelled

Flag paralelo:
delayed=true  (lo pone pg_cron si ETA + 10min < now)
```

---

## 10. Estructura del proyecto

```
pizza-demo/
├── app/
│   ├── (shop)/                           # Público, sin login
│   │   └── pedir/[token]/
│   │       ├── page.tsx                  # Catálogo + checkout
│   │       └── gracias/page.tsx
│   ├── (dashboard)/                      # Staff del restaurante
│   │   ├── layout.tsx                    # Guard por rol
│   │   ├── pedidos/page.tsx              # Lista operador (única vista)
│   │   ├── mensajero/page.tsx            # Vista domiciliario
│   │   ├── menu/page.tsx                 # CRUD productos
│   │   └── settings/page.tsx
│   ├── login/page.tsx                    # Solo staff
│   ├── api/
│   │   ├── webhooks/whatsapp/route.ts    # Recibe mensajes Y comprobantes (imágenes)
│   │   └── print/[orderId]/route.ts      # Dispara PrintNode
│   ├── layout.tsx
│   └── page.tsx
│
├── src/
│   ├── components/
│   │   ├── ui/                           # shadcn/ui
│   │   └── shared/
│   ├── features/
│   │   ├── orders/                       # actions, queries, schemas, state-machine
│   │   ├── catalog/                      # productos, tamaños, reglas de sabores
│   │   ├── whatsapp/                     # greet, sender, templates, verify-signature
│   │   ├── order-tokens/                 # sign, verify
│   │   ├── payments/                     # upload comprobante, validar, estados
│   │   ├── delay-alerts/                 # lógica que corre desde pg_cron
│   │   └── printing/                     # printnode client
│   ├── lib/
│   │   ├── supabase/                     # client, server, admin
│   │   ├── env.ts                        # Zod validated
│   │   └── utils.ts
│   └── config/
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
│
├── docs/
│   └── PRD.md
│
└── package.json
```

---

## 11. Diseño responsive (mobile-first)

Todo el diseño **100% con Tailwind v4**. Sin CSS-in-JS.

| Vista | Móvil (base) | Tablet (md) | Desktop (lg+) |
|-------|--------------|-------------|---------------|
| Catálogo `/pedir` | **Principal** (95% del tráfico) | Bien | Bien |
| Panel `/pedidos` | Lista scroll vertical | 2 columnas | Lista completa + sidebar |
| `/cocina` | Cards grandes, apiladas | Grid 2 cols | Grid 3 cols, tipografía XL |
| `/mensajero` | **Principal** | — | — |
| `/menu` (admin) | Formulario apilado | 2 cols | Editor completo |

**Reglas clave:**
- Touch targets ≥ 44×44px
- Mobile-first siempre (`text-base md:text-lg`)
- Sin hover como única señal
- Safe areas iOS para `/mensajero`
- shadcn/ui + cva para variantes
- `tailwind-merge` para combinar clases

---

## 12. Seguridad

| Área | Cómo |
|------|------|
| Staff login | Supabase Auth magic link |
| Cliente identidad | Teléfono (E.164), sin password |
| Link del catálogo | Token HMAC firmado, expira 30 min, one-time |
| Webhook WhatsApp | Validación `X-Hub-Signature-256` |
| Autorización DB | RLS: solo staff autenticado ve `orders`, `customers`, etc. |
| Comprobantes de pago | Supabase Storage bucket privado `payment-proofs`, acceso solo staff (policy RLS) |
| Secretos | `.env.local`, `SUPABASE_SERVICE_ROLE_KEY` solo en server |
| Rate limit | Límite simple en Route Handler por IP (no Redis todavía) |
| Validación de upload | Solo imágenes (jpg/png/webp), máx 5 MB, escaneado MIME-type |

---

## 13. Plan de entrega (4 semanas)

### Semana 1 — Fundaciones + trámite WhatsApp
- **Iniciar trámite WhatsApp Business + verificación Meta (día 1, sin falta)**
- Aprobar plantillas salientes (saludo, estados, "en camino")
- Setup Supabase: schema single-tenant + RLS + auth
- Seed de `settings` con `trial_ends_at`, `paid_until`, zonas, cuentas de pago
- Layout base con Tailwind + shadcn
- Login de staff funcionando

### Semana 2 — Catálogo + pedido
- CRUD de productos + tamaños + reglas de sabores (admin)
- Ruta pública `/pedir/[token]`
- Generación y validación de tokens
- Formulario de dirección estructurada (Colombia)
- Selector de método de pago (efectivo / Bancolombia / Nequi / Llave)
- Upload de comprobante a Supabase Storage
- Checkout + INSERT con estados condicionales (efectivo vs transferencia)
- Autocompletado por teléfono + selector de direcciones

### Semana 3 — Panel + pago + domiciliarios + impresión
- Panel único `/pedidos` con Realtime (incluye `awaiting_payment`)
- Validación de comprobante (aprobar/rechazar con miniatura)
- Vista `/mensajero` mobile
- Integración PrintNode (o ESC/POS según impresora)
- Botones de estado con plantillas automáticas
- Banner de "plan vencido" cuando `paid_until < today`

### Semana 4 — WhatsApp end-to-end + alertas + piloto
- Webhook de entrada (saludo + link)
- **Webhook de entrada para imágenes** (asocia comprobante al pedido pendiente del teléfono)
- Intent "¿ya viene?"
- Plantillas salientes en cada cambio de estado (incluye pago aprobado/rechazado)
- Asignación manual de domiciliarios
- **pg_cron de alertas de retraso (F8)** con plantilla proactiva
- Pruebas con 10-20 pedidos reales
- Capacitación del staff (1 hora por rol)
- **Go-live + inicio del trial de 14 días**

---

## 14. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Aprobación de WhatsApp Business tarda | Alto | Arrancar el trámite **día 1** |
| Cliente mayor no abre el link | Medio | Cajero ve alerta en panel y atiende manual |
| Ticketera incompatible | Medio | Validar modelo en semana 1 |
| Staff mayor no se adapta al panel | Alto | UI con botones grandes, capacitación corta |
| Plantillas de WhatsApp rechazadas | Medio | Tener versiones alternativas, texto simple |
| **Comprobante de pago falso / editado** | Medio | Cajero valida manualmente; en v2 integración bancaria para validar transferencia automática |
| **Número actual de WhatsApp ya tiene historial y respuestas automáticas configuradas** | Medio | Decidir en sem 1: migrar al nuevo número Business o portar el actual |
| Caída de Supabase free tier | Bajo | Upgrade a Pro si pasa 500 MB o storage alto por comprobantes |
| Storage lleno por comprobantes | Medio | Job mensual que archive/elimine comprobantes > 90 días |
| Dependencia del desarrollador | Alto | README claro + handoff documentado al cierre del MVP |

---

## 15. Métricas (medir desde día 1)

- Pedidos/día
- Mensajes manuales del staff/día (baseline manual la semana 1)
- Diferencia ETA vs entrega real (registrado en DB automáticamente)
- Reclamos/semana (registro manual del cajero)
- Tasa de uso del link (`clicked` / `sent`)
- % pedidos con datos autocompletados (indica reconocimiento funciona)

Sin dashboard fancy: una vista `/admin/metricas` con 6 números grandes.

---

## 16. Qué decidimos y qué queda abierto

### Decidido
- Stack: Next.js 16 + Supabase + Tailwind v4 + shadcn/ui
- Sin Zustand, TanStack Query, Drizzle, PostHog, Sentry en v1
- Ticket impreso desde día 1
- Domiciliarios propios con vista móvil dedicada
- Cliente sin login, identidad por teléfono
- Catálogo web es la vía principal (texto libre → alerta al cajero para manual)
- Métodos de pago: **efectivo / Bancolombia / Nequi / Llave** (con comprobante obligatorio si no es efectivo)
- 5 tamaños de pizza: Personal, Pequeña, Mediana, Grande, Familiar
- Regla: "mitad y mitad" disponible desde tamaño Pequeña
- Domicilio **incluido en el precio**, no se cobra aparte
- Alerta proactiva de retraso a los 10 min de pasado el ETA
- Políticas fijas visibles en checkout (sin cambios, lechera+condimentos incluidos)
- **Single-tenant en v1** (un solo restaurante). Multi-tenant se agrega cuando aparezca el 2do cliente.
- Mensualidad **$99.000 COP** con trial de 14 días
- **Sin pasarela de pagos** en v1 (cobro manual por Nequi/Bancolombia + comprobante)
- Comprobante del cliente al restaurante: **híbrido** (upload en web o por WhatsApp)
- **Sin panel super-admin en v1**: cobro mensual se gestiona por fuera (Google Calendar + Supabase Studio)
- **Sin vista cocina dedicada en v1**: el ticket impreso cubre la necesidad

### Abierto (decidir en semana 1)
- [ ] Modelo exacto de ticketera del restaurante → decide PrintNode vs ESC/POS directo
- [ ] Número de WhatsApp Business a usar (nuevo o el actual `604 322 46 76`)
- [ ] Cobertura de zonas de entrega y sus ETAs base (ej: zona A = 30 min, zona B = 45 min)
- [ ] Catálogo inicial de productos, precios por tamaño y fotos (necesitamos el menú digitalizado)
- [ ] Datos de Bancolombia, Nequi y Llave para mostrar en el checkout

---

## 17. Modelo comercial (simple, sin panel, sin pasarela)

### 17.1 Propuesta al cliente

- **Setup gratis** — el desarrollador monta, configura y capacita
- **Trial 14 días** desde el go-live, sin tarjeta
- **Mensualidad $99.000 COP** después del trial
- **Cancelable en cualquier momento** con export de datos

### 17.2 Cobro 100% manual (fuera del software)

**No hay pasarela, no hay panel super-admin, no hay pg_cron de cobros.** Con un solo cliente es innecesario.

**Flujo mensual (todo por fuera de la app):**

```
Día 1 del mes  →  Evento en Google Calendar te recuerda
                  Envías WhatsApp al dueño:
                  "Hola, tu mensualidad $99.000. Nequi 3xx o Bancolombia xxx"

Cliente paga   →  Te manda screenshot por WhatsApp

Tú            →  Guardas el comprobante en una carpeta de Drive/Notion
                  Generas factura electrónica desde Alegra/Siigo
                  Listo
```

**Control del trial y vencimiento:**
- Un campo simple en una tabla `settings` del restaurante con `trial_ends_at` y `paid_until`
- El layout del dashboard lee ese campo. Si `paid_until < today`, muestra banner "Tu plan venció, contacta soporte"
- Tú actualizas esa fila manualmente en Supabase Studio cuando recibas el pago

### 17.3 Cuándo migrar a SaaS multi-tenant

Cuando aparezca el **2do cliente**. Ahí vale la pena:

1. Agregar tabla `tenants`
2. Agregar `tenant_id` a las tablas operativas (script de migración 1 día)
3. Construir el panel `/super-admin` (2-3 días)
4. Automatizar cobros con pg_cron (1 día)
5. Considerar pasarela (Wompi/Bold) cuando lleguen a 15+ clientes

**Mientras tanto:** Google Calendar + WhatsApp + Supabase Studio es suficiente.

### 17.4 Responsabilidades

| Responsabilidad | Quién |
|-----------------|-------|
| Infraestructura (Vercel, Supabase, dominio, PrintNode) | **Desarrollador** (a cambio de la mensualidad) |
| Cuenta de WhatsApp Business + verificación Meta | **Cliente** (va a su nombre) |
| Catálogo, precios, datos de pago (Nequi/Bancolombia) | **Cliente** |
| Soporte y actualizaciones | **Desarrollador** |
| Datos del negocio (pedidos, clientes finales) | **Cliente** (export disponible) |

### 17.5 Matemática por cliente

```
Ingreso:         $99.000 COP/mes
Infra:          -$25.000 COP/mes
Soporte (~10min): -$10.000 COP/mes
────────────────────────────────
Margen limpio:   ~$64.000 COP/mes
```

### 17.6 Legal/tributario (Colombia)

- **RUT** con actividad CIIU 6201 (desarrollo de software)
- **Régimen simple tributario** mientras ingresos anuales < 3.500 UVT
- **Facturación electrónica DIAN** con Alegra o Siigo (se genera al recibir pago)
- **Retención en la fuente** aplicable si el cliente es gran contribuyente

### 17.7 Si el cliente cancela

1. Se marca `paid_until` pasado, se deshabilita el acceso operativo pero se mantiene lectura 30 días
2. Se exporta todo (pedidos, clientes, catálogo) en CSV/JSON a petición
3. A los 90 días de cancelado, borrado según política

---

## 18. Insight final

> El problema nunca fue WhatsApp.
> Es la falta de un sistema operativo detrás.
>
> Este producto **no** reemplaza cómo venden hoy.
> Convierte el caos en control con la infra mínima necesaria.
>
> **Primero funcional, después bonito, después sofisticado.**
