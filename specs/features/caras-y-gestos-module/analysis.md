# `CarasYGestosModule` (backend) — Análisis técnico

Segunda de las tres tareas de "Mímica / Caras y Gestos" (ver `tasks.md`, Fase 3).
Depende de `specs/features/ai-content-gestos/analysis.md`
(`AiContentModule.getGestureWords`), `specs/features/game-selection/analysis.md`
(`distributeTurns`, `RoomState.currentGame`) y `GameEngineModule` (solo para
`addScore`, mismo criterio que `TriviaModule` — ver
`specs/features/trivia-module/analysis.md` → "Cómo encaja con `GameEngineService`").
Mismo patrón general que Trivia (turnos individuales, `RoundTimer` directo, mutación
directa de `room.status`/`room.currentGame`), con dos diferencias de forma de turno
que están detalladas abajo.

## Cómo se diferencia del turno de Trivia

En Trivia, un "turno" es una sola pregunta con un temporizador corto (15s) que arranca
apenas se emite el turno. Acá, un "turno" es el minuto completo de un jugador con 5
palabras adentro, y tiene un paso previo que Trivia no tiene: el jugador debe presionar
"Iniciar" en su celular antes de que arranque el temporizador de 60s — así tiene tiempo
de ubicarse frente a la pantalla. Por eso el turno tiene dos fases, no una:

1. **`waiting`**: se sabe quién tiene el turno, pero el temporizador no corrió todavía.
2. **`active`**: el jugador presionó "Iniciar" — corre el `RoundTimer` de 60s y hay una
   palabra activa en todo momento hasta que el turno termina.

`RoundTimer` (`game-engine/round-timer.ts`) se reusa igual que en Trivia, un timer por
turno — pero acá arranca en la transición `waiting → active` (evento `start_gestos_turn`
del cliente), no automáticamente al armar el turno.

## Privacidad de la palabra (más simple que en Trivia)

En Trivia, la pregunta debe llegar a la pantalla **y** al celular del jugador en turno,
pero a nadie más. Acá la palabra **nunca** llega a ningún celular — ni al del actor, que
la ve parado frente a la pantalla compartida (ver `spec.md`, criterio de "Iniciar"). Que
su propio equipo no la vea es una instrucción física (darle la espalda a la pantalla),
no algo que el software deba impedir — cualquiera en la sala podría técnicamente mirar
la pantalla compartida, es un dispositivo común a la vista de todos, igual que ya pasa
con el resto del juego.

Por eso todo evento que lleve la palabra (`gestos_turn_started`, `gestos_word_update`)
se manda **solo** a `screenRoomName(code)` (`room.gateway.ts`, ya existe, mismo helper
que usa Trivia) — nunca al socket del actor. El celular del actor recibe un evento
aparte, sin palabra, solo para saber que debe mostrar los botones "Adivinada"/"Paso".
El resto de los celulares (su equipo y el equipo contrario) reciben únicamente el
nombre + equipo del jugador en turno, igual que `trivia_turn_waiting`.

## Decisiones de esta iteración

**Confirmadas explícitamente con Kalin** (del requerimiento original o de preguntas
puntuales de esta sesión):

- **`ROUNDS_PER_PLAYER = 3`** (constante propia del módulo, mismo valor por defecto que
  Trivia pero no comparten la constante — cada minijuego es independiente,
  constitution.md principio 4).
- **`WORDS_PER_TURN = 5`**, **`TURN_SECONDS = 60`**, **`WORD_POINT = 1`** — fijos, según
  el requerimiento original.
- **El botón "Iniciar" arranca el minuto de inmediato** junto con la primera palabra —
  sin cuenta atrás de preparación previa.
- **`gestos_word_update` lleva `motivo: 'adivinada' | 'paso'` explícito** — el backend
  reenvía el mismo valor que mandó el cliente en `mark_gesture_word`, no hace falta que
  el frontend infiera nada.

**Valores por defecto que propongo, sin pedirle confirmación puntual a Kalin todavía**
(mismo criterio que ya usa Trivia para sus propias constantes equivalentes; se ajustan
sin costo si al jugar se sienten mal):

