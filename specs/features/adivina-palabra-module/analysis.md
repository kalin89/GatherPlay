# `AdivinaPalabraModule` (backend) — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). Depende de
`specs/features/ai-content-adivina-palabra/analysis.md`
(`AiContentService.getAdivinaPalabraWords`), `GameEngineModule` (solo para `addScore` —
ver más abajo por qué no se reusa más que eso) y `specs/features/game-selection/analysis.md`
(`distributeTurns`, `RoomState.currentGame`). Mismo patrón que
`specs/features/trivia-module/analysis.md`, adaptado a las diferencias de este juego
(turnos de 30s ritmados por el propio jugador, no por el servidor; pool de palabras a
nivel de partida completa, no por turno).

## Cómo encaja con `GameEngineService` (mismo razonamiento que Trivia)

Una partida de "Adivina la palabra" son varios turnos (rondas × tamaño del equipo más
grande, por equipo — ver "Reparto de turnos" en `spec.md`) dentro de una sola partida, y
`room.status` debe quedarse en `jugando` durante todos esos turnos, pasando a
`resultados` recién al terminar el último. Igual que Trivia, `AdivinaPalabraService`:

- Usa `RoundTimer` (`game-engine/round-timer.ts`) **directamente**, un temporizador por
  turno, sin pasar por `GameEngineService.startRound/endRound`.
- Muta `room.status`/`room.round` directamente sobre el objeto de
  `roomService.getRoomOrThrow(code)`, mismo patrón ya establecido.
- Sigue usando `gameEngine.addScore(code, teamId, puntos)` para el puntaje acumulado
  entre partidas (lo que se ve en el panel de selección de juego).
- Emite sus propios eventos por `AdivinaPalabraService.events$`, incluido un
  `room_state` propio para las mutaciones de `status`/`round`.

**Diferencia con Trivia**: no hay `TURN_TRANSITION_DELAY_MS` entre turnos. `spec.md`
pide explícitamente que la pantalla de resumen "permanezca así, hasta que el siguiente
Adivinador presione el botón Listo" — el avance entre turnos lo ritma un humano, no un
`setTimeout` del backend. Solo el paso "resultados de la partida → volver a selección
de juego" usa un temporizador de servidor (10s, igual que Trivia), porque ahí no hay
ninguna acción humana que lo dispare.

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "11. Adivina la palabra" y "Motor de sala" → "Reparto de
turnos entre jugadores de un equipo".

## Decisiones de esta iteración (confirmadas con Kalin)

- **3 rondas por jugador por defecto**: `ROUNDS_PER_PLAYER = 3` (constante local a este
  módulo — no se importa la de Trivia, mismo valor mantenido independiente para no
  acoplar dos minijuegos entre sí, constitution.md principio 4).
- **Duración del turno**: `ADIVINA_TURN_SECONDS = 30` (fijo, según `spec.md`).
- **Límite de pases**: `MAX_PASSES_PER_TURN = 3`. Al llegar al límite, el botón "Paso"
  se deshabilita en el cliente; el backend igual valida
  (`PassLimitReachedError`) por si algún cliente lo intenta de todas formas.
- **Pool de palabras por partida, no por turno**: se calculan
  `WORDS_PER_TURN_ESTIMATE = 15` palabras por turno como base de dimensionamiento, pero
  se piden **todas juntas al arrancar la partida** (`wordsNeeded = 15 × cantidad total
  de turnos`), nunca turno a turno — así se cumple "no llamadas cada vez que se cambie
  de palabra" sin necesidad de un fetch adicional a mitad de partida en el caso normal.
- **Dedup por sala, no por partida**: las palabras ya mostradas (adivinadas o pasadas)
  en cualquier partida anterior de este juego en la sala no se vuelven a pedir ni a
  mostrar mientras la sala exista. Las palabras que se pidieron para una partida pero
  **no llegaron a mostrarse** (turnos que terminaron antes de necesitarlas) vuelven al
  pool de la sala para poder usarse en la partida siguiente — no se descartan.
- **Sin pausa entre turnos**: ver sección anterior.
- **Resultado final de la partida**: puntaje obtenido **en esa partida** (no el
  acumulado entre partidas — mismo criterio que Trivia), más la lista de palabras
  adivinadas por cada equipo.
- **Volver sola a selección de juego a los 10s**: mismo mecanismo que
  `trivia-results-timeout/analysis.md`, pero incorporado directamente al diseño desde
  el inicio (no como tarea separada) — ya es un patrón establecido para "todos los
  juegos" (`spec.md`), no hace falta redescubrirlo.

