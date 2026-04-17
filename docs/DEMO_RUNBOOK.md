# Demo Runbook — Probar Pizza Demo end-to-end

> Guía paso a paso para probar todo el flujo del MVP contra la deploy de producción. Úsalo para tu propio ensayo antes de mostrar al cliente, o para onboardear a otro dev.
>
> **URL de producción:** https://pizza-demo-five.vercel.app
> **Supabase project ref:** `oqkhzqgvofqkjbgreoli`

---

## Setup desde cero en máquina nueva (solo una vez, ~15 min)

Si estás en una máquina donde NUNCA has trabajado el proyecto:

```bash
# 1. Git (ya viene con Xcode tools en macOS)
xcode-select --install

# 2. Bun
curl -fsSL https://bun.sh/install | bash
# Abre una terminal NUEVA para que Bun cargue, luego verifica:
bun --version

# 3. Vercel CLI (para bajar env vars)
bun add -g vercel

# 4. (Opcional pero recomendado) SSH para GitHub sin contraseña
ssh-keygen -t ed25519 -C "tu-email@personal.com"
# Enter/Enter/Enter (sin passphrase)
cat ~/.ssh/id_ed25519.pub | pbcopy
# GitHub → Settings → SSH and GPG keys → New SSH key → pega
```

Luego, en la carpeta donde quieras el proyecto:

```bash
# 5. Clone
git clone git@github.com:rafaelSantos43/pizza-demo.git
cd pizza-demo

# 6. Instalar dependencias
bun i

# 7. Traer env vars reales desde Vercel
vercel login            # abre browser, autorizas
vercel link             # selecciona el proyecto pizza-demo
vercel env pull .env.local
```

**Importante:** tras `vercel env pull`, edita la primera línea de `.env.local`:

```
NEXT_PUBLIC_APP_URL=https://pizza-demo-five.vercel.app
```

Déjalo así **si vas a probar todo contra producción** (scripts generan links de prod, no necesitas `bun run dev`).

Si vas a seguir **desarrollando features** en local, cámbialo a `http://localhost:3000` y corre `bun run dev` en una terminal aparte.

Los scripts en `scripts/gen-*.ts` leen las keys de `.env.local` para generar links firmados. Sin esas env vars no funcionan.

---

## Pre-requisitos rápidos (si ya tienes la máquina configurada)

Antes de cualquier test:

```bash
cd ~/Desktop/pizza-demo    # o donde lo tengas
git pull                   # por si hay cambios nuevos
bun i                      # por si agregaron deps
```

---

## Roles y URLs

| Rol | URL principal | Para qué |
|-----|---------------|----------|
| Cliente final | `/pedir/<token>` | Arma pedido |
| Admin / cajero / cocina | `/pedidos` | Gestiona pedidos entrantes, aprueba pagos, transiciona estados, asigna domiciliario |
| Admin | `/menu` | CRUD del catálogo |
| Domiciliario | `/mensajero` | Ve solo sus pedidos asignados, marca "Salgo" / "Entregado" |

---

## Test end-to-end completo (20 min)

### Paso 1 — Entrar como admin

Si ya estás logueado y tu profile existe, abre https://pizza-demo-five.vercel.app/pedidos. Si te redirige a `/login` → refresca sesión con:

```bash
NEXT_PUBLIC_APP_URL=https://pizza-demo-five.vercel.app bun scripts/gen-login-link.ts TU-EMAIL@real.com
```

Pega la URL que imprime en el browser → llegas al panel.

### Paso 2 — Crear un usuario driver de prueba (una vez)

```bash
NEXT_PUBLIC_APP_URL=https://pizza-demo-five.vercel.app bun scripts/gen-login-link.ts driver1@test.local
```

Copia la URL. Luego en Supabase Studio → SQL Editor:

```sql
insert into profiles (id, role, display_name, active)
select u.id, 'driver', 'Camilo', true
from auth.users u
where u.email = 'driver1@test.local'
on conflict (id) do update
set role = excluded.role, display_name = excluded.display_name, active = excluded.active;
```

Abre la URL del driver en ventana incógnito (Cmd+Shift+N). Queda logueado como "Camilo".

### Paso 3 — Generar link de pedido para un cliente

```bash
NEXT_PUBLIC_APP_URL=https://pizza-demo-five.vercel.app bun scripts/gen-order-link.ts +573001112233 "Rafa"
```

Copia la URL que imprime.

### Paso 4 — Hacer el pedido desde el celular

Pega la URL del paso 3 en tu celular (o en otro tab).

1. Catálogo "Pizza Demo" con 33 pizzas.
2. Prueba los filtros ("Pollo", "Carnes", etc.) — deben filtrar.
3. Prueba la búsqueda — escribe "marinera" → aparece solo esa.
4. Tap una pizza → sheet del builder.
5. Tamaño Familiar → agrega una Marinera como sabor adicional (test mitad-y-mitad).
6. El botón "Agregar" debe mostrar el precio del más caro ($93.000).
7. "Agregar al carrito" → FAB del carrito → "Ir al pago".
8. Llena nombre + dirección + zona → método **Efectivo** (salta el upload) → acepta políticas → Confirmar.
9. Te redirige a `/gracias`.

