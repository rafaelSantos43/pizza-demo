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

---

## Protocolo para actuar sobre hallazgos (no negociable)

> **El que un hallazgo esté en esta carpeta NO autoriza implementarlo.** El "Fix propuesto" de cada hallazgo es un bosquejo, no una decisión. Antes de tocar código por un hallazgo, se escribe la justificación. Sin justificación no hay implementación.

### Flujo obligatorio antes de implementar

```
1. RE-LEER el hallazgo entero. ¿Sigue siendo cierto? ¿Ha cambiado el código
   desde que se registró?

2. CONTRASTAR contra docs/RULES.md, hallazgo por hallazgo. La propuesta NO
   puede violar §1 (layering), §2 (RSC default), §3 (memoización tardía),
   §4 (Tailwind/TS/Zod), §5 (naming) o §6 (checklist).
   Si la propuesta tensiona una regla → hay que decidir explícitamente:
   ¿se cambia la regla o se reformula el fix?

3. CRUZAR con otros hallazgos. La auditoría puede contradecirse:
   un fix propuesto en logica.md puede romper algo dicho en deuda-tecnica.md.
   Mirar todos los IDs cercanos antes de actuar.

4. ESCRIBIR la justificación con la plantilla de abajo. Sin justificación
   escrita, no se toca código.

5. IMPLEMENTAR. Marcar el hallazgo como `fixed (commit-hash)` y enlazar
   la justificación.
```

### Plantilla de justificación (bloque a agregar al hallazgo cuando se decida actuar)

```markdown
### Decisión de implementación · YYYY-MM-DD

**Qué se va a atacar exactamente:** [el síntoma observable, con el caso real
que lo dispara — no la generalización].

**Por qué AHORA y no como deuda:** [riesgo concreto + fecha objetivo
o evento que lo justifica — ej. "antes del piloto", "porque ya hay 3
pedidos afectados"].

**Compatibilidad con RULES.md:**
- §1 Layering: [cómo respeta o por qué se justifica romperlo]
- §2 RSC default: [aplica/no aplica/justificación]
- §3 Memoización: [aplica/no aplica/justificación]
- §4 Tailwind/TS/Zod: [aplica/no aplica/justificación]
- §5 Naming: [aplica/no aplica/justificación]

**Contradice algún otro hallazgo o entrada de ENGRAM:** [sí/no, cuál,
cómo se resuelve].

**Alternativas descartadas:** [al menos 2, con razón concreta de por qué
no se eligen — fuerza a haber pensado].

**Alcance del cambio:** [archivos exactos, líneas estimadas, migrations,
env vars, side effects en prod].

**Cómo se valida que funcionó:** [test, repro manual, métrica antes/después].
```

### Sobre la calidad de los "Fix propuesto" actuales

Los hallazgos L01-L10, U01-U09, D01-D11 fueron registrados de un solo barrido.
Los **"Fix propuesto"** son **bosquejos**, no soluciones definitivas. En particular:

- **L01** propone una stored procedure → tensiona §1 (layering: lógica de dominio
  iría a DB). Hay que decidir si la atomicidad justifica el costo.
- **L02** (chequeo de rol) → totalmente alineado con §4 (validación en bordes).
  Probablemente se aprueba sin discusión.
- **L08** (Twilio camino B) → es feature work disfrazado de fix. Decidir si
  se mantiene aquí o se mueve a backlog de features.
- **U03** (banner "Activar sonidos") → introduce nuevo patrón de UI; alinear
  con UI/UX Agent del proyecto antes de implementar.
- **D03/D04** (tests) → cumplir RULES §6 (pre-delivery checklist) implícitamente
  pide tests, pero el alcance es grande. Decidir scope mínimo viable.

Cada uno de estos requiere su propio bloque de **Decisión de implementación**
ANTES de tocar código.

### Anti-patrones que el protocolo previene

- ❌ "El audit dice X, pues lo hago" — sin re-leer ni contrastar
- ❌ Implementar dos hallazgos contradictorios sin notar la contradicción
- ❌ Romper RULES.md "porque el audit lo recomienda"
- ❌ Aplicar el "fix propuesto" tal cual sin pensar si sigue aplicando
- ❌ Marcar como `fixed` sin commit-hash o sin la decisión escrita arriba
