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
  igual que un robo fallido — no hay reintento adicional.
- **Solo el jugador que ganó el buzzer puede confirmar** correcto/incorrecto — si se
  desconecta antes de confirmar, la ronda queda bloqueada (mismo límite ya documentado
  para "recargar a mitad de turno" en otros juegos, ver Fase 4 "Manejo de reconexión").
- **Sin repetir canciones por sala** mientras la sala exista, con el caso límite de
  `rocola-content/analysis.md` (reinicio de exclusión si el banco se agota).

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
`ROBO_SECONDS = 5`, `REVEAL_DISPLAY_MS = 4_000`, `RESULTS_DISPLAY_MS = 10_000` (mismo
valor que Trivia/Adivina la palabra).

- **`startMatch(code)`**:
  1. Si ya hay partida en curso → `RocolaMatchAlreadyRunningError`.
  2. `room = rooms.getRoomOrThrow(code)`.
  3. `participating = room.teams.filter(t => t.playerIds.length > 0)`; si
     `participating.length < 2` → `NotEnoughTeamsError` (reusada de
     `game-engine/turn-distribution.ts`, mismo criterio que Adivina la palabra la deja
     burbujear).
  4. `eligiblePlayerIds` = ids de jugadores que pertenecen a algún equipo participante.
  5. `room.status = 'jugando'`. Inicializa el estado de partida con
     `readyGate: new ReadyGate(eligiblePlayerIds)`, `songs: []`, `currentIndex: 0`,
     `phase: 'waiting_ready'`, resto en `null`/vacío, `matchScores` en 0 por equipo.
  6. Emite `room_state` y `rocola_ready_state` (`readyPlayerIds: []`,
     `eligiblePlayerIds`).
  - **No** pide las canciones todavía — se piden recién al satisfacer el `ReadyGate`
    (ver siguiente método), para no acoplar la espera humana con la llamada al
    proveedor de contenido.
- **`markReady(code, socketId)`**:
  - Valida partida activa (`NoRocolaMatchError`), `phase === 'waiting_ready'` (si no,
    `TurnAlreadyStartedError` reusando el nombre de error ya establecido en Adivina la
    palabra para "esto ya arrancó"), jugador pertenece a la sala
    (`PlayerNotInRoomError`).
  - `match.readyGate.markReady(player.id)`.
  - Emite `rocola_ready_state` actualizado.
  - Si `match.readyGate.isSatisfied` → `await this.beginContent(code)` (privado, async):
    1. `used = this.roomUsedSongs.get(code) ?? new Set()`.
    2. `songs = await this.content.selectSongs(TOTAL_ROUNDS, [...used])`.
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
    si mostrar "esperando a que {nombre} responda" (los demás) o los botones ✓/✗ (el
    propio jugador, comparando `playerId` con el suyo, mismo criterio que
    `adivina_turn_waiting` en Adivina la palabra).
- **`handleMarkCorrect(code, socketId)`** (botón verde):
  - Valida partida activa, `phase` es `'respondiendo'` o `'robo_respondiendo'` (si no,
    `NoDecisionPendingError`), `socketId` corresponde a `match.buzzedPlayerId` (si no,
    `NotYourDecisionError`).
  - `gameEngine.addScore(code, match.buzzedTeamId, 1)`;
    `matchScores.set(buzzedTeamId, + 1)`.
  - `resolveRound(code, { teamId: buzzedTeamId, playerId, playerName, puntos: 1 })`.