## Diseño

Carpeta nueva `apps/backend/src/adivina-palabra/`.

### `adivina-palabra.types.ts`

```ts
export interface AdivinaTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  adivinadas: string[]; // verdes
  pasadas: string[]; // rojas, máximo MAX_PASSES_PER_TURN
  puntos: number; // = adivinadas.length
}

export type AdivinaPalabraEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | { type: 'adivina_turn_waiting'; code: string; playerId: string; playerName: string; teamId: string }
  | { type: 'adivina_pantalla_estado'; code: string; targetSocketIds: string[]; palabra: string | null; remainingSeconds: number; pasesRestantes: number }
  | { type: 'adivina_jugador_estado'; code: string; targetSocketIds: string[]; remainingSeconds: number; pasesRestantes: number }
  | { type: 'adivina_turn_result'; code: string; resultado: AdivinaTurnResult }
  | { type: 'adivina_match_result'; code: string; scores: TeamScore[]; palabrasPorEquipo: { teamId: string; palabras: string[] }[] };
```

`adivina_pantalla_estado` lleva la palabra (targetSocketIds = `${code}:screen`, ya
existe ese room de socket.io desde la tarea de Trivia — no hace falta wiring nuevo).
`adivina_jugador_estado` va solo al socket del Adivinador en turno y **nunca** incluye
la palabra — es el punto central de privacidad de este juego (más estricto que Trivia:
acá el jugador en turno no debe ver el contenido en ningún momento, ni siquiera el
propio). Ambos eventos se emiten tanto en cada tick del temporizador (cambia
`remainingSeconds`) como en cada "Adivinada"/"Paso" (cambia `palabra`/`pasesRestantes`).

### `adivina-palabra.service.ts`

**Estado persistente por sala** (sobrevive entre partidas, mientras la sala exista en
memoria — no hay limpieza de salas todavía, ver Fase 4 de `tasks.md`, mismo límite que
ya tiene el resto del sistema):

```ts
Map<code, { pool: string[]; used: Set<string> }>
```

**Estado de la partida en curso** (se borra al terminar la partida):

```ts
Map<code, {
  turns: TurnAssignment[];
  currentIndex: number;
  queue: string[]; // cola compartida de TODA la partida, no una por turno
  currentWord: string | null;
  passCount: number;
  guessed: string[];
  passed: string[];
  matchScores: Map<string, number>; // teamId -> puntos de esta partida
  matchWords: Map<string, string[]>; // teamId -> palabras adivinadas en esta partida
  timer: RoundTimer | null;
  phase: 'waiting_ready' | 'active';
}>
```

- **`startMatch(code)`**:
  1. `room = rooms.getRoomOrThrow(code)`.
  2. `turns = distributeTurns(room.teams, ROUNDS_PER_PLAYER)` — burbujea
     `NotEnoughTeamsError` si aplica.
  3. Si ya hay partida en curso en esa sala → `AdivinaMatchAlreadyRunningError`.
  4. `wordsNeeded = WORDS_PER_TURN_ESTIMATE * turns.length`.
  5. `await ensureWordSupply(code, wordsNeeded)` (privado): si el `pool` persistente de
     la sala tiene menos de `wordsNeeded`, pide a `aiContent.getAdivinaPalabraWords`
     el faltante, con `excluir = [...used, ...pool]` (para no repetir ni con lo ya
     usado ni con lo que ya está disponible sin usar). Puede pedirse en más de una
     llamada si el resultado no alcanza (mismo criterio de reintento acotado que ya
     documenta `ai-content-adivina-palabra/analysis.md` para el propio servicio de
     contenido — acá simplemente se vuelve a llamar si sigue faltando, con un tope de
     3 intentos antes de resignarse a arrancar con lo que haya, sin bloquear la
     partida indefinidamente).
  6. Saca `wordsNeeded` palabras al azar del `pool` de la sala (las remueve del pool,
     quedan "reservadas" para esta partida en `queue` — todavía no están en `used`).
  7. Inicializa el estado de partida: `currentIndex: 0`, `queue`, `currentWord: null`,
     `passCount: 0`, `guessed: []`, `passed: []`, `matchScores: new Map()`,
     `matchWords: new Map()`, `timer: null`, `phase: 'waiting_ready'`.
  8. `room.status = 'jugando'`, emite `room_state`.
  9. Emite `adivina_turn_waiting` para `turns[0]` (a toda la sala).
