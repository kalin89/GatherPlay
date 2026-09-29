# `MemorizaObjetosModule` (backend) — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). Depende de
`specs/features/memoriza-objetos-content/analysis.md`
(`MemorizaObjetosContentService.selectObjects`), `GameEngineModule` (solo para
`addScore`) y `specs/features/game-selection/analysis.md` (`RoomState.currentGame`).
**También depende de `specs/features/la-rocola-module/analysis.md`** (utilidad
`game-engine/ready-gate.ts` → clase `ReadyGate`, convención de "instrucciones +
Listo") **y de `specs/features/la-rocola-ui/analysis.md`** (componentes genéricos de
pantalla — ver `memoriza-objetos-ui/analysis.md`) — ya mergeadas a `main` (PR de "La
Rocola"), así que esta tarea reusa esas piezas tal cual en vez de reinventarlas (mismo
criterio que pide `feedback-game-screen-convention` en la memoria del proyecto).

No usa `distributeTurns` (`game-engine/turn-distribution.ts`) — ese helper arma un
array fijo de turnos para "rondas × tamaño del equipo más grande", pensado para
partidas con un número de turnos conocido de antemano. Acá el número de turnos no se
puede calcular al arrancar (lo corta el reloj de cada equipo o que se adivinen los 20
objetos) — el reparto de turnos es un cursor cíclico por equipo, diseñado desde cero
en este módulo (ver "Reparto de turnos" más abajo).

## Cómo encaja con `GameEngineService`

Mismo patrón que el resto de los minijuegos de Fase 3: `MemorizaObjetosService` muta
`room.status`/`room.currentGame` directamente sobre el objeto de
`roomService.getRoomOrThrow(code)`, usa temporizadores propios (no
`GameEngineService.startRound/endRound`), y sigue usando
`gameEngine.addScore(code, teamId, puntos)` para el puntaje acumulado entre partidas.
Emite sus propios eventos por `MemorizaObjetosService.events$`.

