# `LaRocolaModule` (backend) — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). Depende de
`specs/features/rocola-content/analysis.md` (`RocolaContentService.selectSongs`),
`GameEngineModule` (solo para `addScore`, mismo criterio que los demás minijuegos) y
`specs/features/game-selection/analysis.md` (`RoomState.currentGame`). No usa
`distributeTurns` — este juego no reparte turnos individuales, es buzzer libre entre
todos los jugadores conectados.

Esta tarea también construye, por primera vez, la mitad backend de la **convención de
pantalla de juego** (`spec.md` → "Convenciones de toda pantalla de juego"):
instrucciones + "Listo" de todos antes de arrancar. Se hace acá porque es el primer
juego nuevo desde que se acordó la convención — la utilidad queda genérica
(`ReadyGate`) para que la tarea de `tasks.md` "Adaptar Trivia, Caras y Gestos y Adivina
la palabra a las convenciones de pantalla de juego" la reuse sin tener que
reinventarla.

## Cómo encaja con `GameEngineService`

Mismo patrón que `AdivinaPalabraService`/`CarasYGestosService`: `LaRocolaService`
muta `room.status`/`room.currentGame` directamente sobre el objeto de
`roomService.getRoomOrThrow(code)`, usa `RoundTimer` directo (no
`GameEngineService.startRound/endRound`) y sigue usando `gameEngine.addScore` para el
puntaje acumulado entre partidas. Emite sus propios eventos por
`LaRocolaService.events$`.

`room.status` pasa a `'jugando'` en cuanto se pide arrancar el juego (`start_la_rocola_game`),
incluso durante la fase de espera de "Listo" — mismo criterio que
`AdivinaPalabraService.startMatch` (que ya pone `status: 'jugando'` antes de que el
primer jugador presione su propio "Listo" de turno). `room.status` pasa a
`'resultados'` recién al terminar la décima ronda.

## `game-engine/ready-gate.ts` (utilidad nueva, genérica)

Vive en `game-engine/` junto a `round-timer.ts`/`turn-distribution.ts` — utilidad pura,
sin dependencia de `RoomState` ni de sockets, reusable por cualquier minijuego que
necesite el gate de "Listo" de la convención.

```ts
export class ReadyGate {
  private readonly ready = new Set<string>();

  constructor(private eligiblePlayerIds: string[]) {}

  markReady(playerId: string): void {
    this.ready.add(playerId);
  }

  removePlayer(playerId: string): void {
    this.ready.delete(playerId);
    this.eligiblePlayerIds = this.eligiblePlayerIds.filter((id) => id !== playerId);
  }

  get readyPlayerIds(): string[] {
    return [...this.ready];
  }

  get eligiblePlayerIds(): string[] {
    return [...this.eligiblePlayerIds];
  }

  get isSatisfied(): boolean {
    return (
      this.eligiblePlayerIds.length > 0 &&
      this.eligiblePlayerIds.every((id) => this.ready.has(id))
    );
  }
}
```

- `eligiblePlayerIds` se fija una sola vez, al construirse (jugadores con equipo
  asignado en el momento de arrancar el juego) — un jugador que se une **después** no
  se agrega a la lista de pendientes (documentado como asunción de esta iteración, la
  convención ya asume que el armado de equipos terminó antes de elegir juego).
  `removePlayer` cubre la desconexión de alguien que ya estaba en la lista.
- `isSatisfied` con lista vacía es `false` a propósito (no hay nadie con quien jugar).

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "8. La Rocola" y "Convenciones de toda pantalla de
juego".

## Decisiones de esta iteración (confirmadas con Kalin)

- **Nombre del juego se mantiene "La Rocola"** (`GameId = 'la-rocola'`), aunque el
  texto que ve la pantalla al arrancar cada ronda dice "Adivina la canción" (pedido
  explícito de `spec.md` punto 1).
- **Al presionar "¡Me la sé!" la canción se pausa**; si hay robo de punto, **se reanuda**
  desde donde iba (no vuelve a sonar desde el principio). El estado de reproducción
  (posición exacta) lo mantiene el elemento `<audio>` del cliente de pantalla — el
  backend solo manda comandos `play`/`pause`/`resume`, nunca una posición en segundos.
