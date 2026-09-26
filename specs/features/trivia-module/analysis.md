# `TriviaModule` (backend) — Análisis técnico

**Reescritura completa** de esta tarea de Fase 2 (ver `tasks.md`) — el diseño anterior
("todos los jugadores responden en simultáneo, bono por rapidez") se reemplaza por
turnos individuales, por cambio de requerimiento explícito de Kalin. Depende de
`specs/features/ai-content-trivia/analysis.md` (`AiContentModule.getTriviaQuestions`),
`GameEngineModule` (Fase 1, solo para `addScore` — ver más abajo por qué no se reusa
más que eso) y `specs/features/game-selection/analysis.md` (`distributeTurns`,
`RoomState.currentGame`). El código viejo de `apps/backend/src/trivia/` (no
commiteado) se reescribe, no se parchea — el modelo de estado es distinto de raíz.

## Cómo encaja con `GameEngineService` (y por qué esta vez es distinto)

El diseño anterior reusaba `gameEngine.startRound`/el `RoundTimer` interno para **una**
pregunta por ronda — encajaba porque "una pregunta" y "una ronda" eran lo mismo.
Ahora una partida de Trivia son varios turnos (rondas × tamaño del equipo más grande,
por equipo — ver "Reparto de turnos" en `spec.md`) dentro de una sola partida, y
`room.status` debe quedarse en `jugando` durante TODOS esos turnos, pasando a
`resultados` recién cuando se termina el último. `GameEngineService.startRound` modela
un único temporizador de duración fija que termina en `resultados` — no encaja con "N
temporizadores cortos seguidos, misma partida". Reusarlo turno a turno haría que
`room.status` parpadeara a `resultados` después de cada pregunta, lo cual es
incorrecto.

En cambio, `TriviaService`:

- Usa `RoundTimer` (`game-engine/round-timer.ts`) **directamente**, un temporizador por
  turno, sin pasar por `GameEngineService.startRound/endRound` — es la misma clase
  reutilizable, no el orquestador de más alto nivel.
- Muta `room.status`/`room.round` directamente sobre el objeto que devuelve
  `roomService.getRoomOrThrow(code)`, igual que ya hace `GameEngineService` hoy
  (`room.status = 'jugando'` es una mutación directa ahí también, no pasa por ningún
  setter). Es el mismo patrón ya establecido en el código, no una excepción nueva.
- Sigue usando `gameEngine.addScore(code, teamId, puntos)` para sumar puntaje — eso sí
  se reusa tal cual, ya emite `room_state` con el marcador actualizado.
- Emite sus propios eventos por `TriviaService.events$` (incluido un `room_state`
  propio para las mutaciones de `status`/`round` que hace directamente, ya que esas no
  pasan por `GameEngineService.events$`) — mismo criterio synchronous-por-RxJS que ya
  usaba el diseño anterior.

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "4. Trivia / Preguntados" y "Motor de sala" → "Reparto
de turnos entre jugadores de un equipo".

## Decisiones de esta iteración (confirmadas con Kalin)

- **Categoría fija por ahora**: `DEFAULT_CATEGORY: TriviaCategory = 'general'`, sin
  selector en el host. Se deja como constante fácil de cambiar; un selector de
  categoría es pulido a futuro, no de esta tarea.
- **3 rondas por jugador por defecto**: `ROUNDS_PER_PLAYER = 3` (constante).
- **Sin bono por rapidez**: `TRIVIA_TURN_POINTS = 1` fijo si acierta, `0` si no (cada
  pregunta correcta vale un punto — ajustado a pedido de Kalin, antes eran 100).
- **Duración del turno**: `TRIVIA_TURN_SECONDS = 15` (constante, ajustable — no hay un
  valor pedido explícitamente).
- **Pausa entre turnos**: `TURN_TRANSITION_DELAY_MS = 2500` — la controla el backend
  (no el frontend) para que la cuenta del siguiente turno no arranque mientras el
  cliente todavía está mostrando la animación/sonido del anterior (constitution.md,
  principio 3: el tiempo real vive en el servidor).

## Diseño

Carpeta `apps/backend/src/trivia/` (se reescribe entera).

### `trivia.types.ts`

```ts
export interface TriviaTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  opcionElegida: number | null;
  correcta: boolean;
  puntos: number;
}

export type TriviaEvent =
  | { type: 'room_state'; code: string; room: RoomState } // status/round mutados por Trivia
  | { type: 'trivia_turn_waiting'; code: string; playerId: string; playerName: string; teamId: string }
  | { type: 'trivia_turn_started'; code: string; targetSocketIds: string[]; playerId: string; playerName: string; pregunta: string; opciones: string[]; durationSeconds: number }
  | { type: 'trivia_turn_update'; code: string; targetSocketIds: string[]; remainingSeconds: number }
  | { type: 'trivia_turn_result'; code: string; pregunta: string; opciones: string[]; indiceCorrecto: number; resultado: TriviaTurnResult }
  | { type: 'trivia_match_result'; code: string; scores: TeamScore[] };
```

