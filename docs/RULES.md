# RULES — Reglas de trabajo para este proyecto

> **Lee esto antes de escribir una línea de código.** Son las reglas que se aplican SIEMPRE, sin excepción. Romper una regla requiere justificación escrita en el PR o en ENGRAM.md.

---

## 1. Arquitectura limpia primero, optimización después

### 1.1 Orden de ataque a cualquier problema

1. **Modelo de datos correcto** — si la DB está mal, nada arriba sirve.
2. **Separación de responsabilidades** — cada capa hace una cosa.
3. **Composición de componentes** — partes pequeñas, bien nombradas.
4. **Colocación correcta de estado** — donde se usa, no un nivel más arriba.
5. **Server Components por defecto** — el problema se resuelve en el servidor si se puede.
6. **Solo si todo lo anterior falla → optimizar con memoización.**

### 1.2 Layering (NO saltar capas)

```
UI (RSC/Client components)
    ↓ llama a
Server Actions / Route Handlers
    ↓ llama a
Features (lógica de dominio, Zod schemas)
    ↓ llama a
Lib (Supabase client, WhatsApp, printing)
    ↓ llama a
Base de datos / APIs externas
```

**Prohibido:**
- Un componente UI que llame directo a Supabase saltándose features
- Features que conozcan detalles de UI
- Lib que conozca lógica de negocio
- Lógica de negocio en Route Handlers (deben ser thin controllers)

---

## 2. Server vs Client Components

### 2.1 Default: Server Component

**No escribas `"use client"` a menos que lo necesites de verdad.** RSC es el default por una razón:
- Menos JS al cliente
- Mejor SEO
- Acceso directo a DB/secretos
- Más rápido

### 2.2 Usa Client Component SOLO si necesitas:

- Hooks de React (`useState`, `useEffect`, `useRef`, etc.)
- Event handlers (`onClick`, `onChange`, `onSubmit` con interactividad compleja)
- APIs del browser (`localStorage`, `window`, `navigator`, `IntersectionObserver`)
- Librerías que solo funcionan en cliente (animaciones, drag-and-drop, maps)
- Context providers

### 2.3 Reglas de composición

- **Empuja los client components hacia las hojas del árbol**, no hacia la raíz.
- Un server component puede renderizar un client component y pasarle data ya fetcheada como props.
- Un client component NO puede renderizar un server component como hijo directo (salvo pasándolo como `children`).

### 2.4 Ejemplo correcto

```tsx
// app/(dashboard)/pedidos/page.tsx  (Server Component)
export default async function PedidosPage() {
  const orders = await getActiveOrders()          // fetch en server
  return <OrdersBoard initialOrders={orders} />   // pasa a client
}

// components/orders-board.tsx  (Client Component)
'use client'
export function OrdersBoard({ initialOrders }) {
  // aquí SÍ va el realtime subscription, estado local, etc.
}
```

---

## 3. Prohibido: memoización prematura

### 3.1 Regla de oro

> **`useMemo`, `useCallback` y `React.memo` son el ÚLTIMO recurso.**
> Antes de usarlos, resuelve con arquitectura.

### 3.2 Antes de escribir `useMemo` / `useCallback` / `memo`, intenta en este orden:

1. **¿Se puede mover a Server Component?** Si sí, mueve. Cero memoización necesaria.
2. **¿El state está en el nivel correcto?** Si lo subiste demasiado, bájalo y re-renders se reducen solos.
3. **¿El componente puede dividirse?** Un componente grande que re-renderiza todo puede partirse en hijos pequeños, cada uno con su propio estado.
4. **¿Puedo usar `children` prop?** Pasar componentes como `children` evita re-renders sin memoizar.
5. **¿El cálculo es REALMENTE caro?** Medir, no adivinar. `console.time` o React DevTools Profiler.
6. **¿El Array/Object que paso se crea nuevo en cada render?** Puede extraerse a constante fuera del componente.

### 3.3 Cuándo SÍ usar

| Hook | Cuándo | Cuándo NO |
|------|--------|-----------|
| `useMemo` | Cálculo probadamente costoso (>16ms en profiler) o valor usado como dependencia en otro hook | Strings, números, objetos pequeños, filtros simples |
| `useCallback` | Función pasada a componente memoizado que sí re-renderiza | Cualquier handler que se pasa a un elemento nativo (`onClick`, etc.) |
| `React.memo` | Componente que se renderiza 100+ veces y tiene props estables | Componentes que casi siempre reciben props nuevos |

### 3.4 Heurística práctica

