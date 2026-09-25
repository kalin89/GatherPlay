# Selección y arranque de juego (backend) — Análisis técnico

Nueva tarea de Fase 2 (ver `tasks.md`), sobre `RoomModule` ya existente
(`specs/features/room-module/analysis.md`). Backend puro — la base genérica que
necesita cualquier minijuego para arrancar, no específica de Trivia. `plan.md` ya
preveía este paso (`currentGame: GameId | null` en `RoomState`, evento `select_game`);
esta tarea es la primera vez que se construye.

Alcance acotado a **la primera selección** (de `lobby` sin juego elegido, a un juego
elegido): "volver a elegir juego entre partidas sucesivas sin recrear la sala" es la
tarea de Fase 4 ("Selector de siguiente juego entre ronda y ronda"), que va a
extender/relajar la validación de acá, no repetirla desde cero.

## Criterios de aceptación

Ver `spec.md` → "Motor de sala" → "Selección y arranque de juego".

## Diseño

Se extiende `RoomModule`, no se crea un módulo nuevo — es del mismo tamaño y
naturaleza que "armado de equipos" (mismo módulo, un campo más de `RoomState`).

### `room.types.ts`

```ts
export type GameId = 'trivia'; // union que crece con cada minijuego nuevo

export interface RoomState {
  code: string;
  status: RoomStatus;
  players: Player[];
  teams: Team[];
  round: RoundState | null;
  currentGame: GameId | null; // nuevo
}
```

`createRoom` inicializa `currentGame: null`.

### `room.service.ts`

```ts
selectGame(code: string, gameId: GameId): RoomState
```

- `room = getRoomOrThrow(code)`.
- Si `room.currentGame !== null` → `GameAlreadyStartedError` (ya se eligió un juego en
  esta sala; Fase 4 relaja esto para permitir elegir el siguiente).
- Si `gameId` no es un valor conocido de `GameId` → `UnknownGameError`.
- `room.currentGame = gameId`, retorna `room`.

No valida acá si hay equipos/jugadores suficientes para JUGAR — eso es responsabilidad
de cada módulo de minijuego al arrancar su propia partida (ej. Trivia exige 2+ equipos
con integrantes; un juego futuro de un solo jugador no lo exigiría). `RoomModule` no
conoce reglas de ningún minijuego (constitution.md, principio 4).

### `room.gateway.ts`

- Cliente → servidor: `select_game { code, gameId }`.
- Servidor → cliente: `room_state` (broadcast a la sala, mismo patrón que
  `create_team`/`assign_team`), `error` (`RoomNotFoundError`, `GameAlreadyStartedError`,
  `UnknownGameError`).

### Reparto de turnos entre jugadores de un equipo (utilidad compartida)

Vive acá porque es la primera vez que hace falta y `spec.md` la documenta como regla
compartida para cualquier minijuego por turnos, pero **no** depende de `RoomState` ni
de sockets — es una función pura. Se agrega en
`apps/backend/src/game-engine/turn-distribution.ts` (junto a `round-timer.ts`, mismo
criterio: utilidad reutilizable del motor de juego, no lógica de un minijuego
particular).

```ts
export interface TurnAssignment {
  teamId: string;
  playerId: string;
}

export function distributeTurns(
  teams: { id: string; playerIds: string[] }[],
  roundsPerPlayer: number,
  random: () => number = Math.random,
): TurnAssignment[]
```

(`{ id, playerIds }` en vez de `{ teamId, playerIds }` para que Trivia pueda pasar
`room.teams` directo, sin mapear — es la forma de `Team` en `room.types.ts`. La salida
sigue usando `teamId`.)

- Filtra a los equipos con al menos un jugador (`playerIds.length > 0`). Con menos de 2
  equipos participantes, no hay forma de alternar — lanza `NotEnoughTeamsError` (se
  define en este archivo, cada minijuego que la use decide qué hacer con el error, ej.
  Trivia la deja burbujear).
- `maxTeamSize` = el tamaño del equipo participante más grande.
- `totalTurnsPerTeam = roundsPerPlayer * maxTeamSize`.
- Por cada equipo: se baraja su propio `playerIds` (al azar, con `random` inyectado —
  mismo patrón que `AiContentService`/`TriviaService` ya usan para poder testear
  determinístico) y se recorre en round-robin hasta completar `totalTurnsPerTeam`
  turnos (`shuffled[i % shuffled.length]`). Esto reparte lo más parejo posible: con
  `totalTurnsPerTeam = 9` y un equipo de 2, el jugador en la posición 0 del barajado
  recibe 5 turnos (índices 0,2,4,6,8) y el de la posición 1 recibe 4 (índices
  1,3,5,7) — igual que el ejemplo de `spec.md`.
- Se elige al azar qué equipo arranca (rota el orden de equipos participantes a partir
  de un índice al azar) y se intercalan sus colas turno a turno: turno 0 del primer
  equipo, turno 0 del segundo equipo, ..., turno 1 del primer equipo, etc. — hasta
  agotar `totalTurnsPerTeam` de cada uno. Con 2 equipos y `totalTurnsPerTeam = 9`, da
  18 turnos totales, alternados.
- Generaliza a más de 2 equipos participantes (se intercalan todos), aunque el ejemplo
  de `spec.md` y el primer consumidor (Trivia) usan 2.

## Pruebas

- **`room.service.spec.ts`** (ampliación): `selectGame` guarda el `gameId`, sala
  inexistente, `gameId` desconocido, y llamarlo dos veces en la misma sala falla con
  `GameAlreadyStartedError`.
- **`turn-distribution.spec.ts`** (nuevo, en `game-engine/`): el caso de `spec.md`
  (equipos de 2 y 3, 3 rondas → 9 turnos por equipo, 5/4 de reparto en el de 2 y 3/3/3
  en el de 3); equipos del mismo tamaño (reparto exacto); un solo equipo con
  jugadores → `NotEnoughTeamsError`; ningún equipo con jugadores → mismo error;
  `random` inyectado determinístico para que el orden de arranque sea probable.
- **`test/room.e2e-spec.ts`** (ampliación): `select_game` end-to-end, incluida la
  sala recibiendo `room_state` con `currentGame` actualizado.

## Checklist manual

No aplica todavía — es la mitad backend de una tarea dividida por tamaño (regla de
`CLAUDE.md`); la UI que la usa es `specs/features/game-selection-ui/analysis.md`, la
siguiente tarea.