`targetSocketIds` lo resuelve `TriviaService` (pantalla + jugador en turno); el
gateway solo hace `server.to(id).emit(...)` por cada uno — ver "Cambios de wiring".

### `trivia.service.ts`

Estado en memoria: `Map<code, TriviaMatchState>` con
`{ turns: TurnAssignment[], currentIndex: number, currentQuestion: {pregunta, opciones, indiceCorrecto} | null, answered: boolean, timer: RoundTimer | null }`.

- **`startMatch(code)`**:
  - `room = rooms.getRoomOrThrow(code)`.
  - `distributeTurns(room.teams, ROUNDS_PER_PLAYER)` (de
    `game-engine/turn-distribution.ts`) → `turns`. Si tira `NotEnoughTeamsError`, se
    deja burbujear (menos de 2 equipos con jugadores).
  - Si ya hay una partida en curso en esa sala → `TriviaMatchAlreadyRunningError`.
  - `room.status = 'jugando'` (mutación directa, ver arriba).
  - Guarda el estado inicial (`currentIndex: 0`, sin preguntas todavía) y llama a
    `loadQuestionsAndStartFirstTurn(code, count)` (`count = min(turns.length, MAX_TRIVIA_QUESTIONS_PER_MATCH)`).
  - Emite `room_state`.
- **`loadQuestionsAndStartFirstTurn(code, count)`** (privado, actualizado — antes cada
  turno pedía su propia pregunta por separado, lo que permitía repetidas entre turnos
  de una misma partida): pide **todas** las preguntas de la partida de una sola vez a
  `aiContent.getTriviaQuestions(DEFAULT_CATEGORY, count, excluir)` **antes** de arrancar
  el primer turno (constitution.md, principio 5). `excluir` es la lista de preguntas ya
  usadas en esa sala en partidas anteriores (`this.askedQuestions`, en memoria, tope
  `MAX_TRACKED_QUESTIONS_PER_ROOM`) — se la pasa a la IA para que no las repita (mejor
  esfuerzo, ver `ai-content-trivia/analysis.md`). Guarda `match.questions` y actualiza
  `askedQuestions` con las nuevas, después llama a `startTurn(code)`.
- **`startTurn(code)`** (privado, ya no `async`): lee la pregunta del turno actual de
  `match.questions[currentIndex % length]` (el `% length` es red de seguridad si el
  banco de respaldo no alcanzara para una partida enorme), arma un nuevo `RoundTimer`
  con `onTick → emit trivia_turn_update`, `onEnd → resolveTurn(code, null)`, y lo
  arranca con `TRIVIA_TURN_SECONDS`. Resuelve `targetSocketIds` = socket de pantalla(s)
  + `player.socketId` del turno actual (ver "Cambios de wiring" para cómo se identifica
  a la pantalla). Emite `trivia_turn_waiting` (a toda la sala) y `trivia_turn_started`
  (solo a `targetSocketIds`).
- **`submitAnswer(code, socketId, opcionIndex)`**: identifica al jugador por
  `socketId` (nunca por un id que mande el cliente, mismo criterio que la versión
  anterior). Rechaza: sin partida activa (`NoTriviaMatchError`), socket que no es de la
  sala (`PlayerNotInRoomError`), jugador que no es quien tiene el turno actual
  (`NotYourTurnError`), índice fuera de rango (`InvalidAnswerIndexError`), turno ya
  respondido (`AlreadyAnsweredError` — guarda contra doble tap). Si pasa validaciones:
  detiene el timer del turno y llama a `resolveTurn(code, opcionIndex)`.
- **`resolveTurn(code, opcionIndex)`** (privado, `opcionIndex` puede ser `null` si se
  acabó el tiempo): calcula `correcta`/`puntos` (fijo, sin bono), llama
  `gameEngine.addScore` si corresponde (acumulado de por vida en `team.score`, el que
  se ve en el panel de selección de juego) **y** suma esos mismos puntos a
  `match.matchScores` (`Map<teamId, number>`, puntos de esta partida puntual), arma
  `TriviaTurnResult`, emite `trivia_turn_result` a toda la sala. Después, con
  `setTimeout` de `TURN_TRANSITION_DELAY_MS` (scheduler inyectable — mismo patrón que
  `now` en la versión anterior, para poder testear con fake timers):
  - Si quedan turnos (`currentIndex + 1 < turns.length`): avanza el índice y llama
    `startTurn(code)`.
  - Si no: `finishMatch(code)` — `room.status = 'resultados'`, `room.round = null`,
    emite `room_state` y `trivia_match_result` con `scores` armado desde
    `match.matchScores` (**no** desde `team.score`) — el resultado final de una
    partida muestra solo lo ganado en esa partida, nunca el acumulado entre partidas
    (decisión de Kalin tras probar manualmente que ambas pantallas mostraban lo
    mismo). Borra el estado de la partida.

### `trivia.gateway.ts`