Si alguien pregunta *"¿por qué pusiste `useMemo` aquí?"* y la respuesta no es:
1. *"Lo medí con el profiler y era X ms"*, o
2. *"Es una dependencia de otro hook que necesita referencia estable"*

→ **borra el `useMemo`**.

---

## 4. Tailwind es la ÚNICA herramienta de estilos

- Cero CSS-in-JS (styled-components, emotion, stitches)
- Cero CSS Modules
- Cero archivos `.css` por componente
- Solo `app/globals.css` para tokens con `@theme` (Tailwind v4)
- Composición con `cn()` helper (`clsx` + `tailwind-merge`)
- Variantes con `class-variance-authority`
- Orden de clases automático con `prettier-plugin-tailwindcss`
- Prohibido `style={{}}` inline y clases arbitrarias `[#abc]` sin justificación

---

## 5. TypeScript estricto

- `strict: true` en `tsconfig.json` (no negociable)
- `any` requiere comentario que justifique, o es code review reject
- Tipos inferidos desde Supabase con `supabase gen types typescript`
- Zod schemas como fuente de verdad para DTOs
  → `type X = z.infer<typeof xSchema>`
- No duplicar tipos entre cliente y servidor

---

## 6. Validación SOLO en bordes

- **Webhook / Route Handler** → valida el payload externo con Zod
- **Server Action** → valida el input con Zod antes de ejecutar
- **Form submit** → validación en cliente para UX, en servidor para seguridad

**No** valides entre capas internas. Si una feature llama a una función interna, confía en los tipos.

---

## 7. Comentarios: minimalismo

- **Default: no escribir comentarios.**
- Un comentario solo existe si explica **POR QUÉ** algo no-obvio.
- Nunca explicar QUÉ hace el código — eso lo dicen los identificadores.
- Nunca referenciar tickets, incidentes o fechas en comentarios (eso va en el commit o PR).
- Si el código necesita comentario para entenderse, el código está mal.

---

## 8. Feature-based folders

```
src/features/<dominio>/
├── actions.ts        # Server Actions
├── queries.ts        # Reads
├── schemas.ts        # Zod
├── types.ts          # Tipos derivados
└── utils.ts          # Helpers del dominio
```

**Un feature = un concepto del negocio.** No carpetas como `utils/`, `helpers/` o `services/` generales.

---

## 9. Nombres

- Archivos y carpetas: `kebab-case.ts`
- Componentes React: `PascalCase.tsx`
- Funciones: `camelCase`
- Constantes: `UPPER_SNAKE_CASE` solo si son verdaderamente constantes globales
- Booleanos: prefijo `is`, `has`, `can`, `should` (`isLoading`, `hasError`)
- Server Actions: verbo imperativo (`createOrder`, `approvePayment`)
- Queries: `get*` / `list*` (`getOrderById`, `listActiveOrders`)

---

## 10. Git y commits

- Commits pequeños, un concepto por commit
- Mensajes en imperativo presente: `add order status machine`, `fix eta calculation`
- Nunca commits con mezclas heterogéneas ("fix + refactor + feature")
- Nunca `--no-verify` sin justificación escrita

---

## 11. Lo que NO construimos sin razón

- Abstracciones "por si acaso"
- Helpers de 1-2 líneas si solo se usan en un lugar
- Custom hooks antes de tener duplicación probada (regla de 3)
- Error boundaries en cada componente (solo en fronteras reales)
- Loading states para operaciones sub-100ms
- Feature flags para código que no es toggleable
- Tests para getters/setters triviales

---

## 12. Lo que SIEMPRE construimos

- Tipos para datos externos (Supabase, WhatsApp, PrintNode)
- Validación Zod en bordes
- RLS en cada tabla de Supabase
- Manejo de errores en Server Actions (return `{ ok, error }` pattern)
- Loading UI con Suspense para rutas async
- Responsive desde el primer commit (mobile-first)

---

## 13. Checklist antes de abrir un PR

- [ ] ¿Respeté el orden de ataque (§1.1)?
- [ ] ¿Agregué `"use client"` solo donde hacía falta?
- [ ] ¿Evité `useMemo`/`useCallback`/`memo` o los justifiqué?
- [ ] ¿Estilos 100% en Tailwind?
- [ ] ¿Types limpios, cero `any` sin justificar?
- [ ] ¿Zod en todas las entradas externas?
- [ ] ¿Cero comentarios triviales?
- [ ] ¿Funciona en móvil?
- [ ] ¿Hice una sola cosa en este PR?