### Paso 5 — Ver el pedido en el panel admin

En tu browser admin (`/pedidos`), el pedido aparece **automáticamente vía Realtime**. Estado: "En preparación" (efectivo salta directo).

### Paso 6 — Transiciones + asignar driver

1. Tap la card → OrderDetailSheet.
2. "Listo" → estado pasa a `ready`.
3. Abre la card otra vez → dropdown **"Asignar mensajero"** → selecciona "Camilo".
4. Toast confirmación.

### Paso 7 — Vista driver

Ventana incógnito → va a https://pizza-demo-five.vercel.app/mensajero.

1. Aparece la card del pedido con dirección + tap-to-call + Maps + botón "Salgo".
2. Tap "Salgo" → estado pasa a `on_the_way`. En el admin (Realtime) también se actualiza.
3. Tap "Entregado" → confirma → estado `delivered` → card sale del panel.

Si llegas aquí sin errores, **el MVP está validado end-to-end**.

---

## Escenarios alternos de prueba

### Pago con comprobante

En el paso 4.8, en vez de Efectivo elige **Nequi** o **Bancolombia**:
- Se muestra el campo "Comprobante de pago" + las cuentas (por ahora placeholder: Nequi "300 123 4567").
- Sube una foto cualquiera (el sistema comprime client-side si pesa >500 KB).
- Confirma → pedido queda en status `awaiting_payment` con `needs_proof=false`.
- En el panel admin, abre la card → ves thumbnail del comprobante + botones **"Aprobar pago"** / **"Rechazar comprobante"**.
- Aprobar → pasa a `payment_approved` → luego a `preparing`.

### CRUD de menú

En https://pizza-demo-five.vercel.app/menu (admin only):
- Agregar producto nuevo (nombre, categoría, descripción, precios por tamaño).
- Toggle activo/inactivo → desaparece/aparece en el catálogo público al refrescar.
- Editar producto existente.
- "Eliminar" (soft delete — solo marca `active=false`).

### Cambiar zonas de entrega + cuentas de pago

**No hay UI** (por ahora). Se hace en Supabase Studio → SQL Editor:

```sql
update settings
set delivery_zones = '[
  {"zone":"La Campiña","eta_min":25},
  {"zone":"Laureles","eta_min":40},
  {"zone":"El Poblado","eta_min":60}
]'::jsonb,
    payment_accounts = '{
  "nequi":"300 123 4567",
  "bancolombia":"1234 5678 9012",
  "llave":"@pizza-demo"
}'::jsonb
where id = '00000000-0000-0000-0000-000000000001'::uuid;
```

---

## Qué hoy es MANUAL y qué será AUTOMÁTICO en producción real

| Hoy (manual, via script) | Producción futura (automático) | Qué se necesita |
|--------------------------|--------------------------------|-----------------|
| Tú generas login link con `gen-login-link.ts` para cada staff nuevo | Staff entra en `/login`, mete email, recibe magic link por correo | Supabase SMTP real (SendGrid / Postmark, ~15 min setup) o aguantar rate limit 3/hora del SMTP default |
| Tú generas link de pedido con `gen-order-link.ts` y se lo mandas al cliente por WhatsApp personal | Cliente escribe al WhatsApp Business, webhook detecta, genera token, envía link automático | Verificación WhatsApp Cloud API (Meta) — 3-4 semanas de trámite, plantillas aprobadas |
| Staff no recibe notificaciones automáticas al cambiar estado — mensajes hay que escribirlos a mano por WhatsApp | Sistema manda "Pago aprobado ✅", "En camino 🚗", etc. automático en cada transición | Igual que arriba: Meta aprobado + plantillas |
| Si cliente manda foto de comprobante por WhatsApp, no se asocia al pedido — hay que hacerlo a mano | Webhook detecta imagen, la descarga de Meta, la asocia al pedido pendiente del teléfono | Igual que arriba |
| F8 (alerta proactiva de retraso): no corre | pg_cron cada 2 min detecta órdenes con ETA + 10 min vencido, manda "disculpa la demora" | Supabase Pro ($25/mes) habilita pg_cron + Meta aprobado |
| Impresión de ticket en cocina: no existe — staff lee del panel | Cada pedido nuevo dispara PrintNode → ticket sale automático | PrintNode account ($5/mes) + agente instalado en la máquina de la cocina + modelo de impresora real del cliente |
| Zonas, ETAs, nombre del negocio, cuentas de pago: edición solo por SQL en Supabase Studio | UI en `/settings` donde el admin edita todo sin tocar DB | Feature **B1** del checklist — se construye día 1 post-venta |
| Si el cliente (Juan) pide dos veces, la segunda vez llena todo desde cero | Segunda vez: nombre y dirección preautocompletados, selector "usar dirección guardada" | Feature **B5** del checklist — se construye día 1 post-venta |
| Drivers ven `/pedidos` completo | Drivers solo ven `/mensajero`; `/pedidos` restringido a admin/cashier/kitchen | ~3 líneas de código, cuando un cliente real lo pida |
| Pedidos entregados desaparecen, no hay histórico | Vista de histórico/búsqueda/métricas | Alcance se define con el cliente — hoy nada construido |

