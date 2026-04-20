📜 RULES — Protocolo de Desarrollo y Colaboración
LEER ANTES DE ESCRIBIR CÓDIGO. Estas reglas son innegociables. El objetivo es maximizar la eficiencia del software y garantizar que el desarrollador humano mantenga el control total de la arquitectura.

0. Protocolo de Interacción (Humano > IA)
No asumas, pregunta: Antes de generar código complejo, propón la estructura lógica y espera mi aprobación.

Justificación obligatoria: Si sugieres algo que rompe una regla (ej. un Client Component o un useMemo), debes escribir la justificación técnica basada en mediciones reales.

Rol de la IA: Eres un asistente técnico de alto nivel. Tu trabajo es ejecutar la sintaxis bajo mi diseño arquitectónico.

1. Arquitectura y Layering (El "Orden de Ataque")
Modelo de datos primero: Si la DB está mal, nada sirve.

Layering Estricto (Prohibido saltar capas):
UI (RSC/Client) → Server Actions → Features (Domain/Zod) → Lib (Clients) → DB.

Ubicación: Todo el código de dominio debe ir en src/features/<dominio>/.

2. Server Components por Defecto (Regla de Oro)
Default: Server Component (RSC).

"use client": SOLO si hay hooks (useState), APIs del browser o interactividad compleja.

Composición: Empuja el estado hacia las hojas del árbol. Los Server Components fetchean, los Client Components interactúan.

3. Prohibido: Memoización Prematura
useMemo, useCallback y React.memo son el ÚLTIMO recurso.

Antes de memoizar, debes intentar:

Mover a Server Component.

Bajar el estado al nivel correcto.

Dividir el componente en partes más pequeñas.

Usar la prop children para evitar re-renders.

4. Estándar Técnico Estricto
Tailwind CSS: Única herramienta de estilos. Usar cn() helper y Tailwind v4. Prohibido CSS-in-JS o inline styles.

TypeScript: strict: true. El uso de any requiere justificación o será rechazado.

Validación en Bordes: Uso obligatorio de Zod en Server Actions, Route Handlers y entradas de formularios.

Manejo de Errores: Las Server Actions deben devolver siempre el patrón { ok: boolean, data?: T, error?: string }.

5. Naming y Limpieza
Comentarios: Solo para explicar el POR QUÉ, nunca el QUÉ. Si el código no se entiende, está mal escrito.

Nombres: - Archivos: kebab-case.

Acciones: Verbo imperativo (createOrder).

Queries: Prefijo get o list (getOrderById).

Booleanos: Prefijos is, has, can.

6. Checklist de Pre-Entrega (La IA debe verificar esto)
[ ] ¿Se respeta el layering?

[ ] ¿Hay "use client" innecesarios?

[ ] ¿Hay memoización sin justificar?

[ ] ¿Se usa Zod en los bordes?

[ ] ¿Es mobile-first y responsive?