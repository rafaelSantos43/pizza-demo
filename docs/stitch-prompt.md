# Prompt para Google Stitch

> **Cómo usar este archivo:**
> 1. Copia el bloque del prompt principal de abajo y pégalo en [Google Stitch](https://stitch.withgoogle.com/).
> 2. Stitch te generará los diseños (HTML/CSS + Figma-like preview).
> 3. Exporta los diseños (PNG, HTML o el link de Stitch).
> 4. Pásamelos así:
>    - **PNG:** arrastra el archivo al chat
>    - **HTML exportado:** pégalo o guárdalo en `docs/designs/*.html` y dime el nombre
>    - **Link de Stitch:** pega el link y lo abro con WebFetch
>    - **Referencia por archivo:** guarda tus notas/ajustes en `docs/designs/notes.md`

---

## 📋 Prompt principal (copiar-pegar)

```
Diseña la interfaz completa de Pizza Demo, un sistema SaaS
operativo para pizzerías en Colombia. El producto conecta
WhatsApp con un catálogo web y un panel interno para el staff.

── CONTEXTO DE PRODUCTO ──

Tipo: aplicación web responsive (mobile-first)
Mercado: Colombia, español
Usuarios:
  1. Cliente final (móvil, sin login, llega por link de WhatsApp)
  2. Cajero / operador (tablet o laptop en mostrador)
  3. Domiciliario propio (móvil personal, en la calle)
  4. Dueño / admin (laptop)

Canal de venta existente: WhatsApp. No se reemplaza.
Lo que buscamos: un diseño que haga que el staff deje de escribir
mensajes manuales y que el cliente arme su pedido en 60 segundos.

── PANTALLAS A DISEÑAR ──

Públicas (cliente, sin login):
  1. /pedir/[token] — Catálogo + checkout en un scroll
       · hero con logo del restaurante y saludo personalizado
       · grid de productos con foto, nombre, descripción, rango de precio
       · al tocar un producto: bottom sheet / modal con:
           · selector de tamaño (5 pills: Personal, Pequeña, Mediana, Grande, Familiar)
           · selector de sabores (1 sabor en Personal, hasta 2 en Pequeña+)
           · nota: "Mitad y mitad desde la Pequeña"
           · cantidad (+/-)
           · botón "Agregar al carrito"
       · carrito flotante/sticky abajo con total y botón "Ir a pagar"
  2. /pedir/[token]/checkout — Formulario de confirmación
       · sección "Tus datos" (nombre, teléfono ya pre-llenado disabled)
       · sección "Tu dirección" con campos estructurados Colombia:
           · calle/carrera (ej: Cll 63b # 105-95)
           · conjunto (opcional)
           · torre (opcional)
           · apartamento (opcional)
           · barrio
           · referencias
           · selector de direcciones guardadas si es cliente recurrente
       · sección "Pago": 4 opciones visuales grandes:
           · Efectivo / Bancolombia / Nequi / Llave
           · al elegir no-efectivo: aparece área para subir comprobante
             (drag-drop en desktop, tap para tomar foto o galería en móvil)
           · texto: "O envíanos el comprobante por WhatsApp"
       · resumen del pedido con ETA visible ("Llega en ~40 min")
       · políticas fijas en texto pequeño:
           · "Una vez finalizado, tu pedido no admite cambios."
           · "Cada pizza incluye una lechera y una bolsita de condimentos."
           · "El domicilio ya está incluido en el precio."
       · botón grande "Confirmar pedido"
  3. /pedir/[token]/gracias — Confirmación
       · ilustración o ícono de éxito
       · "¡Pedido confirmado! 🍕"
       · número de pedido, ETA, resumen
       · texto: "Te avisaremos por WhatsApp en cada etapa"

Privadas (staff, con login):
  4. /login — Magic link
       · minimalista, input de email, botón "Enviarme el enlace"
       · logo del restaurante
  5. /pedidos — Panel principal (cajero + cocina comparten)
       · header con logo, rol, hora actual
       · tabs horizontales por estado:
           Nuevo · Esperando pago · Listo para preparar · Preparando ·
           Listo · En camino · Entregado
       · lista de tarjetas de pedido con:
           · número (#042), hora de ingreso, cliente, dirección corta
           · items resumidos (ej: "1 Pizza Mediana Mitad Pepperoni/Mexicana")
           · método de pago (ícono)
           · ETA y badge ROJO si está retrasado
           · botón de acción contextual ("Aprobar pago", "Preparar", "Listo", etc.)
       · filtros: fecha, zona, domiciliario
       · FAB para "Nuevo pedido manual" (si el cliente escribió texto libre)
  6. /pedidos/[id] — Detalle del pedido
       · header con estado grande y timeline horizontal de transiciones
       · datos del cliente (teléfono clickeable para WhatsApp)
       · dirección completa con botón "Abrir en Google Maps"
       · lista de items con tamaño, sabores, notas, precio
       · si es transferencia: miniatura del comprobante (zoom al tocar)
         y botones grandes "Aprobar pago" / "Rechazar"
       · selector de domiciliario (si ya está listo)
       · botones grandes para cambiar estado
  7. /mensajero — Vista domiciliario (mobile-first)
       · lista vertical de pedidos asignados a él, ordenados
       · por cada pedido:
           · número + cliente + dirección en grande
           · total a cobrar (si es efectivo) en rojo
           · botón "Ver en Google Maps" (full width)
           · 2 botones grandes stacked: "Salgo" / "Entregado"
       · header con "Hola, [nombre]" y contador de pedidos pendientes
  8. /menu — CRUD de productos (admin)
       · tabla de productos con imagen, nombre, categoría, tamaños,
         precios, activo
       · form lateral/modal para crear/editar con:
           · nombre, categoría, descripción, foto
           · 5 filas para precios por tamaño
           · regla: máx sabores, tamaño mínimo para multi-sabor
  9. /settings — Configuración general
       · nombre del negocio, zonas de entrega con ETA por zona
       · cuentas de pago (Nequi, Bancolombia, Llave) que se muestran al cliente
       · datos de WhatsApp Business
       · horario de atención

Estado visible en layout si plan venció:
  · banner superior rojo claro: "Tu plan venció. Contacta a soporte."
  · botones de acción deshabilitados en modo solo-lectura

── DESIGN LANGUAGE ──

Mood:     cálido, familiar, apetitoso, confiable, moderno sin ser frío.
          No parecerse a fintech ni a dashboard corporativo.
          Se debe sentir "hecho en casa" con tecnología seria.

Paleta:
  · Primary (acción):      rojo tomate cálido #D94F2A (o similar, tono pizza)
  · Secondary:             amarillo maíz #F5B800 (acentos, highlights)
  · Success:               verde #2A9D5F
  · Danger/retraso:        rojo alerta #E53935
  · Neutrales:             escala de grises cálidos (no puros)
                           fondos #FAFAF7, borders #E8E5DE
  · Dark mode:             fondo #1C1A17, cards #26231F (opcional, no MVP)

Tipografía:
  · Sans-serif moderna, buena lectura en móvil
  · Sugerencia: Inter o Geist para UI, Recoleta o Fraunces para headers
    de marketing
  · Escala: 12/14/16/20/24/32/48 px
  · Headers grandes y amigables en /pedir; compactos en dashboard

Radio de bordes:
  · cards: 16-20px
  · botones: 12px
  · inputs: 10px
  · pills: full

Sombras:
  · muy suaves (4-10% opacity), nunca duras
  · card hover eleva mínimamente

Iconografía:
  · lucide-react style (outline, 1.5px stroke, 20-24px default)
  · emojis permitidos en mensajes al cliente (🍕 ✅ 🚗) pero no como
    único indicador de estado (accesibilidad)

Botones:
  · Primary:   fondo color primary, texto blanco, mínimo 44px alto
  · Secondary: outline con color primary, fondo transparente
  · Ghost:     solo texto, para acciones de baja jerarquía
  · Danger:    rojo sólido para "Rechazar", "Cancelar pedido"

── RESPONSIVE (mobile-first, NO negociable) ──

Breakpoints (Tailwind):
  · base <640px (móvil)
  · sm 640+
  · md 768+
  · lg 1024+ (tablet landscape y desktop básico)
  · xl 1280+ (desktop pleno)

Reglas de adaptación:
  · 360px debe verse perfecto (el 95% del tráfico del cliente es móvil)
  · Touch targets ≥ 44×44px en toda zona táctil
  · Navegación del staff: bottom nav en móvil, sidebar lateral en ≥md
  · /pedidos en móvil: 1 columna scroll; en md: 2 columnas; en lg: 3-4
  · /mensajero: diseñado SOLO para móvil (no optimizar para desktop)

── ESTILO Y COMPONENTES (match con el stack del código) ──

El resultado debe ser trasladable a:
  · Tailwind CSS v4
  · shadcn/ui (Button, Dialog, Sheet, Card, Badge, Tabs, etc.)
  · lucide-react para íconos
  · sonner para toasts (notificaciones)

Evitar:
  · gradientes complejos (difícil de replicar en Tailwind)
  · fuentes custom más allá de 2
  · animaciones decorativas (sí transiciones sutiles)
  · imágenes stock genéricas; usar placeholders de comida real

── ACCESIBILIDAD ──

  · Contraste AA mínimo (4.5:1 para texto normal)
  · Estado no solo por color (icon + texto + color)
  · Focus visible en todos los elementos interactivos
  · Labels en todos los inputs
  · Safe areas iOS en /pedir y /mensajero

── LO QUE NO DEBES DISEÑAR ──

  · App móvil nativa (esto es web responsive)
  · Pantalla de registro/login para clientes finales (no se autentican)
  · Dashboard de analytics con gráficos complejos (fuera del MVP)
  · Multi-sucursal / selector de tenants (single-tenant en v1)
  · Pasarela de pago con formulario de tarjeta (no hay gateway)
  · Tracking GPS del domiciliario (v2)
  · Panel "super-admin" (fuera del MVP)

── ENTREGA ESPERADA ──

  · Cada una de las 9 pantallas en móvil (375px) y al menos las del
    staff también en desktop (1280px)
  · Estados: vacío, con data, error, loading donde aplique
  · Indicar en cada pantalla qué componentes de shadcn/ui usa
  · Exportable a HTML + Tailwind
```

---

## 🎯 Tips para sacar mejor output de Stitch

- Pega el prompt tal cual, en un solo mensaje
- Si Stitch pide resumen, pídele que mantenga las 9 pantallas
- Si el output inicial es muy "corporate" o frío, reitera el *mood*: cálido, pizzería familiar, no fintech
- Pide iteraciones enfocadas: *"ajusta la pantalla /pedidos para hacer los botones más grandes y táctiles"*

---

## 📥 Cómo pasarme el resultado

**Opción A — imagen (la más rápida):**
Arrastra los PNG al chat y dime: *"este es /pedir móvil, revisa"*.

**Opción B — HTML exportado:**
```bash
mkdir -p docs/designs
# guarda el HTML exportado en docs/designs/<pantalla>.html
```
Luego: *"revisa `docs/designs/pedidos.html`"*.

**Opción C — Link de Stitch:**
Pega el link completo, yo lo leo con WebFetch.

**Opción D — Notas / ajustes:**
Crea `docs/designs/notes.md` con tus observaciones (ej: *"cambiar color primario a #C13528"*) y lo leo para iterar el código.