---

## Deploy y cambios de código

- Push a `main` en GitHub → Vercel auto-deploya en 1-3 min.
- Antes de pushear, corre `bun run build` local para evitar romper prod.
- Vars de entorno se cambian en Vercel dashboard → Settings → Environment Variables. Cambios requieren redeploy.
- DB compartida entre dev local y prod (misma Supabase). Cuidado con cambios destructivos en dev — afectan prod.

---

## Recovery rápido si algo se rompe

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| `/pedidos` siempre redirige a `/login` | Sesión expiró / magic link consumido | Regenerar login link con el script |
| Error `Body exceeded 1 MB` al subir comprobante | (Resuelto) `next.config.ts` tiene `bodySizeLimit: '6mb'` + compresión client-side | Si reaparece, subir el límite más |
| Error `A "use server" file can only export async functions` | Hay un re-export de constante en archivo con `'use server'` | Borrar el re-export, importar direct desde `./schemas` |
| `/pedir/foo` muestra "enlace inválido" | Token malformado o expirado | Generar nuevo con `gen-order-link.ts` (válido 30 min) |
| Magic link de email no llega | Rate limit 3/hora del SMTP default | Usar `gen-login-link.ts` (admin API, sin rate limit) |
| Panel no se actualiza en vivo | Publication de Supabase Realtime no incluye la tabla | Supabase Dashboard → Database → Publications → `supabase_realtime` → activar `orders` |

---

**Última actualización:** 2026-04-17 (tras A5+A6 validados con pedido end-to-end real + flujo multi-rol).

---

## Quick reference — comandos listos para copiar-pegar

Con mis valores concretos ya puestos. Si cambias de email o teléfono, ajusta.

### Regenerar sesión admin (mi cuenta principal)

```bash
NEXT_PUBLIC_APP_URL=https://pizza-demo-five.vercel.app bun scripts/gen-login-link.ts devdesarrollo96@gmail.com
```

### Regenerar sesión driver de prueba (Camilo)

```bash
NEXT_PUBLIC_APP_URL=https://pizza-demo-five.vercel.app bun scripts/gen-login-link.ts driver1@test.local
```

### Generar link de pedido para un cliente

```bash
# Cambia el +57... y el nombre como quieras
NEXT_PUBLIC_APP_URL=https://pizza-demo-five.vercel.app bun scripts/gen-order-link.ts +573001112233 "Cliente"
```

### Rutinas frecuentes

```bash
# Antes de arrancar sesión de trabajo:
git pull
bun i

# Para correr dev local (si vas a tocar código):
bun run dev

# Antes de pushear a prod:
bun run build        # ✓ debe pasar verde antes de hacer push

# Commit + push estándar:
git add .
git commit -m "<descripción corta>"
git push             # Vercel auto-deploya en 1-3 min
```

### Supabase Studio — SQL útil

**Crear profile admin (solo primera vez con email nuevo):**
```sql
insert into profiles (id, role, display_name, active)
select u.id, 'admin', 'Rafael', true
from auth.users u
where u.email = 'devdesarrollo96@gmail.com'
on conflict (id) do update
set role = excluded.role, display_name = excluded.display_name, active = excluded.active;
```

**Crear profile driver (solo primera vez):**
```sql
insert into profiles (id, role, display_name, active)
select u.id, 'driver', 'Camilo', true
from auth.users u
where u.email = 'driver1@test.local'
on conflict (id) do update
set role = excluded.role, display_name = excluded.display_name, active = excluded.active;
```

**Activar Realtime en tablas (solo una vez):**
```sql
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table order_status_events;
```

**Actualizar zonas de entrega y cuentas de pago:**
```sql
update settings
set delivery_zones = '[
  {"zone":"La Campiña","eta_min":25},
  {"zone":"Laureles","eta_min":40},
  {"zone":"El Poblado","eta_min":60}
]'::jsonb,
    payment_accounts = '{
  "nequi":"300 123 4567",
  "bancolombia":"1234 5678 9012",
  "llave":"@pizza-demo"
}'::jsonb
where id = '00000000-0000-0000-0000-000000000001'::uuid;
```

**Ver pedidos viejos (histórico manual, no hay UI aún):**
```sql
select id, status, total_cents, payment_method, created_at, delivered_at
from orders
order by created_at desc
limit 50;
```