- **`TURN_TRANSITION_DELAY_MS = 2500`** y **`RESULTS_DISPLAY_MS = 10_000`** — mismos
  valores que Trivia (pausa controlada por el backend, constitution.md principio 3).
- **Tope de palabras por partida**: `MAX_WORDS_PER_MATCH = 100`. Si la partida necesita
  más (grupos grandes con muchas rondas), se completa reciclando palabras ya obtenidas
  para esta partida — nunca pidiendo de más a la IA sin límite. Mismo tipo de
  compromiso que ya acepta Trivia con `MAX_TRIVIA_QUESTIONS_PER_MATCH`.
- **`MAX_BATCH_ATTEMPTS = 4`** al armar el pool de palabras en varios lotes (ver
  `loadWordPoolAndStartFirstTurn` abajo).

## Diseño

Carpeta nueva `apps/backend/src/caras-y-gestos/`, mismo estilo que `trivia/`.

### `caras-y-gestos.types.ts`

```ts
export interface GestoTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  palabrasAdivinadas: string[];
  puntos: number;
  motivo: 'completado' | 'tiempo';
}

export type CarasYGestosEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | { type: 'gestos_turn_waiting'; code: string; playerId: string; playerName: string; teamId: string }
  | { type: 'gestos_turn_started'; code: string; targetSocketIds: string[]; playerId: string; playerName: string; palabra: string; durationSeconds: number; palabrasRestantes: number }
  | { type: 'gestos_actor_ready'; code: string; targetSocketId: string } // solo al celular del actor: mostrar Adivinada/Paso
  | { type: 'gestos_word_update'; code: string; targetSocketIds: string[]; palabra: string; palabrasRestantes: number; motivo: 'adivinada' | 'paso' }
  | { type: 'gestos_turn_tick'; code: string; targetSocketIds: string[]; remainingSeconds: number }
  | { type: 'gestos_turn_result'; code: string; resultado: GestoTurnResult }
  | { type: 'gestos_match_result'; code: string; scores: TeamScore[]; palabrasPorEquipo: Record<string, string[]> };
```

`targetSocketIds` en los eventos con palabra = `[screenRoomName(code)]` únicamente
(nunca el socket del actor — ver "Privacidad" arriba). `gestos_actor_ready` va solo al
socket del actor. `gestos_turn_waiting`/`gestos_turn_result`/`gestos_match_result` van a
toda la sala (`server.to(code)`), igual que sus equivalentes en Trivia.

### `caras-y-gestos.service.ts`

Estado en memoria: `Map<code, GestosMatchState>` con
`{ turns: TurnAssignment[], currentIndex: number, wordPool: string[], turnWords: string[] | null, phase: 'waiting' | 'active', timer: RoundTimer | null, guessedByTeam: Map<teamId, string[]>, matchScores: Map<teamId, number> }`.
Además, `Map<code, Set<string>>` separado (`usedWords`) que vive más allá de cada
partida individual — es lo que le da a `AiContentService.getGestureWords` la lista de
`excluir` (ver "Límite explícito" en `ai-content-gestos/analysis.md`).

- **`startMatch(code)`**:
  - `room = rooms.getRoomOrThrow(code)`. Si ya hay partida en curso →
    `GestosMatchAlreadyRunningError` (análogo a `TriviaMatchAlreadyRunningError`).
  - `turns = distributeTurns(room.teams, ROUNDS_PER_PLAYER)` (deja burbujear
    `NotEnoughTeamsError`, igual que Trivia).
  - `room.status = 'jugando'`, guarda estado inicial (`currentIndex: 0`, `wordPool: []`,
    `phase: 'waiting'`, sin turno arrancado todavía), emite `room_state`.
  - `void loadWordPoolAndStartFirstTurn(code, turns.length)`.
