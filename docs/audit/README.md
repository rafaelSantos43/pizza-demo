# Auditorías — Pizza Demo

Carpeta dedicada a hallazgos sistemáticos del proyecto. Tres archivos vivos, ordenados por categoría:

- **[logica.md](logica.md)** — bugs silenciosos del modelo de datos, condiciones de carrera, manejo de errores, autorización, integridad. Cosas que funcionan en el caso feliz pero rompen en edge cases reales.
- **[ui-ux.md](ui-ux.md)** — fricción del usuario, estados invisibles, copy ambiguo, comportamientos inesperados. No bloquea funcionalmente pero erosiona confianza.
- **[deuda-tecnica.md](deuda-tecnica.md)** — patrones inconsistentes, TODOs, "por ahora", refactors latentes que hoy no duelen pero después sí.

## Cómo se usa

Cada hallazgo es un bloque con:
- **ID** corto (L01, U01, D01, etc.) para referenciar en commits/PRs
- **Severidad**: `critical` (rompe data), `high` (vulnerabilidad o bug operativo), `medium` (degradación), `low` (cosmético)
- **Ubicación** (archivo:línea) clickeable
- **Síntoma observable**: qué ve el usuario / cajero / desarrollador
- **Causa raíz**: por qué pasa
- **Reproducción**: pasos mínimos
- **Fix propuesto**: bosquejo, no código completo
- **Estado**: `open`, `fixed (commit-hash)`, `won't fix (motivo)`

## Política

- Los hallazgos no se borran: se marcan `fixed` con el hash del commit que los resolvió. Sirve como memoria.
- Severidad `critical` o `high` deberían entrar al backlog activo. Severidad `low` o `medium` se priorizan según roadmap.
- Si un hallazgo escala (ej. lo que parecía `medium` resulta ser explotable), se actualiza la severidad y se marca con un `_(escalado YYYY-MM-DD)_`.
- Una auditoría no termina nunca: se barre cada vez que se hace un cambio grande o aparece una sospecha.
