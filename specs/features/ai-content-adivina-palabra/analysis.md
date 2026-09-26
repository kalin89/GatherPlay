# `AiContentModule.getAdivinaPalabraWords(cantidad, excluir)` — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). `AdivinaPalabraModule` (la tarea siguiente) depende de
esto para tener el pool de palabras de toda la partida listo **antes** de arrancar el
primer turno — nunca durante un temporizador (`constitution.md`, principio 5).

**100% backend, sin ningún endpoint ni evento WS nuevo.** `AdivinaPalabraModule` va a
consumir `AiContentService` directamente como provider de Nest, mismo criterio que
`TriviaModule` con `getTriviaQuestions`. Por la excepción de `testing-strategy.md`
("puro backend, sin UI conectada todavía"), no tiene checklist manual.

## Diferencia clave con `getTriviaQuestions`

Trivia pide preguntas turno a turno y solo evita repetidos **dentro de un mismo lote**.
Acá el requisito (confirmado con Kalin) es evitar palabras repetidas **mientras la sala
exista**, entre partidas sucesivas de "Adivina la palabra" en la misma sala — no solo
dentro de una partida. Por eso el método recibe una lista de exclusión explícita
(`excluir: string[]`) en vez de manejar la deduplicación puertas adentro: quien arma esa
lista y decide qué persiste es `AdivinaPalabraService` (dueño del estado por sala), no
este módulo — `AiContentModule` sigue sin saber nada de salas ni de estado en memoria
por partida, mismo criterio que ya aplica a `getTriviaQuestions`.

## Decisión: híbrido IA + banco de respaldo

Mismo criterio que Trivia (`ai-content-trivia/analysis.md`): la IA (Claude) es la
fuente principal, un banco estático chico es el respaldo. **Modelo: Claude Haiku 4.5**
(`claude-haiku-4-5`), mismo criterio de costo/beneficio que Trivia — generar palabras
sueltas es una tarea todavía más simple que preguntas de trivia.

## Criterios de aceptación

Ver `spec.md` → "Contenido de IA — Adivina la palabra".

## Diseño

Carpeta `apps/backend/src/ai-content/` (ya existe, de Trivia) — se agregan archivos
nuevos, sin tocar los de Trivia:

- **`adivina-palabra.types.ts`**: sin categorías (a diferencia de Trivia, acá no hay
  selector). Palabras: sustantivos comunes, cortos, sin ambigüedad, aptos para un juego
  familiar (nada de nombres propios ni términos que dependan de contexto regional
  fuerte).
- **`word-generator.ts`**: interfaz `WordGenerator` + token de DI `WORD_GENERATOR`,
  mismo patrón que `TriviaGenerator`/`TRIVIA_GENERATOR` — `AiContentService` depende de
  la abstracción, nunca del cliente de Anthropic directamente.
  ```ts
  export interface WordGenerator {
    generate(cantidad: number, excluir: string[]): Promise<string[]>;
  }
  ```
- **`claude-word-generator.ts`**: implementación con `@anthropic-ai/sdk`.
  `client.messages.parse` con `output_config.format` (Zod, `zodOutputFormat`) forzando
  `{ palabras: string[] }`. System prompt en español pidiendo palabras comunes,
  adivinables por pistas verbales, de dificultad pareja, sin repetir entre sí y sin
  usar ninguna de la lista de exclusión que se pasa en el prompt (mismo criterio de
  "prompt parecido al de Trivia para evitar repetidos" que pide `spec.md`). Mismo
  `timeout: 15_000` y `maxRetries: 1` que Trivia. Lanza `WordGenerationError` ante
  `refusal`, `max_tokens` o `parsed_output` nulo.
- **`word-fallback-bank.ts`**: lista estática de **150 palabras** en español, escritas a
  mano (objetos cotidianos, animales, profesiones, lugares, actividades — nada de
  categorías, dificultad pareja). Mismo criterio que `trivia-fallback-bank.ts`: hechos/
  términos sin ambigüedad. La redacción final de las 150 palabras queda para la sesión
  de implementación (no es una decisión de diseño, es contenido).
- **`ai-content.service.ts`** (ya existe): se agrega
  `getAdivinaPalabraWords(cantidad, excluir: string[] = []): Promise<string[]>`.
  1. Valida `cantidad` — entero ≥ 1, sin tope superior artificial más allá de
     `MAX_WORDS_PER_REQUEST = 200` (una partida grande con muchos turnos puede pedir
     varios cientos entre llamadas sucesivas, pero una sola llamada nunca necesita más
     que eso) — `InvalidWordCountError` si no cumple, antes de tocar la IA.
  2. Si hay generador configurado, lo intenta con `(cantidad, excluir)`; ante cualquier
     error, o un lote inválido (palabras repetidas entre sí, o alguna coincide con
     `excluir`), se queda con las válidas que haya y completa el resto desde el banco —
     nunca propaga el error, con `Logger.warn`.
  3. El banco (`sample(n, excluir)`) devuelve una muestra sin repetir y sin tocar
     `excluir`; si no alcanza para `n`, devuelve las que consiga (no lanza error — caso
     límite documentado en `spec.md`).
  4. `random` es un parámetro del constructor (`Math.random` por defecto), mismo
     criterio que `getTriviaQuestions`, para pruebas deterministas.
- **`ai-content.module.ts`** (ya existe): se agrega el provider de `WORD_GENERATOR`
  junto al de `TRIVIA_GENERATOR` (misma factory: instancia si hay
  `ANTHROPIC_API_KEY`, si no `null`).

Sin dependencias nuevas — reusa `@anthropic-ai/sdk` y `zod` ya agregados por Trivia.

## Pruebas

- **`ai-content.service.spec.ts`** (ampliación del archivo de Trivia, mismo estilo de
  instanciación directa): casos nuevos para `getAdivinaPalabraWords` — cantidad válida
  sin exclusión, cantidad válida con exclusión (ninguna palabra devuelta coincide),
  la IA devuelve repetidos o palabras excluidas → se completa con el banco, sin
  credencial → banco directo, cantidad inválida (0, negativa, no entera) → error sin
  llamar a la IA, banco sin suficientes palabras nuevas → devuelve menos sin lanzar
  error.
- **`claude-word-generator.spec.ts`**: doble del cliente de Anthropic, mapeo de
  `parsed_output`, errores por `refusal`/`max_tokens`/`parsed_output` nulo, se pide
  `model: "claude-haiku-4-5"`, el prompt incluye la lista de exclusión recibida.
- **`word-fallback-bank.spec.ts`**: el banco tiene ≥150 palabras válidas, todas
  distintas entre sí; `sample(n, excluir)` nunca devuelve algo de `excluir` ni
  repetidos, y con `n` mayor a lo disponible tras excluir, devuelve todo lo que quede
  sin lanzar error.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`). `AdivinaPalabraModule` es quien la conecta a un juego real.
