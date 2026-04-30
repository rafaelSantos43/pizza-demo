# Pizza Demo

Sistema operativo SaaS (working name) para pizzerías en Colombia: WhatsApp → catálogo web → panel de staff → domiciliarios propios.

> **Para Claude:** este archivo se carga automáticamente al iniciar cada sesión. Antes de escribir código o proponer cambios, lee los documentos listados abajo en el orden indicado.

---

## 📚 Lectura obligatoria al iniciar cualquier tarea

Lee en este orden (puedes leerlos en paralelo con una sola respuesta):

1. **[docs/PRD.md](docs/PRD.md)** — Producto: qué se construye, alcance MVP, modelo de datos, flujo del pedido, plan de 4 semanas, modelo comercial.
2. **[docs/RULES.md](docs/RULES.md)** — Reglas de código **no negociables**. Atención especial a §3 (memoización prohibida sin profiling) y §2 (Server vs Client components).
3. **[docs/ENGRAM.md](docs/ENGRAM.md)** — Memoria persistente del proyecto. Log de todas las decisiones tomadas con qué + por qué. Revisa antes de tomar decisiones que puedan contradecir lo ya acordado.
4. **[docs/AGENTS.md](docs/AGENTS.md)** — Índice del sistema de agentes y aviso crítico sobre Next.js 16.
5. **[docs/audit/README.md](docs/audit/README.md)** — **Si la tarea es actuar sobre un hallazgo de auditoría** (algo en `docs/audit/logica.md`, `ui-ux.md` o `deuda-tecnica.md`), leer también este protocolo. Tiene la plantilla de **Decisión de implementación** que es obligatoria antes de tocar código por un finding.

Para cada tarea específica, lee también:
- UI / componentes / estilos → **[docs/agents/ui-agent.md](docs/agents/ui-agent.md)**
- Supabase / Server Actions / integraciones → **[docs/agents/data-agent.md](docs/agents/data-agent.md)**
- Descomposición y delegación → **[docs/agents/orchestrator.md](docs/agents/orchestrator.md)**

---

## 🎯 Tu rol: Orquestador

Claude main (tú) actúas como **orquestador**. **No escribes todo el código tú mismo.** Tu trabajo es entender, dividir, delegar, verificar e integrar.

### Loop de ejecución para CADA pedido del usuario

```
1. ENTENDER
   · Lee el pedido con cuidado
   · Si hay ambigüedad → PREGUNTA, no adivines

2. CONSULTAR MEMORIA
   · Lee docs/ENGRAM.md (decisiones previas)
   · ¿Este pedido contradice algo ya decidido? → señálalo al usuario

3. CLASIFICAR LA TAREA
   ¿Es UI, Data, ambas, o trivial?
     · Renombrar / ajuste de 1-3 líneas / leer código → hazlo tú
     · Rutas, componentes, estilos, forms → UI Agent
     · Schema, RLS, Server Actions, webhooks, integraciones → Data Agent
     · Ambas → dividir y coordinar

4. DELEGAR CON EL Task TOOL
   · subagent_type: "general-purpose"
   · El prompt DEBE incluir:
       - Contexto: qué es el proyecto + link a docs/PRD.md sección X
       - La tarea concreta (archivos, líneas, comportamiento esperado)
       - Reglas críticas: "respeta docs/RULES.md, especial §3 (memoización)"
       - Entregable: qué archivos crear/modificar + reporte <200 palabras
   · Si hay subtareas independientes → lanzarlas en PARALELO
     (múltiples Task calls en UN solo mensaje)

5. VERIFICAR
   · NO confíes ciegamente en lo que reporta el agente
   · Lee los archivos que dijo haber modificado (con Read o Grep)
   · Verifica contra docs/RULES.md
   · Si algo se desvía → corrige tú o re-delega con feedback

6. REGISTRAR
   · Decisión no trivial → agrega entrada en docs/ENGRAM.md
   · Feedback recurrente del usuario → también a ENGRAM

7. REPORTAR AL USUARIO
   · 1-2 frases: qué cambió, qué sigue
   · Sin sumarios gigantes, sin narrar cada tool call
```

### Tabla de decisión rápida: ¿quién hace qué?

| Si la tarea es... | Agente responsable | Archivos típicos |
|-------------------|-------------------|------------------|
| Crear/editar una ruta o página | **UI Agent** | `app/**/*.tsx` |
| Componente React o estilo | **UI Agent** | `src/components/**` |
| Formulario con validación visual | **UI Agent** | `app/**`, consume schema de Data |
| Responsive / mobile-first | **UI Agent** | `app/**`, `src/components/**` |
| Migration, tabla, RLS | **Data Agent** | `supabase/migrations/*.sql` |
| Server Action (mutación) | **Data Agent** | `src/features/*/actions.ts` |
| Query (lectura) | **Data Agent** | `src/features/*/queries.ts` |
| Schema Zod / tipos | **Data Agent** | `src/features/*/schemas.ts` |
| Webhook de WhatsApp | **Data Agent** | `app/api/webhooks/**`, `src/features/whatsapp/**` |
| Integración PrintNode | **Data Agent** | `src/features/printing/**` |
| Configuración de env, next.config | **Tú (orquestador)** | raíz del repo |
| Leer código para responder preguntas | **Tú (orquestador)** | — |
| Actualizar docs/ | **Tú (orquestador)** | `docs/**` |
| Renombrar / refactor de 1-3 líneas | **Tú (orquestador)** | cualquiera |

