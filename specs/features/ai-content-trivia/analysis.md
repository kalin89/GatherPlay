# `AiContentModule.getTriviaQuestions(categoria)` — Análisis técnico

Primera tarea de Fase 2 (ver `tasks.md`). `TriviaModule` (la tarea siguiente) va a
depender de esto para tener las preguntas listas **antes** de arrancar cada ronda —
nunca durante el temporizador (`constitution.md`, principio 5).

**100% backend, sin ningún endpoint ni evento WS nuevo.** `TriviaModule` va a consumir
`AiContentService` directamente como provider de Nest, no por WebSocket. Por la excepción
de `testing-strategy.md` ("puro backend, sin UI conectada todavía"), no tiene checklist
manual.

## Decisión: híbrido IA + banco de respaldo

La IA (Claude) es la fuente principal — da variedad prácticamente infinita y cualquier
categoría. Un banco estático chico (20 preguntas por categoría, en código) es el
respaldo si la IA falla, tarda, rechaza el pedido, devuelve contenido inválido, o no hay
credencial configurada — así una llamada lenta o caída de la IA nunca tumba una ronda.
Persistir las preguntas generadas en Postgres (`content_banks`) para que el banco crezca
solo queda para más adelante — ver Fase 4 en `tasks.md`.

**Modelo: Claude Haiku 4.5** (`claude-haiku-4-5`), elegido por Kalin — el más barato,
suficiente para trivia general, y las preguntas mal marcadas son infrecuentes y de bajo
impacto en un juego familiar (además el banco de respaldo cubre el peor caso).

## Criterios de aceptación

Ver `spec.md` → "Contenido de IA — Trivia".

## Diseño

Carpeta `apps/backend/src/ai-content/`, mismo estilo que `room/` y `game-engine/`
(errores como clases propias, servicio `@Injectable`):

- **`trivia.types.ts`**: `TRIVIA_CATEGORIES` (general, historia, geografia, ciencia,
  deportes, entretenimiento) y los tipos `RawTriviaQuestion` (forma cruda, antes de
  barajar) / `TriviaQuestion` (lo que consume `TriviaModule`, con `opciones` ya
  barajadas e `indiceCorrecto`).
- **`trivia-generator.ts`**: interfaz `TriviaGenerator` + token de DI `TRIVIA_GENERATOR`.
  `AiContentService` depende de esta abstracción, nunca del cliente de Anthropic
  directamente (la D de SOLID en `plan.md`) — así se prueba sin red.
- **`claude-trivia-generator.ts`**: implementación con `@anthropic-ai/sdk`.
  `client.messages.parse` con `output_config.format` (Zod, `zodOutputFormat`) para
  forzar la forma `{ preguntas: [{ pregunta, correcta, incorrectas }] }`. System prompt
  fijo en español, pidiendo datos verificables y sin ambigüedad. Cliente con
  `timeout: 15_000` y `maxRetries: 1`. Lanza `TriviaGenerationError` ante `refusal`,
  `max_tokens` o `parsed_output` nulo.
- **`trivia-fallback-bank.ts`**: 20 preguntas por categoría (120 en total), escritas a
  mano, con hechos verificables y no ambiguos.
- **`ai-content.service.ts`**: `AiContentService.getTriviaQuestions(categoria, cantidad = 10)`.
  1. Valida categoría (`UnknownTriviaCategoryError`) y cantidad — entero de 1 a 20
     (`InvalidQuestionCountError`) — antes de tocar la IA.
  2. Si hay generador configurado, lo intenta; ante cualquier error o un lote inválido
     (cantidad incorrecta, opciones repetidas dentro de una pregunta, o preguntas
     repetidas en el lote), cae al banco con un `Logger.warn` — nunca propaga el error.
  3. El banco devuelve una muestra sin repetir de esa categoría.
  4. Baraja las opciones en el servidor (nunca la IA) y calcula `indiceCorrecto`. El
     `random` es un parámetro del constructor (`Math.random` por defecto) para que las
     pruebas sean deterministas.
- **`ai-content.module.ts`**: provee `TRIVIA_GENERATOR` con una factory — instancia
  `ClaudeTriviaGenerator` si existe `process.env.ANTHROPIC_API_KEY`, o `null` si no
  (ahí el servicio usa el banco directo, sin intentar la IA). Se importa en `AppModule`.

Dependencias nuevas en `apps/backend`: `@anthropic-ai/sdk`, `zod`.
`apps/backend/.env.example`: `ANTHROPIC_API_KEY=` (vacío, documentado).

## Pruebas

- **`ai-content.service.spec.ts`** (Vitest, instanciación directa como en
  `room.service.spec.ts` — sin `TestingModule`): un `it` por cada criterio de
  `spec.md`, más lote incompleto, opciones repetidas y preguntas repetidas cayendo al
  banco, y verificación de que el índice de la correcta varía entre preguntas.
- **`claude-trivia-generator.spec.ts`**: doble del cliente de Anthropic (`{ messages: { parse } }`
  tipado como `Anthropic`, sin red) — mapeo de `parsed_output`, errores por `refusal`/
  `max_tokens`/`parsed_output` nulo, y que se pide `model: "claude-haiku-4-5"`.
- **`trivia-fallback-bank.spec.ts`**: cada categoría tiene ≥20 preguntas válidas (4
  opciones distintas, sin preguntas repetidas dentro de la categoría).
- **Smoke opcional contra la API real** (`test/ai-content.e2e-spec.ts`,
  `describe.skipIf(!process.env.ANTHROPIC_API_KEY)`): se salta en CI y en dev sin key;
  con key, genera 5 preguntas de historia y las imprime para revisión manual.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`). `TriviaModule` es quien la va a conectar a un juego real.
