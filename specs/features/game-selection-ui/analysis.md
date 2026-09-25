# Panel de selección de juego (frontend) — Análisis técnico

Tarea de Fase 2 (ver `tasks.md`). Depende de
`specs/features/game-selection/analysis.md` (evento `select_game`, campo
`RoomState.currentGame`). Alcance: la vista genérica y reutilizable que aparece entre
"equipos armados" y "el juego elegido arrancó" — no conoce reglas de ningún minijuego
puntual, solo lista los disponibles y comunica cuál se eligió. Cómo arranca
específicamente cada minijuego (ej. Trivia) es responsabilidad de la tarea de ese
minijuego, no de esta.

## Criterios de aceptación

Ver `spec.md` → "Motor de sala" → "Selección y arranque de juego".

## Diseño

### Catálogo de juegos — `apps/frontend/src/lib/game-catalog.ts`

Constante estática, no viene del backend (el backend solo valida que el `gameId`
elegido sea conocido — ver `game-selection/analysis.md`):

```ts
export interface GameCatalogEntry {
  id: GameId; // mismo tipo que el backend, espejo a mano igual que room-types.ts
  label: string;
  description: string;
}

export const GAME_CATALOG: GameCatalogEntry[] = [
  { id: 'trivia', label: 'Trivia', description: 'Preguntas de cultura general por turnos.' },
];
```

Crece con cada minijuego nuevo (Fase 3) — un array, sin lógica.

### `/screen`: botón "Iniciar partida" + panel

- **`app/screen/[roomCode]/start-match-button.tsx`**: botón visible en el lobby (debajo
  del `TeamManager`, junto al QR ya revelado). Deshabilitado si ningún equipo tiene
  integrantes (`state.teams.every(t => t.playerIds.length === 0)`). Al presionarlo,
  cambia un estado local (`showGamePanel`, en `screen-lobby.tsx` o en un componente
  propio) — **no** llama al backend todavía; mostrar el panel es puramente de
  presentación, como ya hace `revealed` para el QR.
- **`app/screen/[roomCode]/game-selection-panel.tsx`**: lista `GAME_CATALOG`, un botón
  por juego. Al elegir uno, llama a la acción `selectGame(gameId)` (nueva en
  `RoomActions`, `use-room-state.ts`) que emite `select_game { code, gameId }`.
- **`screen-lobby.tsx`**: la vista ahora tiene tres estados según `state.currentGame` y
  el `showGamePanel` local:
  - `currentGame === null && !showGamePanel` → lobby actual (equipos + QR +
    `StartMatchButton`).
  - `currentGame === null && showGamePanel` → `GameSelectionPanel`.
  - `currentGame !== null` → delega al componente del juego elegido (por ahora, un
    `switch`/mapa de un solo caso: `'trivia' → <ScreenTrivia>`, de
    `specs/features/trivia-ui/analysis.md`). Este mapa es el único lugar que conoce la
    lista de juegos implementados de verdad (a diferencia de `GAME_CATALOG`, que puede
    listar juegos "próximamente" sin componente todavía — no es el caso hoy con solo
    Trivia, pero deja el punto de extensión claro para Fase 3).

### `/play`: espera mientras se elige el juego

- **`play-lobby.tsx`**: si `state.currentGame === null`, se mantiene el mensaje de
  espera actual ("Esperando a que el anfitrión arme los equipos…" ya cubre parte;
  se ajusta el texto a algo genérico tipo "Esperando a que el anfitrión elija el
  juego…" una vez que el jugador ya tiene equipo). Si `state.currentGame !== null`,
  delega al componente de control del juego elegido (mismo mapa de un solo caso que en
  pantalla, `'trivia' → <PlayTrivia>`).

### `use-room-state.ts`

Se agrega `selectGame(gameId: GameId)` a `RoomActions`, mismo patrón que
`createTeam`/`removeTeam` (emite y listo, el estado llega por `room_state`).

## Límite explícito

Esta tarea no incluye "elegir el siguiente juego después de terminar uno" — el botón
"Iniciar partida" y el panel solo aparecen una vez, mientras `currentGame` es `null`.
Repetir el flujo entre partidas es Fase 4, que va a reusar `GameSelectionPanel` pero
necesita que el backend permita volver a `currentGame = null` (fuera del alcance de
`game-selection/analysis.md` actual).

## Pruebas

- **`game-selection-panel.spec.tsx`**: lista los juegos de `GAME_CATALOG`, click emite
  `select_game` con el `gameId` correcto.
- **`start-match-button.spec.tsx`** (o inline en `screen-lobby.spec.tsx`): deshabilitado
  sin jugadores en ningún equipo, habilitado con al menos uno.
- **`screen-lobby.spec.tsx`** (ampliación): transición lobby → panel → (una vez que
  exista `ScreenTrivia`) vista de juego, según `currentGame` y el click en "Iniciar
  partida".
- **`play-lobby.spec.tsx`** (ampliación): mensaje de espera se actualiza y luego
  delega al componente de juego cuando `currentGame` deja de ser `null`.
- **`use-room-state.spec.ts`** (ampliación): `selectGame` emite el evento correcto.

## Checklist manual

Aplica el checklist completo de `testing-strategy.md`, más:

- [ ] Botón "Iniciar partida" deshabilitado se ve claramente distinto al habilitado
      (legible a distancia en la TV).
- [ ] Con un solo juego en el catálogo (Trivia), el panel no se ve vacío/raro — vale la
      pena revisar el diseño con un solo botón antes de que existan más juegos.
- [ ] `/play` mientras se está eligiendo el juego no queda en una pantalla confusa o en
      blanco.