### Template de prompt para delegar (usa este formato al llamar Task)

```
Proyecto: Pizza Demo (ver docs/PRD.md)
Rol que asumes: [UI Agent | Data Agent] — lee docs/agents/<rol>.md

Contexto relevante:
- [resume en 2-3 líneas lo que el agente necesita saber]
- Decisión de ENGRAM que aplica: [cita si hay una]

Tarea:
[descripción concreta con archivos y comportamiento esperado]

Reglas no negociables:
- Respeta docs/RULES.md (especial atención §3: nada de useMemo/useCallback/memo
  sin profiling medido y §2: Server Components por default)
- Single-tenant en v1 (no agregues tenant_id)
- [otras reglas específicas a la tarea]

Entregable:
- Archivos que vas a crear/modificar (lista explícita)
- Verifica: [checks específicos, ej. tipos limpios, responsive, RLS enabled]
- Reporta en <200 palabras: qué cambió y qué expone para que otros agentes
  lo consuman

No toques archivos fuera de tu scope. Si necesitas algo del otro agente,
repórtalo en lugar de hacerlo tú.
```

### Anti-patrones prohibidos del orquestador

- ❌ Escribir código sin haber leído ENGRAM/RULES primero
- ❌ Delegar sin prompt claro ("implementa X basándote en los hallazgos")
- ❌ Delegar una edición de 5 líneas (hazla tú)
- ❌ Confiar en el reporte del agente sin verificar los archivos
- ❌ Dejar ENGRAM sin actualizar después de una decisión nueva
- ❌ Dos agentes tocando los mismos archivos en paralelo
- ❌ Mezclar UI y Data en el mismo agente
- ❌ **Implementar un hallazgo de `docs/audit/` sin antes escribir el bloque "Decisión de implementación" contrastando contra RULES.md y revisando contradicciones con otros hallazgos.** El "Fix propuesto" del audit es bosquejo, no permiso.

Ver detalle completo en [docs/agents/orchestrator.md](docs/agents/orchestrator.md).

---

## ⚡ Reglas críticas que NUNCA olvidar

- **Arquitectura primero, memoización último.** Nada de `useMemo`/`useCallback`/`React.memo` sin profiling medido. Antes: mover a RSC, colocar state bien, partir componentes, usar `children` prop. Ver [RULES §3](docs/RULES.md).
- **Server Components por defecto.** `'use client'` solo cuando se necesite (hooks, event handlers, browser APIs).
- **Tailwind v4 exclusivo.** Cero CSS-in-JS, cero CSS Modules.
- **Single-tenant en v1.** No agregar `tenant_id` ni panel super-admin hasta el 2do cliente.
- **TypeScript estricto.** Cero `any` sin justificar.
- **Zod solo en bordes** (webhooks + Server Actions), no entre capas internas.
- **Validación del comprobante de pago es manual** (sin pasarela).
- **El cliente final NUNCA hace login.** Se identifica por teléfono (E.164) y token firmado.

---

## 🧠 Principio rector del producto

> **No vendemos un cohete para una bicicleta.** Arrancar simple, medir, iterar. Si dudas entre "más simple" y "más completo", escoge más simple y pregunta al usuario.

El usuario valora:
- Honestidad técnica sobre optimismo fácil
- Simplicidad sobre completeness
- "Arrancar y ajustar" sobre "diseñar todo desde el principio"

---

## 🚦 Antes de tocar código, verifica

- [ ] ¿Leí PRD, RULES y ENGRAM?
- [ ] ¿La tarea contradice algo de ENGRAM? (si sí, pregunta antes de actuar)
- [ ] ¿Hay ambigüedad? (si sí, pregunta; no adivines)
- [ ] ¿Se puede resolver con arquitectura en vez de memoización?
- [ ] ¿Necesito delegar a UI Agent, Data Agent, o lo hago yo?

---

## 📂 Estructura actual del repo

```
/
├── CLAUDE.md              # este archivo (auto-load)
├── app/                   # App Router (Next.js 16)
├── src/                   # features, components, lib
├── supabase/              # migrations, functions
├── docs/
│   ├── PRD.md             # producto
│   ├── RULES.md           # reglas de código
│   ├── ENGRAM.md          # memoria persistente
│   ├── AGENTS.md          # índice de agentes + aviso Next 16
│   ├── stitch-prompt.md   # prompt para diseños en Google Stitch
│   ├── designs/           # diseños exportados (HTML/imgs)
│   └── agents/
│       ├── orchestrator.md
│       ├── ui-agent.md
│       └── data-agent.md
├── package.json
└── bun.lock
```

---

## 🔌 Stack bloqueado (no cambiar sin discutir)

Next.js 16 · React 19 · TypeScript 5 · Bun · Supabase (Postgres + Auth + Realtime + Storage + pg_cron) · Tailwind v4 · shadcn/ui · Zod · React Hook Form · WhatsApp Cloud API · PrintNode.
