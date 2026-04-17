<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Sistema de agentes del proyecto

Este proyecto usa una arquitectura multi-agente. **Antes de tocar código, leer en orden:**

1. [PRD.md](PRD.md) — qué se construye y por qué
2. [RULES.md](RULES.md) — reglas de código NO negociables (arquitectura primero, memoización como último recurso)
3. [ENGRAM.md](ENGRAM.md) — memoria persistente con todas las decisiones tomadas
4. [agents/orchestrator.md](agents/orchestrator.md) — rol de Claude main (orquestador)
5. [agents/ui-agent.md](agents/ui-agent.md) — responsable de UI / componentes / estilos
6. [agents/data-agent.md](agents/data-agent.md) — responsable de Supabase / Server Actions / integraciones

## Quién hace qué

| Capa | Agente | Archivos |
|------|--------|----------|
| Orquestación, decisiones, ENGRAM | **Orchestrator (Claude main)** | `docs/*`, git, integración |
| Rutas, componentes, estilos, forms | **UI Agent** | `app/**`, `src/components/**` |
| Schema, RLS, actions, webhooks | **Data Agent** | `supabase/**`, `src/features/**`, `src/lib/**` |

## Regla de oro

Ningún agente toca las responsabilidades del otro. Si un trabajo requiere cruce, el orquestador divide y coordina.