`room.status` pasa a `'jugando'` en cuanto se arma el tablero (`start_memoriza_objetos_game`,
disparado por el frontend apenas monta la vista de este juego — ver "Selección
temprana y precarga" más abajo), incluso durante la fase de espera de "Listo". Pasa a
`'resultados'` recién al terminar la partida (ambos relojes en cero, o las 20 palabras
reveladas).

## Selección temprana y precarga (spec.md, punto 1 de esta sección)

El tablero completo (20 objetos, cada uno con su imagen, su palabra y qué letra va a
quedar visible) se arma en `startMatch`, disparado por `start_memoriza_objetos_game` —
el frontend emite este evento apenas monta la vista del juego tras `select_game`, sin
esperar ninguna acción extra del host (mismo criterio que `AdivinaPalabraModule`: no
hay un botón "Empezar" intermedio, a diferencia de "La Rocola" que sí lo tiene por su
selector de filtro). Esto es lo que satisface "todo debe estar precargado desde que se
hace click en el juego en el panel de lista" sin necesidad de ningún evento ni estado
nuevo en `RoomModule`: el tablero (con las 20 `imagenUrl`) llega a la pantalla dentro
de la fase `waiting_ready`, **antes** de que arranque "Pon Mucha Atención" — el
frontend usa ese margen (mientras se espera que todos presionen "Listo") para precargar
las imágenes en el navegador. Ver `memoriza-objetos-ui/analysis.md` para el mecanismo
de precarga del lado del cliente.

## `game-engine/ready-gate.ts` (reusada, no se reescribe)

Ya existe desde `la-rocola-module` (ver dependencia arriba). `MemorizaObjetosService`
la instancia con los jugadores con equipo asignado al momento de `startMatch`, igual
que `LaRocolaService`.

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "10. Memoriza los objetos en la imagen" y
"Convenciones de toda pantalla de juego".

## Decisiones de esta iteración (confirmadas con Kalin)

- **20 objetos fijos por partida** (`OBJECTS_PER_MATCH`, constante compartida con
  `memoriza-objetos-content`), no un rango variable.
- **Fase de memorización muestra solo el ícono, nunca la palabra** — la palabra recién
  se insinúa (una letra) en la fase de adivinanza.
- **Un solo intento por turno**: "Enviar" (acierte o no) o "Pasar" terminan el turno de
  inmediato — no hay reintentos dentro del mismo turno.
- **Comparación de texto tolerante a errores de tipeo, sin IA**: se reusa
  `isFuzzyMatch` de `apps/backend/src/la-rocola/answer-matcher.ts` (ver
  `la-rocola-module/analysis.md`) — la función ya soporta comparar contra un "título"
  de una sola palabra clave (el caso de este juego es más simple que un título de
  canción de varias palabras). Se importa tal cual, sin copiar el archivo — es una
  función pura sin dependencias de `la-rocola`, mover/duplicar violaría
  `constitution.md` principio 4 sin necesidad.
- **Botón "Pasar" habilitado a los 10 segundos** de empezado el turno del jugador
  activo — antes de eso solo existe "Enviar" (deshabilitado con el campo vacío).
- **Reloj tipo "reloj de ajedrez"**: cada equipo arranca con 90 segundos (1:30). Solo
  corre el reloj del equipo con el turno activo; se detiene al Enviar/Pasar y arranca
  el del equipo contrario (o sigue con el mismo equipo si el contrario ya está en
  cero — ver "Caso límite: un equipo se queda sin tiempo").
- **Letra revelada por palabra**: se elige al azar (inicio / medio / final) una sola
  vez por palabra, al armar el tablero en `startMatch` — se mantiene fija toda la
  partida, independientemente de en qué turno se intente adivinar.
- **Interpretación del ejemplo del requerimiento original** ("M_ _ _ _ _ _ (7
  Palabras)"): se interpreta como cantidad de **letras**, no de palabras — cada objeto
  del tablero es una sola palabra, así que "7 palabras" no tendría sentido ahí. Se
  documenta como asunción explícita por si Kalin quiso decir otra cosa.
- **Equipo que arranca la partida**: al azar, mismo criterio que Trivia / Caras y
  Gestos / Adivina la palabra.
- **Reparto de turnos dentro de un equipo**: cíclico (round robin) sobre la lista de
  integrantes del equipo, repitiéndola tantas veces como haga falta — no hay un número
  fijo de turnos por jugador.
- **Dedup de objetos por sala**: igual criterio que Adivina la palabra — objetos ya
  usados en cualquier partida anterior de este juego en la sala no se repiten mientras
  la sala exista, salvo que el banco se agote (ver `memoriza-objetos-content/analysis.md`).
- **Resultado final**: puntaje obtenido **en esa partida** (no el acumulado entre
  partidas), más qué equipo adivinó cada palabra.
- **Volver sola a selección de juego a los 10s** — mismo mecanismo que
  `trivia-results-timeout/analysis.md`, incorporado desde el diseño inicial.

## Diseño

Carpeta nueva `apps/backend/src/memoriza-objetos/`.

### `memoriza-objetos.types.ts`

```ts
export type LetraPosicion = 'inicio' | 'medio' | 'fin';

export interface MemorizaBoardItem {
  id: string; // = MemorizaObjetosBankEntry.id
  palabra: string;
  imagenUrl: string;
  letraIndex: number; // índice (0-based) de la letra visible dentro de `palabra`
  estado: 'oculta' | 'revelada';
  equipoQueAcerto: string | null; // teamId, solo si estado === 'revelada'
}

export interface MemorizaTeamClock {
  teamId: string;
  remainingSeconds: number; // arranca en TEAM_CLOCK_SECONDS = 90
}

export const OBJECTS_PER_MATCH = 20; // = memoriza-objetos-content.OBJECTS_PER_MATCH
export const ATTENTION_SECONDS = 5;
export const MEMORIZE_SECONDS = 30;
export const TEAM_CLOCK_SECONDS = 90;
export const PASS_UNLOCK_SECONDS = 10;

export type MemorizaObjetosEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | { type: 'memoriza_waiting_ready'; code: string; readyPlayerIds: string[]; eligiblePlayerIds: string[] }
  | { type: 'memoriza_pon_atencion'; code: string; remainingSeconds: number }
  | { type: 'memoriza_memorizando'; code: string; items: { id: string; imagenUrl: string }[]; remainingSeconds: number }
  | {
      type: 'memoriza_tablero';
      code: string;
      items: Omit<MemorizaBoardItem, 'letraIndex'> & { pista: string }[]; // "pista" = patrón con blanks, ej. "M _ _ _ _ _ _"
      clocks: MemorizaTeamClock[];
      equipoActivoId: string | null;
      jugadorActivo: { teamId: string; playerId: string; playerName: string } | null;
      turnNumber: number; // sube una sola vez por turno en `startTurn`, ver más abajo
    }
  | {
      type: 'memoriza_turno_jugador';
      code: string;
      targetSocketId: string;
      remainingSeconds: number; // = reloj del equipo activo, mismo valor que ve la pantalla
      puedePasar: boolean;
    }
  | { type: 'memoriza_intento_resultado'; code: string; teamId: string; acierto: boolean; palabra: string | null }
  | { type: 'memoriza_match_result'; code: string; scores: TeamScore[]; palabrasPorEquipo: { teamId: string; palabras: string[] }[]; items: MemorizaBoardItemPublic[] };
```

`memoriza_tablero` va a `${code}:screen` y también a todos los jugadores en espera
(sirve como estado compartido de "qué se ve" — nunca expone `letraIndex` crudo, ya
viene resuelto como `pista`, la cadena de blanks + letra visible). `memoriza_turno_jugador`
va únicamente al socket del jugador activo — es la única fuente de verdad de
`remainingSeconds` fino y de si "Pasar" ya está habilitado (`puedePasar`); reusa el
mismo `remainingSeconds` que ya viaja en `memoriza_tablero` para el reloj del equipo
activo, así que la pantalla y el celular del jugador activo siempre están en sync.

`turnNumber` (`MemorizaMatchState.turnNumber`, arranca en 0 y se incrementa en
`startTurn`, antes de crear el `RoundTimer` del turno) es lo que le permite al celular
del jugador activo distinguir un turno nuevo de uno que sigue. `memoriza_tablero` se
reemite en cada tick de 1 segundo (para refrescar `clocks`), así que no alcanza con un
nonce generado del lado del cliente cada vez que llega el evento — remontaría el
formulario de respuesta cada segundo y borraría lo que el jugador está escribiendo.
`turnNumber` en cambio solo cambia cuando `startTurn` corre de nuevo, incluso en el caso
"sin alternar" de más abajo, donde `activeTeamId`/`activePlayerId` no cambian porque el
mismo equipo (a veces el mismo jugador) repite turno.

### `memoriza-objetos.service.ts`

**Estado persistente por sala** (sobrevive entre partidas, mientras la sala exista en
memoria):

```ts
Map<code, { used: Set<string> }> // ids de objetos ya mostrados en esta sala
```

**Estado de la partida en curso** (se borra al terminar la partida):

```ts
Map<code, {
  items: MemorizaBoardItem[]; // 20, orden fijo para toda la partida
  teamMembers: Map<string, string[]>; // teamId -> playerIds, orden de asignación al equipo
  turnCursor: Map<string, number>; // teamId -> índice del próximo integrante
  clocks: Map<string, number>; // teamId -> remainingSeconds
  eliminated: Set<string>; // equipos cuyo reloj llegó a 0
  activeTeamId: string | null;
  activePlayerId: string | null;
  turnStartRemaining: number; // remainingSeconds del equipo activo al empezar ESTE turno (para PASS_UNLOCK_SECONDS)
  matchScores: Map<string, number>;
  matchWords: Map<string, string[]>;
  ticker: NodeJS.Timeout | null; // un solo intervalo de 1s, mueve el reloj del equipo activo
  readyGate: ReadyGate;
  phase: 'waiting_ready' | 'pon_atencion' | 'memorizando' | 'adivinando';
}>
```

Un solo `ticker` global por partida (no un `RoundTimer` por fase) porque el reloj que
tiene que descontar cambia de equipo activo turno a turno sin reiniciarse — más simple
manejarlo como un intervalo que cada segundo resta 1 a `clocks.get(activeTeamId)` y
emite, que estar creando/destruyendo instancias de `RoundTimer` por turno. Las fases
`pon_atencion` y `memorizando` sí usan un `RoundTimer` (`game-engine/round-timer.ts`)
normal, con duración fija — solo la fase `adivinando` usa el `ticker` de reloj de
equipo.

- **`startMatch(code)`**:
  1. `room = rooms.getRoomOrThrow(code)`.
  2. Si ya hay partida en curso en esa sala → `MemorizaMatchAlreadyRunningError`.
  3. `teams = room.teams.filter(t => t.playerIds.length > 0)`; si `teams.length < 2` →
     `NotEnoughTeamsError` (mismo criterio que el resto de los juegos por equipos).
  4. `objects = memorizaContent.selectObjects(OBJECTS_PER_MATCH, [...roomPool.used])`.
  5. Arma `items`: por cada objeto, elige `letraPosicion` al azar (`random`
     inyectado) → `letraIndex` (`inicio` → 0; `fin` → `palabra.length - 1`; `medio` →
     `Math.floor((palabra.length - 1) / 2)`), `estado: 'oculta'`,
     `equipoQueAcerto: null`.
  6. `teamMembers`/`turnCursor` inicializados desde `teams` (orden = `team.playerIds`
     tal cual). `clocks` = `TEAM_CLOCK_SECONDS` para cada equipo. `eliminated` vacío.
  7. `readyGate = new ReadyGate(room.players.filter(p => p.equipoAsignado).map(p => p.id))`
     (mismo criterio que `LaRocolaService`).
  8. `room.status = 'jugando'`, emite `room_state`.
  9. `phase = 'waiting_ready'`, emite `memoriza_waiting_ready` y `memoriza_tablero`
     (con las 20 imágenes, sin ninguna letra revelada todavía en la UI — ver
     `memoriza-objetos-ui/analysis.md` para por qué el tablero de imágenes viaja acá
     igual, para precarga, aunque la fase visual "memorizando" recién arranque
     después).
- **`markReady(code, socketId)`** ("Listo"):
  - Valida partida activa, socket pertenece a la sala, jugador elegible según
    `readyGate.eligiblePlayerIds`.
  - `readyGate.markReady(playerId)`; si `!readyGate.isSatisfied`, no pasa nada más
    (se re-emite `memoriza_waiting_ready` con el conteo actualizado).
  - Si `isSatisfied`: arranca `beginAttentionPhase(code)`.
- **`beginAttentionPhase(code)`** (privado):
  - `phase = 'pon_atencion'`.
  - `RoundTimer(ATTENTION_SECONDS)`: `onTick` → emite `memoriza_pon_atencion`;
    `onEnd` → `beginMemorizePhase(code)`.
- **`beginMemorizePhase(code)`** (privado):
  - `phase = 'memorizando'`.
  - `RoundTimer(MEMORIZE_SECONDS)`: `onTick` → emite `memoriza_memorizando` (con
    `items.map(i => ({ id: i.id, imagenUrl: i.imagenUrl }))`, sin palabra);
    `onEnd` → `beginGuessingPhase(code)`.
- **`beginGuessingPhase(code)`** (privado):
  - `phase = 'adivinando'`.
  - `activeTeamId` = equipo elegido al azar entre `teamMembers.keys()`.
  - `startTurn(code)`.
- **`startTurn(code)`** (privado):
  - `activePlayerId` = `teamMembers.get(activeTeamId)[turnCursor.get(activeTeamId)]`;
    avanza el cursor de ese equipo con wraparound
    (`(cursor + 1) % teamMembers.get(activeTeamId).length`).
  - `turnStartRemaining = clocks.get(activeTeamId)`.
  - Arranca (o retoma) el `ticker`: cada 1000ms, `clocks.set(activeTeamId,
    clocks.get(activeTeamId) - 1)`; si llega a 0 → `eliminated.add(activeTeamId)`,
    `resolveTurnEnd(code, { auto: true })`; si no, emite `memoriza_tablero` (clocks
    actualizados) y `memoriza_turno_jugador` (con `remainingSeconds` = reloj del
    equipo activo y `puedePasar = (turnStartRemaining - remaining) >= PASS_UNLOCK_SECONDS`).
  - Emite el estado inicial del turno de inmediato (antes del primer tick), igual
    patrón que `AdivinaPalabraService.markReady`.
- **`submitGuess(code, socketId, texto)`** ("Enviar"):
  - Valida: partida activa, `phase === 'adivinando'`, socket = jugador activo
    (`NotYourTurnError`), `texto` no vacío tras `trim()` (`EmptyGuessError`).
  - Busca el primer `item` con `estado === 'oculta'` tal que
    `isFuzzyMatch(texto, item.palabra)` (reusa `answer-matcher.ts` de `la-rocola`).
  - Si hay match: `item.estado = 'revelada'`, `item.equipoQueAcerto = activeTeamId`,
    `gameEngine.addScore(code, activeTeamId, 1)`, `matchScores`/`matchWords`
    actualizados, emite `memoriza_intento_resultado` con `acierto: true`.
  - Si no hay match: emite `memoriza_intento_resultado` con `acierto: false`,
    `palabra: null`.
  - En ambos casos: `resolveTurnEnd(code, { auto: false })`.
- **`passTurn(code, socketId)`** ("Pasar"):
  - Valida partida activa, `phase === 'adivinando'`, socket = jugador activo, y
    `(turnStartRemaining - clocks.get(activeTeamId)) >= PASS_UNLOCK_SECONDS`
    (`PassNotAvailableYetError` si no).
  - `resolveTurnEnd(code, { auto: false })` (sin emitir `memoriza_intento_resultado` —
    no hubo intento).
- **`resolveTurnEnd(code, { auto })`** (privado; `auto = true` cuando lo dispara el
  `ticker` al llegar a 0, `false` cuando lo dispara Enviar/Pasar):
  1. Si `items.every(i => i.estado === 'revelada')` → `finishMatch(code)`, listo.
  2. Determina el próximo equipo activo:
     - El equipo que **no** acaba de jugar (`otherTeamId`), si
       `!eliminated.has(otherTeamId)` → `activeTeamId = otherTeamId`.
     - Si no (el contrario ya está `eliminated`), y el propio `activeTeamId` tampoco
       está `eliminated` (todavía tiene tiempo) → se mantiene `activeTeamId` sin
       cambiar (caso límite: "el equipo con tiempo sigue jugando solo").
     - Si ambos equipos están `eliminated` → `finishMatch(code)`, listo (cubre el caso
       de que el propio `auto: true` haya dejado a los dos equipos en cero, si el
       reparto de turnos alguna vez lo permite con más de 2 equipos — ver "Nota:
       más de 2 equipos", abajo).
  3. Si no terminó: `startTurn(code)`.
- **`finishMatch(code)`** (privado):
  - `room.status = 'resultados'`, `room.round = null`, emite `room_state`.
  - **Revela lo que quedó sin adivinar** (iteración 2026-09-28, pedido de Kalin tras
    jugar la partida): cualquier `item` que siga `estado === 'oculta'` pasa a
    `'revelada'` (sin tocar `equipoQueAcerto`, que se queda en `null` — así el
    frontend lo pinta neutro, distinto del color de un equipo que sí acertó).
  - Emite `memoriza_match_result` con `scores` desde `matchScores` (no desde
    `team.score` acumulado), `palabrasPorEquipo` desde `matchWords`, y `items` con el
    tablero completo ya revelado (`this.toPublicItems(match.items)` — mismo helper
    privado que usa `emitTablero`, extraído para no duplicar el mapeo).
  - Agrega los `id` de los 20 `items` de esta partida al `used` persistente de la sala.
  - `scheduleReturnToSelection(code)` — mismo mecanismo (`this.scheduler`,
    `RESULTS_DISPLAY_MS = 10_000`) que `AdivinaPalabraService.finishMatch`.
  - Borra el estado de la partida en curso (el `Map` de partida; detiene el `ticker` y
    cualquier `RoundTimer` activo si quedó alguno).

### Caso límite: un equipo se queda sin tiempo

Cubierto en el paso 2 de `resolveTurnEnd` de arriba — no necesita estado adicional más
allá del `Set<string> eliminated`: una vez que un equipo entra ahí, `resolveTurnEnd`
nunca vuelve a asignárselo el turno, así que el equipo restante encadena sus propios
turnos sin que el reloj del eliminado vuelva a correr ni a "pausar" nada.

### Nota: más de 2 equipos

`spec.md` describe el juego pensado para 2 equipos ("reloj de ajedrez"), pero el motor
de sala permite más. Con 3+ equipos, la alternancia de `resolveTurnEnd` usa
`otherTeamId` = el **siguiente** equipo no eliminado en el orden de `teamMembers`
(round robin entre equipos, no solo ping-pong entre dos) — mismo espíritu que "pasa al
equipo contrario" generalizado. No se pidió explícitamente a Kalin este caso porque
`spec.md` está redactado en términos de dos equipos; se documenta como extensión
razonable, no como comportamiento a confirmar antes de escribir código (bajo impacto,
mismo criterio de `feedback-game-design-workflow`).

### `memoriza-objetos.gateway.ts`

- Cliente → servidor: `start_memoriza_objetos_game { code }`, `memoriza_ready { code }`,
  `memoriza_submit_guess { code; texto }`, `memoriza_pass { code }`.
- Servidor → cliente: reenvía `memorizaObjetos.events$` — `room_state`,
  `memoriza_waiting_ready`, `memoriza_tablero`, `memoriza_intento_resultado`,
  `memoriza_match_result` van a `server.to(code)` (toda la sala); `memoriza_pon_atencion`/
  `memoriza_memorizando` también van a toda la sala (son de la pantalla, pero no hay
  problema en que los celulares los reciban, solo no los usan);
  `memoriza_turno_jugador` va únicamente a `event.targetSocketId`.

### `memoriza-objetos.module.ts`

Importa `RoomModule`, `GameEngineModule`, `MemorizaObjetosContentModule`, y el módulo
donde viva `ReadyGate`/`answer-matcher.ts` reusadas (o directamente sus archivos, si
`ready-gate.ts` termina viviendo en `game-engine/` como utilidad sin módulo propio,
igual que `round-timer.ts`). Provee `MemorizaObjetosService` + `MemorizaObjetosGateway`.
Se agrega a `AppModule`.

### Cambios de wiring

- **`room.types.ts`**: `GAME_IDS` gana `'memoriza-objetos'`.

## Pruebas

- **`memoriza-objetos.service.spec.ts`** (instanciación directa, `RoomService`/
  `GameEngineService` reales, `vi.useFakeTimers()`, `MemorizaObjetosContentService`
  con banco falso inyectado, `random` y `scheduler` inyectados a mano):
  - Arranca la partida con 20 objetos, `phase: 'waiting_ready'`, sin revelar nada.
  - Menos de 2 equipos con jugadores → `NotEnoughTeamsError`.
  - `markReady` de todos los elegibles → dispara "Pon Mucha Atención" (5s) → fase
    "memorizando" (30s, sin palabra en el evento) → fase "adivinando" con ambos
    relojes en 90.
  - "Enviar" fuera de turno → `NotYourTurnError`.
  - "Enviar" con el texto correcto (incluido un typo tolerable, ej. "manzna") → revela
    la palabra con el equipo correcto, suma 1 punto, detiene el reloj del equipo
    activo, pasa el turno al equipo contrario con su propio reloj corriendo.
  - "Enviar" con texto que no matchea ninguna palabra pendiente → no revela nada, no
    suma puntos, igual pasa el turno.
  - "Pasar" antes de los 10 segundos del turno → `PassNotAvailableYetError`.
  - "Pasar" después de los 10 segundos → pasa el turno sin revelar nada.
  - El reloj del equipo activo llega a 0 a mitad de turno (fake timers) → el turno
    termina automáticamente y pasa al equipo contrario si tiene tiempo.
  - Un equipo llega a 0 y el otro sigue con tiempo → los turnos siguientes son todos
    del equipo con tiempo, alternando entre sus propios integrantes, sin que el reloj
    del equipo en 0 se vuelva a tocar.
  - Ambos relojes llegan a 0 → `finishMatch`, `room.status = 'resultados'`.
  - Se revelan las 20 palabras antes de que se acaben los relojes → `finishMatch` de
    inmediato, sin esperar a que los relojes lleguen a 0.
  - `memoriza_match_result` trae el puntaje **de esta partida**, no el acumulado.
  - A los `RESULTS_DISPLAY_MS` (fake timers) → `currentGame` vuelve a `null`.
  - **Dos partidas seguidas en la misma sala**: la segunda no repite ningún objeto
    usado por la primera mientras el banco alcance.
  - El reparto de turnos dentro de un equipo cicla correctamente al agotar la lista de
    integrantes (vuelve al primero).
- **`test/memoriza-objetos.e2e-spec.ts`** (sockets reales sobre `AppModule` completo):
  camino feliz corto (2 equipos de 1 jugador cada uno, banco de contenido reducido
  para la prueba) — `select_game` → `start_memoriza_objetos_game` →
  `memoriza_waiting_ready` → ambos jugadores emiten `memoriza_ready` →
  `memoriza_pon_atencion` (5 ticks) → `memoriza_memorizando` (imágenes sin palabra) →
  `memoriza_tablero` con relojes en 90 → el jugador activo recibe
  `memoriza_turno_jugador` → `memoriza_submit_guess` con la palabra correcta →
  `memoriza_intento_resultado` con `acierto: true` → el turno pasa al otro jugador →
  se repite hasta que se acaban los relojes o las 20 palabras → `memoriza_match_result`.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción
explícita de `testing-strategy.md`). La tarea siguiente
(`specs/features/memoriza-objetos-ui/analysis.md`) conecta esto a `/screen` y `/play`.