- **`handleMarkIncorrect(code, socketId)`** (botón rojo):
  - Mismas validaciones que `handleMarkCorrect`.
  - Si `phase === 'respondiendo'` (primer intento, no robo): `failedTeamId =
    buzzedTeamId`; `eligibleTeamIds = participating.filter(t => t.id !== failedTeamId).map(t => t.id)`;
    `buzzedPlayerId = buzzedTeamId = null`; `phase = 'robo'`.
    - Emite `rocola_audio_control` (`action: 'resume'`).
    - Emite `rocola_robo_started` (`eligibleTeamIds`, `eligibleTeamNames`,
      `remainingSeconds: ROBO_SECONDS`).
    - `timer = new RoundTimer(() => {}, () => this.resolveRoboTimeout(code))`;
      `timer.start(ROBO_SECONDS)`.
  - Si `phase === 'robo_respondiendo'` (falló también el robo):
    `resolveRound(code, { teamId: null, playerId: null, playerName: null, puntos: 0 })`.
- **`resolveNoOneBuzzed(code)`** (privado, `onEnd` de la canción sin ningún buzz):
  `resolveRound(code, { teamId: null, playerId: null, playerName: null, puntos: 0 })`.
- **`resolveRoboTimeout(code)`** (privado, `onEnd` del robo sin ningún buzz): mismo
  resultado vacío que arriba.
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

- Cliente → servidor: `start_la_rocola_game { code }`, `rocola_ready { code }`,
  `rocola_buzz { code }`, `rocola_mark_correct { code }`,
  `rocola_mark_incorrect { code }`.
- Servidor → cliente: reenvía `laRocola.events$` — todos los eventos van a
  `server.to(code)` (toda la sala) **excepto** `rocola_audio_control`, que va target
  por target (`event.targetSocketIds.forEach(id => server.to(id).emit(...))`), mismo
  patrón que `adivina_pantalla_estado` en Adivina la palabra.

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
  - `markReady` de todos los jugadores elegibles dispara la carga de canciones y
    arranca la ronda 0 (`countdown`); `markReady` de un socket ajeno a la sala →
    `PlayerNotInRoomError`.
  - Un jugador se desconecta durante `waiting_ready` y era el único pendiente → el
    gate se satisface solo con el resto.
  - El conteo de 5s emite 5 `rocola_countdown_tick` y al llegar a 0 dispara
    `rocola_audio_control(play)` + `rocola_buzzer_open`.
  - `handleBuzz` fuera de `sonando`/`robo` → `BuzzerNotOpenError`; durante `robo` con
    un equipo no elegible → `NotEligibleToBuzzError`.
  - `handleBuzz` pausa el audio, bloquea a los demás (`rocola_buzzer_locked`) y solo el
    jugador que buzzeó puede resolver (`handleMarkCorrect`/`handleMarkIncorrect` desde
    otro socket → `NotYourDecisionError`).
  - Botón verde suma 1 punto al equipo, termina la ronda, revela y agenda
    `advanceRound` en `REVEAL_DISPLAY_MS`.
  - Botón rojo en primer intento → arranca robo (`resume` de audio, `rocola_robo_started`
    con los equipos rivales); botón rojo en el robo → ronda termina sin puntos.
  - Nadie buzzea en los 30s de canción, o nadie buzzea en los 5s de robo → mismo
    resultado vacío (`teamId: null`), revelación igual.
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
- **`test/la-rocola.e2e-spec.ts`** (sockets reales sobre `AppModule` completo, sin
  llamada real a iTunes — `RocolaContentService` con banco falso vía módulo de test o
  variable de entorno que fuerce el proveedor falso): `select_game` →
  `start_la_rocola_game` → `rocola_ready_state` con pendientes → cada jugador emite
  `rocola_ready` → al completarse, `rocola_round_started` + conteo → tras el conteo,
  el socket de pantalla recibe `rocola_audio_control(play)` con `previewUrl` → un
  jugador emite `rocola_buzz` → los demás reciben `rocola_buzzer_locked` → ese jugador
  emite `rocola_mark_incorrect` → `rocola_robo_started` → un rival emite `rocola_buzz`
  → `rocola_mark_correct` → `rocola_round_result` con el punto → se repite hasta la
  décima ronda → `rocola_match_result`.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`). La tarea siguiente (`specs/features/la-rocola-ui/analysis.md`)
conecta esto a `/screen` y `/play`.