- **Revelación al final de cada ronda** (con o sin punto otorgado): título, artista y
  portada, ~4 segundos, antes de la ronda siguiente.
- **Robo de punto abierto a todos los equipos rivales** (no solo a "el equipo
  contrario" en singular) cuando hay más de 2 equipos — el texto de pantalla lista los
  nombres de todos los equipos con chance.
- **Sin buzz de nadie** (ni en la canción ni en el robo) termina la ronda sin puntos,
  igual que una respuesta incorrecta — no hay reintento adicional.
- **Sin repetir canciones por sala** mientras la sala exista, con el caso límite de
  `rocola-content/analysis.md` (reinicio de exclusión si el banco se agota).

### Cambio de regla (iteración 2, confirmado con Kalin): respuesta escrita, no juicio grupal

La primera iteración de este juego dejaba que el grupo decidiera oralmente si la
respuesta del jugador que ganó el buzzer era correcta, confirmando con dos botones
✓/✗. Kalin pidió reemplazar esto: **el jugador escribe la respuesta en un campo de
texto** (30 segundos) y el sistema la juzga automáticamente, porque depender de que
"el público sea juez" fallaba cuando nadie en la sala sabía la respuesta con certeza.

- **Comparación por similitud de texto, no por IA**: se evaluó explícitamente usar IA
  para el juicio (tolerar mejor los typos), pero eso pondría una llamada de IA en el
  camino crítico de cada ronda — viola directamente constitution.md principio 5 ("la
  lógica de turnos y tiempos nunca depende de una llamada a un modelo de IA en
  caliente"). Kalin eligió la opción sin IA: un comparador de texto tolerante
  (`answer-matcher.ts`) resuelve todos los casos sin red y sin latencia variable. Ver
  sección "Juicio de la respuesta escrita" más abajo.
- **30 segundos para escribir**, iguales para la ronda normal y para el robo de punto
  (antes el robo no tenía juicio propio, ahora sí, con su propio temporizador de
  respuesta corriendo dentro de los mismos 5 segundos de ventana del robo — ver
  diseño).
- **Si no se envía antes de que se acaben los 30s, se juzga lo que haya escrito hasta
  ese momento** (no una respuesta vacía por defecto) — el cliente auto-envía el valor
  actual del campo apenas su propio conteo llega a 0; el backend igual tiene un
  temporizador de respaldo que resuelve con cadena vacía si ninguna respuesta llega
  (ej. el jugador se desconectó), para que la ronda nunca quede colgada.
- **Ya no hay confirmación manual ✓/✗** — se eliminan `handleMarkCorrect`/
  `handleMarkIncorrect` y los errores `NoDecisionPendingError`/`NotYourDecisionError`,
  reemplazados por `handleSubmitAnswer`/`NotYourAnswerError`.

## Juicio de la respuesta escrita — `answer-matcher.ts`

`isFuzzyMatch(guess: string, titulo: string): boolean`, función pura sin dependencias,
en `apps/backend/src/la-rocola/answer-matcher.ts`:

1. Normaliza ambos textos: minúsculas, quita el subtítulo entre paréntesis del título
   (ej. "Waka Waka (Esto Es África)" → compara solo contra "Waka Waka Esto Es Africa"
   sin que un subtítulo largo penalice de más), quita tildes/diacríticos, quita
   puntuación, separa en palabras y descarta stopwords en español (el, la, los, las,
   de, del, y, a, un, una, en, al, es).
2. Para cada palabra clave del título, busca una palabra en la respuesta que matchee
   por distancia de Levenshtein tolerando errores de tipeo (tolerancia proporcional al
   largo de la palabra — 1 carácter para palabras de hasta 4 letras, ~30% del largo
   para palabras más largas).
3. Títulos de 3 o más palabras clave toleran que **una** no tenga correspondencia en la
   respuesta (permite "copa de la vida" para "La Copa de la Vida"); títulos de 1-2
   palabras clave exigen que todas matcheen.
4. Sin ninguna palabra en común, o con más ausencias que las toleradas → `false`.

Ejemplos confirmados con Kalin (y cubiertos en `answer-matcher.spec.ts`): "Rallando el
sol", "rayando sol", "rayndo el sol" → `true` contra "Rayando el Sol"; una respuesta sin
relación real (ej. "despacito") → `false`.

## Cambio de regla (iteración 3, confirmado con Kalin): filtro por género o artista

El host puede angostar de qué canciones se juega antes de arrancar la partida — ver
spec.md → "Filtro opcional por género o artista". Decisiones tomadas con Kalin:

- **Género o artista, nunca ambos** — `RocolaFiltro` (definido en
  `rocola-content.types.ts`, ver `rocola-content/analysis.md`) es una unión
  discriminada de un solo caso a la vez.
- **Artista: lista desplegable, no texto libre** — el host elige de
  `RocolaContentService.getAvailableArtists()`, nunca escribe el nombre a mano. Cero
  riesgo de "no se encontró ese artista" por un tipeo.
- **Sin filtro = comportamiento actual** (aleatorio, tope de 2 por género) — el filtro
  es 100% opcional, default "ninguno".
- **Validar antes de arrancar, no completar con aleatorio.** Si el filtro no llega a 10
  canciones, no se arranca la partida — se le avisa al host cuántas hay disponibles
  para que elija otro filtro o lo deje sin filtro. Se descartó la alternativa de
  completar las que falten con canciones al azar de otro género/artista: mezclar
  silenciosamente rompería la expectativa de "estas 10 son de tal artista" sin que
  nadie lo pida.
- **La validación se hace apenas el host aprieta "Empezar", antes del `ReadyGate`** —
  no tendría sentido hacer esperar a todos los jugadores a que presionen "Listo" para
  recién ahí descubrir que el filtro no alcanza. Como `countAvailable` es síncrono y
  sin red (cuenta sobre `song-bank.ts` en memoria), esto no implica ningún costo ni
  retraso — se resuelve en el mismo `startMatch`, antes de crear el `ReadyGate`.

## Diseño

Carpeta nueva `apps/backend/src/la-rocola/`.

### `la-rocola.types.ts`

```ts
import type { TeamScore } from '../game-engine/game-engine.types.js';
import type { RoomState } from '../room/room.types.js';
import type { RocolaSong } from '../rocola-content/rocola-content.types.js';

export interface RocolaRoundResult {
  songId: string;
  titulo: string;
  artista: string;
  portadaUrl: string;
  teamId: string | null; // null = nadie acertó esta ronda
  playerId: string | null;
  playerName: string | null;
  puntos: 0 | 1;
  respuesta: string; // lo que el jugador escribió ('' si no llegó a escribir nada)
}

export type LaRocolaEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | {
      type: 'rocola_ready_state';
      code: string;
      readyPlayerIds: string[];
      eligiblePlayerIds: string[];
    }
  | {
      type: 'rocola_round_started';
      code: string;
      roundNumber: number;
      totalRounds: number;
      marcador: TeamScore[];
    }
  | { type: 'rocola_countdown_tick'; code: string; remainingSeconds: number }
  | {
      type: 'rocola_audio_control';
      code: string;
      targetSocketIds: string[];
      action: 'play' | 'pause' | 'resume';
      previewUrl?: string; // solo en 'play'
    }
  | { type: 'rocola_buzzer_open'; code: string; eligibleTeamIds: string[] | null } // null = todos
  | {
      type: 'rocola_buzzer_locked';
      code: string;
      playerId: string;
      playerName: string;
      teamId: string;
    }
  | { type: 'rocola_answer_tick'; code: string; remainingSeconds: number }
  | {
      type: 'rocola_robo_started';
      code: string;
      eligibleTeamIds: string[];
      eligibleTeamNames: string[];
      remainingSeconds: number;
    }
  | { type: 'rocola_round_result'; code: string; resultado: RocolaRoundResult }
  | {
      type: 'rocola_match_result';
      code: string;
      scores: TeamScore[];
      canciones: { titulo: string; artista: string; teamId: string | null }[];
    };
```

(`rocola_artists`, la respuesta a `rocola_get_artists`, **no** es parte de
`LaRocolaEvent` — se contesta directo al socket que preguntó desde el propio gateway,
sin pasar por `events$`; ver "`la-rocola.gateway.ts`" más abajo.)

`rocola_audio_control` es el único evento con `targetSocketIds` (siempre
`[screenRoomName(code)]`) — la canción suena solo por el dispositivo del host, nunca
por los celulares (mismo criterio de privacidad de dispositivo que ya aplican los
sonidos de acierto/error en Trivia/Adivina la palabra, pero acá aplica al audio
principal del juego, no a un efecto). Todos los demás eventos van a toda la sala
(`server.to(code)`) — a diferencia de Adivina la palabra, acá no hay nada que ocultar
entre jugadores (cualquiera puede ver quién ganó el buzzer, el marcador, y la
revelación).

### `la-rocola.service.ts`

**Estado persistente por sala** (sobrevive entre partidas, mismo límite ya documentado
de "no hay limpieza de salas todavía"):

```ts
Map<code, Set<string>> // songId ya sonados en esta sala
```

**Estado de la partida en curso**:

```ts
type RocolaPhase =
  | 'waiting_ready'
  | 'countdown'
  | 'sonando'
  | 'respondiendo'
  | 'robo'
  | 'robo_respondiendo'
  | 'revelacion';

interface RocolaMatchState {
  readyGate: ReadyGate;
  filtro: RocolaFiltro | null; // elegido por el host al arrancar, fijo por partida
  songs: RocolaSong[]; // 10, ya resueltas — se llenan recién al satisfacer el ReadyGate
  currentIndex: number;
  phase: RocolaPhase;
  timer: RoundTimer | null;
  buzzedPlayerId: string | null;
  buzzedTeamId: string | null;
  failedTeamId: string | null;
  eligibleTeamIds: string[] | null; // solo durante 'robo'/'robo_respondiendo'
  matchScores: Map<string, number>;
  resultados: RocolaRoundResult[];
}
```

Constantes: `TOTAL_ROUNDS = 10`, `COUNTDOWN_SECONDS = 5`, `SONG_SECONDS = 30`,
`ANSWER_SECONDS = 30` (tiempo para escribir la respuesta, igual en ronda normal y en
robo), `ROBO_SECONDS = 5`, `REVEAL_DISPLAY_MS = 4_000`, `RESULTS_DISPLAY_MS = 10_000`
(mismo valor que Trivia/Adivina la palabra).

- **`startMatch(code, filtro?: RocolaFiltro)`**:
  1. Si ya hay partida en curso → `RocolaMatchAlreadyRunningError`.
  2. `room = rooms.getRoomOrThrow(code)`.
  3. `participating = room.teams.filter(t => t.playerIds.length > 0)`; si
     `participating.length < 2` → `NotEnoughTeamsError` (reusada de
     `game-engine/turn-distribution.ts`, mismo criterio que Adivina la palabra la deja
     burbujear).
  4. Si `filtro` está presente: `disponibles = this.content.countAvailable(filtro)`; si
     `disponibles < TOTAL_ROUNDS` → `InsufficientFilteredSongsError(filtro,
     disponibles)` — no se crea partida ni se toca `room.status` (el host puede
     reintentar con otro filtro sin que nada haya cambiado).
  5. `eligiblePlayerIds` = ids de jugadores que pertenecen a algún equipo participante.
  6. `room.status = 'jugando'`. Inicializa el estado de partida con
     `readyGate: new ReadyGate(eligiblePlayerIds)`, `filtro: filtro ?? null`,
     `songs: []`, `currentIndex: 0`, `phase: 'waiting_ready'`, resto en `null`/vacío,
     `matchScores` en 0 por equipo.
  7. Emite `room_state` y `rocola_ready_state` (`readyPlayerIds: []`,
     `eligiblePlayerIds`).
  - **No** pide las canciones todavía — se piden recién al satisfacer el `ReadyGate`
    (ver siguiente método), para no acoplar la espera humana con la llamada al
    proveedor de contenido. La validación de "alcanza" (paso 4) sí es inmediata porque
    es síncrona y sin red — no hay motivo para retrasarla hasta el `ReadyGate`.
- **`getAvailableArtists(code)`**: delega directo en
  `this.content.getAvailableArtists()` — no depende de nada de la sala, `code` está
  solo por simetría con el resto de los métodos del gateway. Usado por el evento
  `rocola_get_artists` (ver gateway).
- **`markReady(code, socketId)`**:
  - Valida partida activa (`NoRocolaMatchError`), `phase === 'waiting_ready'` (si no,
    `TurnAlreadyStartedError` reusando el nombre de error ya establecido en Adivina la
    palabra para "esto ya arrancó"), jugador pertenece a la sala
    (`PlayerNotInRoomError`).
  - `match.readyGate.markReady(player.id)`.
  - Emite `rocola_ready_state` actualizado.
  - Si `match.readyGate.isSatisfied` → `await this.beginContent(code)` (privado, async):
    1. `used = this.roomUsedSongs.get(code) ?? new Set()`.
    2. `songs = await this.content.selectSongs(TOTAL_ROUNDS, [...used], match.filtro ??
       undefined)`.
    3. `songs.forEach(s => used.add(s.id))`; `this.roomUsedSongs.set(code, used)` —
       se reservan como "usadas" apenas se eligen (no hay concepto de "devolver al
       pool" como en Adivina la palabra: acá siempre se juegan las 10 completas en una
       partida que ya arrancó).
    4. `match.songs = songs`; `startRound(code)` (ronda 0).
- **Un jugador se desconecta durante `waiting_ready`**: el gateway ya escucha
  `handleDisconnect` a nivel de `RoomModule`; `LaRocolaService` se suscribe a ese mismo
  evento (inyecta `RoomService`/expone un método `handlePlayerLeft(code, playerId)`
  llamado desde `LaRocolaGateway` o desde un listener sobre
  `roomService`'s removal — más simple: `LaRocolaGateway.handleDisconnect` llama
  `laRocola.handlePlayerLeft(code, playerId)` si hay partida en `waiting_ready` en esa
  sala) → `match.readyGate.removePlayer(playerId)`, re-evalúa `isSatisfied`, emite
  `rocola_ready_state`.
- **`startRound(code)`** (privado):
  - `song = match.songs[match.currentIndex]`.
  - `phase = 'countdown'`; resetea `buzzedPlayerId/buzzedTeamId/failedTeamId/eligibleTeamIds`
    a `null`.
  - Emite `rocola_round_started` (`roundNumber: currentIndex + 1`, `totalRounds: 10`,
    `marcador` desde `matchScores`).
  - `timer = new RoundTimer(onTick, onEnd)`; `onTick` → emite
    `rocola_countdown_tick` con `remainingSeconds` (5→1; en 0 no emite tick, dispara
    `onEnd`); `onEnd` → `beginSonando(code)`. `timer.start(COUNTDOWN_SECONDS)`.
- **`beginSonando(code)`** (privado):
  - `phase = 'sonando'`.
  - Emite `rocola_audio_control` (`targetSocketIds: [screenRoomName(code)]`,
    `action: 'play'`, `previewUrl: song.previewUrl`).
  - Emite `rocola_buzzer_open` (`eligibleTeamIds: null`, todos pueden presionar).
  - `timer = new RoundTimer(() => {}, () => this.resolveNoOneBuzzed(code))`;
    `timer.start(SONG_SECONDS)` — no hace falta emitir tick por segundo acá (`spec.md`
    no pide un conteo visible mientras suena la canción).
- **`handleBuzz(code, socketId)`** ("¡Me la sé!"):
  - Valida partida activa, jugador en la sala.
  - `phase` debe ser `'sonando'` o `'robo'` (si no, `BuzzerNotOpenError`).
  - Si `phase === 'robo'`: el equipo del jugador debe estar en
    `match.eligibleTeamIds` (si no, `NotEligibleToBuzzError`).
  - `match.timer?.stop()`.
  - `match.buzzedPlayerId = player.id`; `match.buzzedTeamId` = equipo del jugador.
  - `phase = phase === 'robo' ? 'robo_respondiendo' : 'respondiendo'`.
  - Emite `rocola_audio_control` (`action: 'pause'`) y `rocola_buzzer_locked`
    (`playerId`, `playerName`, `teamId`) a toda la sala — cada cliente decide con esto
    si mostrar "esperando a que {nombre} escriba" (los demás) o el campo de texto (el
    propio jugador, comparando `playerId` con el suyo).
  - Arranca `RoundTimer(ANSWER_SECONDS)`: `onTick` → emite `rocola_answer_tick`
    (`remainingSeconds`) a toda la sala; `onEnd` → `this.handleSubmitAnswer(code,
    socketId, '')` (mismo socket que buzzeó, respuesta vacía — red de contención si
    nunca llega un `rocola_submit_answer` real, ej. el jugador se desconectó).
- **`handleSubmitAnswer(code, socketId, texto)`**:
  - Si `match.phase` ya no es `'respondiendo'`/`'robo_respondiendo'` → no hace nada
    (`return` silencioso, no lanza error): cubre el caso en que el timeout interno de
    arriba se dispara un instante después de que un `rocola_submit_answer` real ya
    resolvió la ronda — la resolución no se duplica.
  - Si el socket no es `match.buzzedPlayerId` → `NotYourAnswerError`.
  - `match.timer?.stop(); match.timer = null`.
  - `acierto = isFuzzyMatch(texto, song.titulo)` (ver "Juicio de la respuesta escrita").
  - Si `acierto`: `gameEngine.addScore(code, buzzedTeamId, 1)`;
    `matchScores.set(buzzedTeamId, +1)`; `resolveRound(code, { teamId: buzzedTeamId,
    playerId, playerName, puntos: 1, respuesta: texto })`.
  - Si no acierta y `phase === 'respondiendo'` (primer intento, no robo): `failedTeamId
    = buzzedTeamId`; `eligibleTeamIds = participating.filter(t => t.id !==
    failedTeamId).map(t => t.id)`; `buzzedPlayerId = buzzedTeamId = null`; `phase =
    'robo'`.
    - Emite `rocola_audio_control` (`action: 'resume'`).
    - Emite `rocola_robo_started` (`eligibleTeamIds`, `eligibleTeamNames`,
      `remainingSeconds: ROBO_SECONDS`).
    - `timer = new RoundTimer(() => {}, () => this.resolveEmptyRound(code))`;
      `timer.start(ROBO_SECONDS)` (nadie buzzea durante el robo → resultado vacío).
  - Si no acierta y `phase === 'robo_respondiendo'` (falló también el robo):
    `resolveRound(code, { teamId: null, playerId, playerName, puntos: 0, respuesta:
    texto })` — a diferencia del caso "nadie buzzeó", acá sí hay `playerId`/`playerName`
    (el que perdió el robo) y la `respuesta` que escribió, para que la revelación pueda
    mostrarla.
- **`resolveEmptyRound(code)`** (privado, `onEnd` de la canción o del robo sin ningún
  buzz): `resolveRound(code, { teamId: null, playerId: null, playerName: null, puntos:
  0, respuesta: '' })`.
- **`resolveRound(code, parcial)`** (privado, común a los 4 finales de ronda posibles):
  - `match.timer?.stop(); match.timer = null`.
  - `song = match.songs[match.currentIndex]`.
  - `resultado: RocolaRoundResult = { songId: song.id, titulo: song.titulo, artista:
    song.artista, portadaUrl: song.portadaUrl, ...parcial }`.
  - `match.resultados.push(resultado)`.
  - `phase = 'revelacion'`.
  - Emite `rocola_round_result` (`resultado`) a toda la sala.
  - `this.scheduler(() => this.advanceRound(code), REVEAL_DISPLAY_MS)`.
- **`advanceRound(code)`** (privado):
  - `match.currentIndex += 1`.
  - Si `currentIndex < TOTAL_ROUNDS` → `startRound(code)`.
  - Si no → `finishMatch(code)`.
- **`finishMatch(code)`** (privado):
  - `room.status = 'resultados'`, `room.round = null`, emite `room_state`.
  - `scores` desde `matchScores`; `canciones` desde `match.resultados` (`titulo`,
    `artista`, `teamId`).
  - Emite `rocola_match_result`.
  - `scheduleReturnToSelection(code)` (mismo patrón de `RESULTS_DISPLAY_MS` que Trivia
    y Adivina la palabra, con `this.scheduler` inyectable para tests con fake timers).
  - Borra el estado de partida en curso. `roomUsedSongs` no se toca (sigue vivo para
    la próxima partida de este juego en la sala).

### `la-rocola.gateway.ts`

- Cliente → servidor: `start_la_rocola_game { code, filtro? }`, `rocola_ready { code }`,
  `rocola_buzz { code }`, `rocola_submit_answer { code, texto }`,
  `rocola_get_artists { code }` (nuevo — pedido único del host antes de arrancar, ver
  abajo).
- Servidor → cliente: reenvía `laRocola.events$` — todos los eventos van a
  `server.to(code)` (toda la sala) **excepto** `rocola_audio_control`, que va target
  por target (`event.targetSocketIds.forEach(id => server.to(id).emit(...))`), mismo
  patrón que `adivina_pantalla_estado` en Adivina la palabra.
- **`rocola_get_artists`** es la única excepción al patrón "evento → método del
  servicio → `events$` → broadcast": el gateway responde **directo al socket que
  preguntó** (`client.emit('rocola_artists', { code, artistas })`), sin pasar por
  `events$` ni por el resto de la sala — es una consulta de datos estáticos del banco
  (no cambia con la partida ni con la sala), no un evento de juego. Se puede pedir en
  cualquier momento, incluso antes de `select_game` — no depende de que exista una
  partida de La Rocola en curso.

### `la-rocola.module.ts`

Importa `RoomModule`, `GameEngineModule`, `RocolaContentModule`; provee
`LaRocolaService` + `LaRocolaGateway`. Se agrega a `AppModule`.

### Cambios de wiring

- **`room.types.ts`**: `GAME_IDS`/`GameId` agregan `'la-rocola'`.

## Pruebas

- **`la-rocola.service.spec.ts`** (instanciación directa, `RoomService`/
  `GameEngineService` reales, `vi.useFakeTimers()`, `RocolaContentService` con
  proveedor falso inyectado, `scheduler` inyectado a mano):
  - `startMatch` con menos de 2 equipos con jugadores → `NotEnoughTeamsError`, sin
    tocar `RocolaContentService`.
  - `startMatch` deja `phase: 'waiting_ready'` y no pide canciones hasta que el
    `ReadyGate` se satisface.
  - `startMatch(code, { tipo: 'genero', genero: 'salsa' })` con un banco de prueba que
    tiene ≥10 de salsa → arranca normal; con un banco de prueba con <10 de salsa →
    `InsufficientFilteredSongsError`, sin crear partida ni tocar `room.status`
    (`countAvailable` se llama, `selectSongs` no).
  - Con `filtro` activo satisfecho, al completar el `ReadyGate` las 10 canciones
    devueltas por `selectSongs` respetan el `filtro` (verificado vía el `filtro`
    recibido por el proveedor falso).
  - `getAvailableArtists(code)` devuelve lo mismo que
    `RocolaContentService.getAvailableArtists()`.
  - `markReady` de todos los jugadores elegibles dispara la carga de canciones y
    arranca la ronda 0 (`countdown`); `markReady` de un socket ajeno a la sala →
    `PlayerNotInRoomError`.
  - Un jugador se desconecta durante `waiting_ready` y era el único pendiente → el
    gate se satisface solo con el resto.
  - El conteo de 5s emite 5 `rocola_countdown_tick` y al llegar a 0 dispara
    `rocola_audio_control(play)` + `rocola_buzzer_open`.
  - `handleBuzz` fuera de `sonando`/`robo` → `BuzzerNotOpenError`; durante `robo` con
    un equipo no elegible → `NotEligibleToBuzzError`.
  - `handleBuzz` pausa el audio, bloquea a los demás (`rocola_buzzer_locked`), arranca
    los 30s de `rocola_answer_tick`, y solo el jugador que buzzeó puede enviar la
    respuesta (`handleSubmitAnswer` desde otro socket → `NotYourAnswerError`).
  - Enviar una respuesta sin ninguna ronda de escritura pendiente no hace nada (no
    lanza error — cubre el reintento interno del timeout).
  - Respuesta que matchea (`isFuzzyMatch`, incluye casos con errores de tipeo reales,
    no solo exactos) suma 1 punto al equipo, termina la ronda, revela (incluida la
    `respuesta` escrita) y agenda `advanceRound` en `REVEAL_DISPLAY_MS`.
  - Respuesta que no matchea en el primer intento → arranca robo (`resume` de audio,
    `rocola_robo_started` con los equipos rivales); no matchea en el robo → ronda
    termina sin puntos, con la `respuesta` del intento fallido en el resultado.
  - No se envía nada antes de los 30s (ni un submit real ni texto) → se juzga como
    respuesta vacía, arranca el robo igual que una respuesta incorrecta.
  - Un submit real que llega justo cuando el timeout interno también dispara no
    duplica la resolución de la ronda.
  - Nadie buzzea en los 30s de canción, o nadie buzzea en los 5s de robo → mismo
    resultado vacío (`teamId: null`, `respuesta: ''`), revelación igual.
  - Se agotan las 10 rondas → `room.status = 'resultados'`, `rocola_match_result` con
    puntaje **de esa partida** y lista de canciones con su equipo ganador (o `null`); a
    los `RESULTS_DISPLAY_MS` (fake timers) → `currentGame` vuelve a `null` sin alterar
    el acumulado.
  - **Dos partidas seguidas en la misma sala**: la segunda no repite ninguna canción
    de la primera (usa `excluir` con las 10 ya sonadas).
  - Más de dos equipos: robo lista a todos los rivales del equipo que falló, no solo a
    uno.
- **`ready-gate.spec.ts`** (nuevo, en `game-engine/`): `isSatisfied` falso con lista
  vacía; falso hasta que todos los elegibles marcaron listo; `removePlayer` saca a
  alguien de pendientes y de elegibles; marcar listo a alguien que no está en
  `eligiblePlayerIds` no lo hace elegible (no cambia `isSatisfied`).
- **`answer-matcher.spec.ts`**: exacta, variantes con typos de spec.md ("Rallando el
  sol", "rayando sol", "rayndo el sol" contra "Rayando el Sol"), sin tildes, subtítulo
  entre paréntesis ignorado, título de una sola palabra clave exige esa palabra, un
  título completamente distinto se rechaza aunque comparta alguna palabra suelta.
- **`test/la-rocola.e2e-spec.ts`** (sockets reales sobre `AppModule` completo,
  `RocolaContentService` reemplazado por uno con banco de prueba de título conocido —
  necesario para poder enviar una respuesta "correcta" determinística): `select_game` →
  `start_la_rocola_game` → `rocola_ready_state` con pendientes → cada jugador emite
  `rocola_ready` → al completarse, `rocola_round_started` + conteo → tras el conteo,
  el socket de pantalla recibe `rocola_audio_control(play)` con `previewUrl` → un
  jugador emite `rocola_buzz` → los demás reciben `rocola_buzzer_locked` y
  `rocola_answer_tick` → ese jugador emite `rocola_submit_answer` con una respuesta sin
  relación → `rocola_robo_started` → un rival emite `rocola_buzz` →
  `rocola_submit_answer` con una respuesta correcta pero con una falta de ortografía →
  `rocola_round_result` con el punto → se repite hasta la décima ronda →
  `rocola_match_result`.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`). La tarea siguiente (`specs/features/la-rocola-ui/analysis.md`)
conecta esto a `/screen` y `/play`.