- **`markReady(code, socketId)`** ("Listo"):
  - Valida: partida activa (`NoAdivinaMatchError`), `phase === 'waiting_ready'`
    (si no, `TurnAlreadyStartedError`), el socket pertenece a la sala
    (`PlayerNotInRoomError`) y corresponde al jugador de `turns[currentIndex]`
    (`NotYourTurnError`).
  - Resetea `passCount`, `guessed`, `passed` a vacío/cero.
  - `currentWord = queue.shift() ?? null` (si `null`, ver "Palabras agotadas a mitad de
    partida" más abajo — caso límite).
  - `phase = 'active'`.
  - Arranca `RoundTimer(ADIVINA_TURN_SECONDS)`: `onTick` → emite estado (pantalla +
    jugador) con el `remainingSeconds` actualizado; `onEnd` → `resolveTurnEnd(code)`.
  - Resuelve `targetSocketIds`: pantalla = `${code}:screen`, jugador = el socket actual
    del jugador en turno.
  - Emite `adivina_pantalla_estado` (con `currentWord`) y `adivina_jugador_estado`
    (sin palabra, `pasesRestantes: MAX_PASSES_PER_TURN`).
- **`markGuessed(code, socketId)`** ("Adivinada"):
  - Valida: partida activa, `phase === 'active'`, socket = jugador en turno actual
    (`NotYourTurnError`), `currentWord !== null` (si no, `NoWordAvailableError`).
  - `guessed.push(currentWord)`; `used.add(currentWord)` (persistente, a nivel sala —
    esta palabra ya no se vuelve a mostrar nunca en esta sala).
  - `currentWord = queue.shift() ?? null`.
  - Emite `adivina_pantalla_estado`/`adivina_jugador_estado` actualizados (mismo
    `remainingSeconds` de la última tick, `pasesRestantes` sin cambios).
- **`markPassed(code, socketId)`** ("Paso"):
  - Mismas validaciones que `markGuessed`, más `passCount < MAX_PASSES_PER_TURN`
    (si no, `PassLimitReachedError`).
  - `passed.push(currentWord)`; `used.add(currentWord)` (se descarta definitivamente,
    no vuelve a la cola — confirmado con Kalin: al llegar al límite el botón se
    deshabilita, no se reinserta la palabra).
  - `passCount += 1`.
  - `currentWord = queue.shift() ?? null`.
  - Emite estado actualizado, `pasesRestantes = MAX_PASSES_PER_TURN - passCount`.
- **`resolveTurnEnd(code)`** (privado, llamado por `onEnd` del `RoundTimer`):
  - `puntos = guessed.length`; si `puntos > 0`, `gameEngine.addScore(code, teamId,
    puntos)` y se suma a `matchScores`.
  - `matchWords.get(teamId)` (o array nuevo) concatena `guessed`.
  - Si `currentWord !== null` en el momento del corte (el jugador no llegó a resolverla
    ni como acierto ni como paso), esa palabra se cuenta como **pasada** (roja): se
    agrega a `passed` y se marca `used` (se descarta definitivamente, mismo criterio
    que un "Paso" manual) — pero no cuenta contra `passCount`/`pasesRestantes`, ya que
    el límite de 3 es sobre pases voluntarios del jugador, no sobre el corte del
    temporizador.
  - Emite `adivina_turn_result` (a toda la sala) con el resumen del turno.
  - Si quedan turnos (`currentIndex + 1 < turns.length`): `currentIndex += 1`,
    `phase = 'waiting_ready'`, emite `adivina_turn_waiting` para el nuevo turno actual.
    Sin pausa — queda esperando que ese jugador presione "Listo".
  - Si no: `finishMatch(code)`.
- **`finishMatch(code)`** (privado):
  - `room.status = 'resultados'`, `room.round = null`, emite `room_state`.
  - Devuelve al `pool` persistente de la sala las palabras que quedaron en `queue` sin
    usarse en toda la partida (quedan disponibles para la próxima).
  - Emite `adivina_match_result` con `scores` armado desde `matchScores` (**no** desde
    `team.score` acumulado — mismo criterio que Trivia) y `palabrasPorEquipo` desde
    `matchWords`.
  - `scheduleReturnToSelection(code)`: con `this.scheduler` (inyectable, mismo patrón
    que Trivia para poder testear con fake timers), a los `RESULTS_DISPLAY_MS =
    10_000` busca la sala (`getRoom`, no `getRoomOrThrow` — corre dentro de un
    `setTimeout`), pone `room.currentGame = null` y emite `room_state`. No resetea
    `team.score` (acumulado entre partidas).
  - Borra el estado de la partida en curso (`Map` de partida). El estado persistente
    de palabras por sala (`pool`/`used`) **no** se toca — sigue vivo para la próxima
    partida de este juego en esta sala.

### Palabras agotadas a mitad de partida (caso límite, documentado)

Si un turno agota `queue` (más de 15 palabras usadas en promedio por turno a lo largo
de la partida — muy improbable con el margen elegido, pero posible), `currentWord`
queda en `null`: `adivina_pantalla_estado` muestra `palabra: null` (el frontend lo
traduce a "Sin más palabras — esperando el fin del turno") y `markGuessed`/
`markPassed` devuelven `NoWordAvailableError` hasta que se acabe el tiempo. No se hace
un fetch adicional en caliente a mitad de turno — decisión explícita para no violar
"nunca durante el temporizador" (constitution.md, principio 5) y porque el margen de
15 palabras/turno ya lo vuelve un caso de laboratorio, no algo esperable jugando.

### `adivina-palabra.gateway.ts`

- Cliente → servidor: `start_adivina_palabra_game { code }`, `adivina_ready { code }`,
  `adivina_guess { code }`, `adivina_pass { code }`.
- Servidor → cliente: reenvía `adivinaPalabra.events$` — `room_state`,
  `adivina_turn_waiting`, `adivina_turn_result`, `adivina_match_result` van a
  `server.to(code)` (toda la sala); `adivina_pantalla_estado`/`adivina_jugador_estado`
  van target por target (`event.targetSocketIds.forEach(id =>
  server.to(id).emit(...))`).

### `adivina-palabra.module.ts`

Importa `RoomModule`, `GameEngineModule`, `AiContentModule`; provee
`AdivinaPalabraService` + `AdivinaPalabraGateway`. Se agrega a `AppModule`.

### Cambios de wiring

- **`room.types.ts`**: `GameId` pasa de `'trivia'` a `'trivia' | 'adivina-palabra'`. Es
  el único cambio a `RoomModule` que pide esta tarea — no hace falta tocar
  `room.gateway.ts` (el join a `${code}:screen` ya existe, agregado por Trivia).

## Pruebas

- **`adivina-palabra.service.spec.ts`** (instanciación directa, `RoomService`/
  `GameEngineService` reales, `vi.useFakeTimers()`, `AiContentService` con generador
  falso inyectado, `random` y `scheduler` inyectados a mano): arranca la partida con
  el orden de turnos correcto (reusa los casos de `turn-distribution.spec.ts`);
  "Listo" fuera de turno → `NotYourTurnError`; "Listo" arranca el timer y revela la
  palabra solo a `${code}:screen`, nunca al jugador; "Adivinada" suma punto, marca la
  palabra como `used` a nivel sala, revela la siguiente; "Paso" no suma puntos, la
  descarta (`used`) y decrementa `pasesRestantes`; al cuarto intento de "Paso" →
  `PassLimitReachedError`; se acaba el tiempo con una palabra a medio mostrar → esa
  palabra aparece en `pasadas` (roja) y queda `used`, sin afectar `pasesRestantes`;
  se agotan todos los turnos → `room.status =
  'resultados'`, `adivina_match_result` con puntaje **de esa partida** y palabras por
  equipo; a los `RESULTS_DISPLAY_MS` (fake timers) → `currentGame` vuelve a `null` sin
  alterar el puntaje acumulado; **dos partidas seguidas en la misma sala**: la segunda
  partida no repite ninguna palabra ya usada por la primera, y reusa las que quedaron
  sin mostrarse en la primera antes de pedir más a la IA; menos de 2 equipos con
  jugadores → `NotEnoughTeamsError`.
- **`test/adivina-palabra.e2e-spec.ts`** (sockets reales sobre `AppModule` completo,
  sin `ANTHROPIC_API_KEY` en CI): camino feliz corto (2 equipos de 1 jugador cada uno)
  — `select_game` → `start_adivina_palabra_game` → `adivina_turn_waiting` → el jugador
  en turno emite `adivina_ready` → su propio socket recibe `adivina_jugador_estado`
  SIN palabra, el socket de pantalla recibe `adivina_pantalla_estado` CON palabra →
  `adivina_guess` → siguiente palabra → `adivina_pass` (hasta el límite, confirmar que
  un cuarto `adivina_pass` es rechazado) → tiempo se agota → `adivina_turn_result` →
  se repite para el segundo jugador → `adivina_match_result` final.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`). La tarea siguiente
(`specs/features/adivina-palabra-ui/analysis.md`) conecta esto a `/screen` y `/play`.