- Cliente → servidor: `start_trivia_game { code }` (reemplaza `start_trivia_round` —
  ya no recibe `categoria`/`durationSeconds`, son constantes del backend ahora),
  `submit_trivia_answer { code, opcionIndex }` (igual que antes).
- Servidor → cliente: reenvía `trivia.events$` — `room_state` y `trivia_turn_waiting`/
  `trivia_turn_result`/`trivia_match_result` van a `server.to(code)` (toda la sala);
  `trivia_turn_started`/`trivia_turn_update` van target por target
  (`event.targetSocketIds.forEach(id => server.to(id).emit(...))`). Más
  `trivia_answer_accepted` solo al socket que respondió, igual que antes.

### `trivia.module.ts`

Importa `RoomModule`, `GameEngineModule`, `AiContentModule`; provee `TriviaService` +
`TriviaGateway`. Ya está agregado a `AppModule` (de la iteración anterior, sin cambios
de wiring ahí).

### Cambios de wiring

- **`room.gateway.ts` → `handleWatchRoom`**: además de `client.join(room.code)`, ahora
  también `client.join(\`${room.code}:screen\`)`. Es el único cambio a `RoomModule` que
  pide esta tarea — necesario para poder mandarle la pregunta completa a la pantalla
  sin mandársela también a los celulares que no están en turno (ver "Privacidad de la
  pregunta" abajo). Pequeño y aislado, se documenta acá en vez de en
  `game-selection/analysis.md` porque ningún otro consumidor lo necesita todavía.
- `game-engine/turn-distribution.ts`: nuevo archivo, ver
  `specs/features/game-selection/analysis.md` (ahí se diseña porque es utilidad
  compartida, no de Trivia).

### Privacidad de la pregunta

`spec.md` pide explícitamente que los celulares que no están en turno no vean la
pregunta — no solo que el botón esté deshabilitado. Por eso `trivia_turn_started` (con
la pregunta completa) se manda solo a `${code}:screen` + el socket del jugador en
turno, nunca a `server.to(code)`. El resto de los celulares reciben únicamente
`trivia_turn_waiting` (nombre + equipo del jugador en turno, sin pregunta ni opciones)
para poder mostrar "le toca a [nombre]" en su pantalla de espera.

**Límite explícito**: esto es privacidad a nivel de qué evento recibe cada socket, no
un mecanismo criptográfico — alguien con las devtools abiertas mirando el tráfico de
red de su propio celular técnicamente podría inspeccionar paquetes de otros eventos
igual (ningún socket ve el evento de otro, así que en la práctica no hay nada que
inspeccionar del lado de un jugador que no está en turno). Está más que a la altura de
un juego familiar presencial; no se resuelve con nada más fuerte.

## Pruebas

- **`turn-distribution.spec.ts`**: ver `game-selection/analysis.md`.
- **`trivia.service.spec.ts`** (instanciación directa, `RoomService`/`GameEngineService`
  reales, `vi.useFakeTimers()`, `AiContentService` con generador falso, `random` y
  `scheduler` inyectados a mano): arranca la partida y arma el orden de turnos
  correcto (equipos parejos e impares, incluido el ejemplo 2/3 de `spec.md`); primer
  turno se dirige solo a pantalla + jugador correspondiente; acierta → puntos fijos al
  equipo; no acierta o no responde a tiempo → 0 puntos, sin negativos; responder fuera
  de turno → `NotYourTurnError`; responder dos veces → `AlreadyAnsweredError`; índice
  fuera de rango → `InvalidAnswerIndexError`; sin partida activa →
  `NoTriviaMatchError`; socket ajeno a la sala → `PlayerNotInRoomError`; se agotan
  todos los turnos → `room.status = 'resultados'` y `trivia_match_result` con el
  puntaje final; menos de 2 equipos con jugadores → `NotEnoughTeamsError` (burbujea de
  `distributeTurns`); pausa de `TURN_TRANSITION_DELAY_MS` entre turnos (con el
  scheduler falso, se verifica que el siguiente turno no arranca antes de tiempo).
- **`test/trivia.e2e-spec.ts`** (sockets reales sobre `AppModule` completo, sin
  `ANTHROPIC_API_KEY` en CI): camino feliz de una partida corta (2 equipos de 1
  jugador cada uno, para no depender de temporizadores largos en CI) — `select_game` →
  `start_trivia_game` → el socket del jugador en turno recibe `trivia_turn_started`
  con la pregunta, el otro socket NO la recibe (solo `trivia_turn_waiting`) →
  `submit_trivia_answer` → `trivia_answer_accepted` → `trivia_turn_result` a ambos →
  se repite para el segundo jugador → `trivia_match_result` final. Y el caso "nadie
  responde a tiempo" (timer llega a cero sin `submit_trivia_answer`).

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción
explícita de `testing-strategy.md`). La tarea siguiente
(`specs/features/trivia-ui/analysis.md`) conecta esto a `/screen` y `/play`.
