# `TriviaModule` (backend) — Análisis técnico

Segunda tarea de Fase 2 (ver `tasks.md`). Depende de
`specs/features/ai-content-trivia/analysis.md` (`AiContentModule.getTriviaQuestions`,
ya listo) y de `GameEngineModule` (fases/temporizador/puntaje, Fase 1). La tarea
siguiente, "Componentes de pantalla y control para Trivia", es frontend — ya está
separada en `tasks.md`, así que esta queda 100% backend sin necesidad de dividirla más.

## Cómo encaja con `GameEngineService`

`GameEngineService` maneja fases/temporizador/puntaje de forma genérica (`startRound`,
`endRound`, `addScore`, eventos `room_state` / `round_started` / `round_update` /
`round_result`). Todavía no tiene un mecanismo de "plugin" para que un minijuego
enganche su propia lógica antes de que la ronda se cierre — `plan.md` describe esa idea
a futuro, pero el código real hoy es más simple. No se tocó ni se construyó ese
mecanismo genérico acá: es la primera tarea de un solo minijuego, prematuro generalizar
sin un segundo caso real que lo confirme.

En cambio, `TriviaService` se apoya en algo que ya garantiza el código actual:
`RoundTimer` (`game-engine/round-timer.ts`) llama `onTick` (dispara `round_update`) y
recién **después** de que esa llamada termina revisa si `remaining <= 0` para llamar
`onEnd` (dispara `round_result` y pasa la sala a `resultados`). Como `events$` de RxJS
notifica a los suscriptores de forma síncrona, `TriviaService` escucha `round_update` y,
al ver `remainingSeconds === 0`, resuelve las respuestas y llama
`gameEngine.addScore(...)` ahí mismo (síncrono) — esos puntos ya están aplicados a
`room.teams` antes de que `RoundTimer` siga su curso y dispare `round_result`. Resultado:
`round_result` sale con el puntaje ya correcto, sin tocar una línea de
`GameEngineService` (más allá de exportar `GameEngineService` desde `GameEngineModule`,
que no lo exportaba todavía — ver "Cambios de wiring" abajo).

**Límite explícito:** si alguien termina la ronda antes de tiempo con el evento genérico
`end_round` (no es un evento de Trivia), ese camino no pasa por `round_update` y
`TriviaService` no llega a tiempo de premiar respuestas — la ronda igual cierra bien
(sin crashear, sin doble conteo: `TriviaService` limpia su estado al ver `round_result`
para ese código), pero esas respuestas no se puntúan. No está en los criterios de
`spec.md` para Trivia (solo hablan de que el temporizador llegue a cero), así que queda
documentado como no soportado en vez de resolverlo con más complejidad.

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "4. Trivia / Preguntados".

## Diseño

Carpeta `apps/backend/src/trivia/`, mismo estilo que `game-engine/`:

- **`trivia.types.ts`**: `TriviaAnswerResult` (por jugador: `opcionIndex`, `correcta`,
  `puntos`) y `TriviaEvent` (`trivia_question` sin `indiceCorrecto` / `trivia_result`
  con el detalle completo).
- **`trivia.service.ts`**: `TriviaService`, con estado en memoria
  (`Map<code, TriviaRoundState>`, con la pregunta, opciones, `indiceCorrecto` y las
  respuestas recibidas).
  - `startRound(code, categoria, durationSeconds)`: pide la pregunta a
    `AiContentService` **antes** de arrancar el temporizador (constitution.md, principio
    5), después llama `gameEngine.startRound` y recién ahí guarda el estado y emite
    `trivia_question`.
  - `submitAnswer(code, socketId, opcionIndex)`: identifica al jugador por
    `client.id` (socket), nunca por un `playerId` que mande el cliente — mismo criterio
    que `RoomGateway.handleDisconnect`. Rechaza: sin ronda activa
    (`NoTriviaRoundError` — cubre también "llegaste tarde", porque al resolver la ronda
    se borra el estado), socket que no es de la sala (`PlayerNotInRoomError`), índice
    fuera de rango (`InvalidAnswerIndexError`), o segunda respuesta
    (`AlreadyAnsweredError` — spec: "no se puede cambiar").
  - Reloj inyectable (`now: () => number = Date.now`, `@Optional()`), mismo patrón que
    ya usa `AiContentService` con `random` — así las pruebas son deterministas.
  - `resolveRound` (privado): por cada jugador, `puntos = 100 + bono` si acertó (bono de
    hasta 50, proporcional a qué tan rápido respondió dentro del tiempo total), `0` si
    no acertó o no respondió — nunca negativo. Suma los puntos al equipo del jugador vía
    `gameEngine.addScore`, emite `trivia_result` revelando `indiceCorrecto`, y borra el
    estado de la ronda.
- **`trivia.gateway.ts`**: eventos `start_trivia_round` y `submit_trivia_answer`
  (cliente→servidor), `trivia_question` y `trivia_result` (servidor→cliente, reenviados
  desde `trivia.events$`, igual que `game-engine.gateway.ts`). Además,
  `trivia_answer_accepted` solo al socket que respondió (confirmación de que "quedó
  registrada" — sin esto, el jugador no tiene ninguna señal de éxito, ya que su
  respuesta no cambia el `room_state` que ve el resto).
- **`trivia.module.ts`**: importa `RoomModule`, `GameEngineModule`, `AiContentModule`;
  provee `TriviaService` + `TriviaGateway`. Se agrega a `AppModule`.

### Cambios de wiring

- `game-engine.module.ts`: se agregó `exports: [GameEngineService]` — no lo exportaba
  todavía porque hasta ahora `GameEngineGateway` era el único consumidor, dentro del
  mismo módulo. `TriviaModule` es el primer módulo externo que necesita inyectar
  `GameEngineService` directamente.

## Pruebas

- **`trivia.service.spec.ts`** (instanciación directa — `RoomService`/`GameEngineService`
  reales con `vi.useFakeTimers()`, igual que `game-engine.service.spec.ts`;
  `AiContentService` con un generador falso para tener pregunta/opciones conocidas; reloj
  inyectado a mano): reparte la pregunta sin `indiceCorrecto`; acierta con bono alto
  (responde rápido) y bono bajo (responde casi al límite); no responde → incorrecta, 0
  puntos; responder dos veces → `AlreadyAnsweredError`; índice fuera de rango →
  `InvalidAnswerIndexError`; sin ronda activa → `NoTriviaRoundError`; socket ajeno a la
  sala → `PlayerNotInRoomError`; `end_round` genérico antes de tiempo → no puntúa y
  limpia el estado.
- **`test/trivia.e2e-spec.ts`** (mismo patrón que `game-engine.e2e-spec.ts`, sockets
  reales sobre `AppModule` completo, sin `ANTHROPIC_API_KEY` en CI así que la pregunta
  sale siempre del banco de respaldo — las pruebas no asumen cuál opción es la
  correcta): camino feliz completo (`start_trivia_round` → `trivia_question` a pantalla y
  jugador → `submit_trivia_answer` → `trivia_answer_accepted` → `trivia_result` con el
  puntaje aplicado si acertó) y el caso "nadie responde a tiempo" que pide `spec.md`
  explícitamente para esta tarea.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`), igual que `ai-content-trivia`. La próxima tarea
("Componentes de pantalla y control para Trivia") es la que conecta esto a `/screen` y
`/play`, y ahí sí aplica el checklist completo.