- **`loadWordPoolAndStartFirstTurn(code, totalTurns)`** (privado, async): calcula
  `totalWordsNeeded = Math.min(totalTurns * WORDS_PER_TURN, MAX_WORDS_PER_MATCH)`.
  Pide el pool en lotes (`getGestureWords` tope `MAX_GESTURE_WORDS_PER_REQUEST = 50` por
  pedido — ver `ai-content-gestos/analysis.md`), acumulando `excluir` = usadas de la
  sala + lo ya obtenido en este loop, hasta llegar a `totalWordsNeeded` o agotar
  `MAX_BATCH_ATTEMPTS` intentos (constante chica, ej. 4) — si el banco de respaldo está
  muy agotado, completa reciclando palabras ya obtenidas en este mismo pool antes que
  bloquear la partida. Guarda el pool en el estado, agrega todo lo obtenido a
  `usedWords.get(code)`, y llama a `emitTurnWaiting(code)` para el primer turno.
- **`emitTurnWaiting(code)`** (privado): identifica al jugador de `turns[currentIndex]`,
  emite `gestos_turn_waiting` a toda la sala (nombre + equipo). No toca el temporizador
  — queda en `phase: 'waiting'`.
- **`startTurn(code, socketId)`**: valida partida activa (`NoGestosMatchError`), jugador
  identificado por `socketId` (`PlayerNotInRoomError` si no está en la sala,
  `NotYourTurnError` si no es el jugador del turno actual), y `phase === 'waiting'`
  (`TurnAlreadyStartedError` si ya se presionó "Iniciar" — guarda contra doble tap).
  - Asigna las 5 palabras de este turno desde el pool (bloque
    `[currentIndex * WORDS_PER_TURN, ...)` módulo `pool.length`, mismo criterio de
    reciclado que Trivia con `currentIndex % questions.length` cuando el pool es más
    chico que lo necesario).
  - `phase = 'active'`, arma `RoundTimer` (`onTick` → `gestos_turn_tick` a
    `[screenRoomName(code)]`; `onEnd` → `resolveTurn(code, 'tiempo')`), lo arranca con
    `TURN_SECONDS`.
  - Emite `gestos_turn_started` (con la primera palabra, a `[screenRoomName(code)]`) y
    `gestos_actor_ready` (al socket del actor, sin palabra).
- **`markWord(code, socketId, resultado: 'adivinada' | 'paso')`**: valida partida
  activa, jugador = actor del turno actual (mismos errores que `startTurn`), y
  `phase === 'active'` (`TurnNotStartedError` si todavía no presionó "Iniciar").
  - `palabra = turnWords[0]` (la que está activa).
  - Si `'adivinada'`: `turnWords.shift()`, suma a `guessedByTeam` y `matchScores` de
    `turn.teamId`, `gameEngine.addScore(code, turn.teamId, WORD_POINT)`.
  - Si `'paso'`: `turnWords.push(turnWords.shift())` (la rota al final, sigue en la
    cola de este turno).
  - Si `turnWords.length === 0` (las 5 quedaron adivinadas): `resolveTurn(code,
    'completado')`.
  - Si no: emite `gestos_word_update` con `turnWords[0]`, `palabrasRestantes` y
    `motivo` (el mismo `resultado` recibido, `'adivinada' | 'paso'`, reenviado tal
    cual) a `[screenRoomName(code)]` — así la pantalla sabe qué sonido reproducir sin
    tener que inferirlo comparando estado anterior.
- **`resolveTurn(code, motivo)`** (privado): detiene el timer, arma `GestoTurnResult`
  (con `guessedByTeam` de este turno específico — no todo lo acumulado de la partida),
  emite `gestos_turn_result` a toda la sala. Con `scheduler` (mismo patrón inyectable
  que `TriviaService`, `TURN_TRANSITION_DELAY_MS`):
  - Si quedan turnos: `currentIndex++`, `phase = 'waiting'`, `emitTurnWaiting(code)`.
  - Si no: `finishMatch(code)`.
