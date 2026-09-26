# `AiContentModule.getGestureWords(cantidad, excluir)` — Análisis técnico

Primera de las tres tareas de "Mímica / Caras y Gestos" (ver `tasks.md`, Fase 3).
Extiende `AiContentModule` ya existente (`specs/features/ai-content-trivia/analysis.md`)
con un segundo método, mismo criterio: generación híbrida IA + banco de respaldo,
100% backend, sin evento WS nuevo — `CarasYGestosService` (siguiente tarea) lo consume
como provider de Nest.

## Decisiones de esta iteración (confirmadas con Kalin)

- **Sin categoría seleccionable**: a diferencia de Trivia, cada pedido devuelve una
  mezcla de tipos (cosa, verbo, objeto, profesión, animal, lugar, personaje, etc.) — así
  lo pide el requerimiento original ("1 de las 5 palabras rondón"). No hay
  `GestureCategory` ni selector.
- **Anti-repetición por sala, en memoria**: a diferencia de Trivia (que solo evita
  duplicados dentro del mismo lote), acá el requerimiento pide explícitamente evitar
  repetir palabras entre partidas sucesivas de la misma sala. La lista de "ya usadas"
  vive en `CarasYGestosService` (no en `AiContentService`, que se mantiene sin estado
  por sala — principio de responsabilidad única) y se le pasa a este método como
  parámetro `excluir` en cada pedido. `AiContentService` solo garantiza "ninguna
  devuelta está en `excluir`"; no sabe nada de salas.
  - **Límite explícito**: este estado vive en el mismo `Map<code, ...>` en memoria que
    ya tiene el resto de `RoomModule`/`TriviaService` — se pierde si el proceso se
    reinicia y no se limpia cuando una sala se abandona. Mismo hueco ya documentado en
    `tasks.md` → Fase 4 → "Limpieza de salas abandonadas"; se resuelve junto con esa
    tarea, no antes.
- **Modelo y timeouts**: mismo criterio que Trivia — Claude Haiku 4.5, `timeout: 15_000`,
  `maxRetries: 1`.

## Diseño

Nuevos archivos en `apps/backend/src/ai-content/` (mismo módulo, no uno nuevo):

- **`gestos.types.ts`**: `MIN_GESTURE_WORDS = 1`, `MAX_GESTURE_WORDS_PER_REQUEST = 50`
  (tope por pedido individual — ver `caras-y-gestos-module/analysis.md` para cómo la
  partida completa puede necesitar más y pide en varios lotes). Tipo
  `GestureWord = string` (no hace falta un objeto — a diferencia de Trivia no hay
  opciones ni respuesta correcta que acompañar).
- **`gesture-generator.ts`**: interfaz `GestureGenerator` + token de DI
  `GESTURE_GENERATOR`, mismo patrón que `TriviaGenerator`/`TRIVIA_GENERATOR` (la D de
  SOLID — `AiContentService` no depende del cliente de Anthropic directamente).
  ```ts
  export interface GestureGenerator {
    generate(cantidad: number, excluir: string[]): Promise<string[]>;
  }
  ```
- **`claude-gesture-generator.ts`**: implementación con `@anthropic-ai/sdk`, mismo
  mecanismo que `claude-trivia-generator.ts` (`messages.parse` + `zodOutputFormat`,
  esquema `z.object({ palabras: z.array(z.string()) })`).
  - **System prompt** (nuevo, en español): pide palabras o frases cortas (máximo 2-3
    palabras) para jugar mímica en familia, mezclando tipos (cosas, verbos, objetos,
    profesiones, animales, lugares, personajes célebres, etc.), evitando nombres propios
    difíciles de actuar sin hablar, contenido no familiar, y evitando repetir la lista
    de palabras que se le pasa como ya usadas (`excluir`, interpolada en el mensaje de
    usuario, no en el system prompt — cambia en cada pedido).
  - Mismos errores que Trivia ante `refusal`/`max_tokens`/`parsed_output` nulo
    (`GestureGenerationError`, análogo a `TriviaGenerationError`).
- **`gesture-fallback-bank.ts`**: banco estático de al menos 80 palabras/frases,
  escritas a mano, mezclando los mismos tipos que pide el prompt — banco chico porque
  Trivia ya probó que alcanza como respaldo; se amplía si en la práctica una sala agota
  el banco jugando muchas partidas seguidas (ver "Límite explícito" de abajo).
- **`ai-content.service.ts`** (ampliación): `getGestureWords(cantidad, excluir = [])`.
  1. Valida `cantidad` (entero, `MIN_GESTURE_WORDS`..`MAX_GESTURE_WORDS_PER_REQUEST` →
     `InvalidWordCountError`, análogo a `InvalidQuestionCountError`).
  2. Si hay generador configurado, lo intenta pasándole `excluir`; ante cualquier error o
     un lote inválido (cantidad incorrecta, palabras repetidas entre sí, o alguna
     palabra coincide con `excluir` normalizada — `trim().toLowerCase()`, mismo criterio
     que `hasDuplicateQuestions`) cae al banco con `Logger.warn`, nunca propaga el error.
  3. El banco (`pickFromFallback`, mismo helper `sample` ya existente, reusado tal
     cual) devuelve una muestra sin repetir **y sin ninguna de `excluir`** — se filtra el
     pool antes de muestrear.
  4. A diferencia de Trivia, no hay que barajar opciones ni calcular índice correcto —
     se devuelve el arreglo de palabras tal cual.
- **`ai-content.module.ts`**: agrega el provider `GESTURE_GENERATOR` con la misma
  factory condicional a `ANTHROPIC_API_KEY` que ya usa `TRIVIA_GENERATOR` (misma
  instancia de cliente de Anthropic, reusada — no se crea un segundo cliente).

**Límite explícito**: si una sala juega Caras y Gestos muchas veces seguidas y agota
tanto el banco de respaldo como lo que la IA puede variar, el pedido puede empezar a
repetir palabras (mejor eso que bloquear la partida) — no se resuelve con nada más
fuerte, mismo criterio de "límite aceptado" que ya documentan `trivia-module` y
`ai-content-trivia`.

## Pruebas

- **`ai-content.service.spec.ts`** (ampliación, misma instanciación directa que ya usa):
  un `it` por cada criterio nuevo de `spec.md` → "Contenido de IA — Caras y Gestos"
  (cantidad válida sin repetidos, `excluir` respetado tanto en la IA como en el banco,
  fallo de IA cae al banco, sin credencial usa el banco directo, cantidad inválida no
  llama a la IA), más lote con palabras repetidas entre sí y lote que pisa `excluir`
  cayendo al banco.
- **`claude-gesture-generator.spec.ts`**: doble del cliente de Anthropic (mismo patrón
  que `claude-trivia-generator.spec.ts`), incluida la verificación de que `excluir` se
  interpola en el mensaje de usuario.
- **`gesture-fallback-bank.spec.ts`**: al menos 80 palabras válidas (no vacías, sin
  repetidas), y que `pickFromFallback` nunca devuelve algo de `excluir`.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`). `CarasYGestosModule` es quien la va a conectar a un juego
real.