- **`finishMatch(code)`** (privado): `room.status = 'resultados'`, `room.round = null`,
  emite `room_state` y `gestos_match_result` con `scores` (desde `matchScores`, puntaje
  de esta partida únicamente, mismo criterio que Trivia) y `palabrasPorEquipo` (desde
  `guessedByTeam`, acumulado de toda la partida — ya no hay palabra "en juego" que
  proteger, por eso es seguro mandarlo a toda la sala en este punto). Borra el estado de
  la partida (`usedWords` del código de sala **no** se borra — sobrevive a la partida).
  Programa `scheduleReturnToSelection(code)` igual que Trivia (`RESULTS_DISPLAY_MS`,
  resetea `room.currentGame = null`).

### `caras-y-gestos.gateway.ts`

- Cliente → servidor: `start_gestos_game { code }`, `start_gestos_turn { code }`,
  `mark_gesture_word { code, resultado: 'adivinada' | 'paso' }`.
- Servidor → cliente: reenvía `events$` — `room_state`/`gestos_turn_waiting`/
  `gestos_turn_result`/`gestos_match_result` a `server.to(code)`; los que llevan
  `targetSocketIds` (`gestos_turn_started`, `gestos_word_update`, `gestos_turn_tick`)
  target por target, mismo patrón que `trivia.gateway.ts`; `gestos_actor_ready` directo
  a `targetSocketId`.

### `caras-y-gestos.module.ts`

Importa `RoomModule`, `GameEngineModule`, `AiContentModule`; provee
`CarasYGestosService` + `CarasYGestosGateway`. Se agrega a `AppModule`.

### Cambios de wiring

- `room.types.ts`: `GAME_IDS` pasa a `['trivia', 'caras-y-gestos'] as const`.
- Ninguno más — `client.join(screenRoomName(...))` ya existe desde `TriviaModule`, se
  reusa tal cual.

## Pruebas

- **`caras-y-gestos.service.spec.ts`** (instanciación directa, `RoomService`/
  `GameEngineService` reales, `vi.useFakeTimers()`, `AiContentService` con
  `getGestureWords` falso, `random` y `scheduler` inyectados a mano, mismo criterio que
  `trivia.service.spec.ts`): arranca la partida y arma el orden de turnos correcto
  (reusa los casos de `turn-distribution.spec.ts`); el turno no arranca su temporizador
  hasta `startTurn`; `startTurn` de alguien que no es el jugador del turno actual →
  `NotYourTurnError`; `startTurn` dos veces → `TurnAlreadyStartedError`; `markWord` antes
  de `startTurn` → `TurnNotStartedError`; "Adivinada" suma punto y avanza a la siguiente
  palabra; "Paso" pospone la palabra al final y no suma punto; las 5 palabras adivinadas
  antes de tiempo → termina el turno con 5 puntos sin esperar el timer; el timer llega a
  cero con solo N de 5 adivinadas → termina con N puntos, sin negativos; se agotan todos
  los turnos → `room.status = 'resultados'` y `gestos_match_result` con puntaje y
  palabras por equipo; menos de 2 equipos con jugadores → `NotEnoughTeamsError`; el pool
  de palabras respeta `excluir` de una partida anterior en la misma sala (mock de
  `getGestureWords` capturando el argumento).
- **`test/caras-y-gestos.e2e-spec.ts`** (sockets reales sobre `AppModule` completo, sin
  `ANTHROPIC_API_KEY`): camino feliz con 2 equipos de 1 jugador cada uno —
  `select_game` → `start_gestos_game` → el socket de pantalla recibe
  `gestos_turn_waiting`, el socket del jugador NO recibe ninguna palabra → el jugador
  emite `start_gestos_turn` → solo el socket de pantalla recibe `gestos_turn_started`
  con la palabra, el jugador recibe `gestos_actor_ready` sin palabra → `mark_gesture_word
  'adivinada'` × 5 → turno termina por `'completado'` sin esperar el timer → se repite
  para el segundo jugador → `gestos_match_result` final. Y el caso "se acaba el tiempo
  con palabras pendientes".

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`). `specs/features/caras-y-gestos-ui/analysis.md` conecta esto a
`/screen` y `/play`.
