# Componentes de pantalla y control para Trivia — Análisis técnico

Tarea de Fase 2 (ver `tasks.md`). Depende de
`specs/features/trivia-module/analysis.md` (backend por turnos) y de
`specs/features/game-selection-ui/analysis.md` (panel que decide qué componente de
juego se monta según `RoomState.currentGame`). Reemplaza por completo el análisis
anterior de esta misma tarea, borrado — estaba diseñado para el modelo viejo de
"todos responden a la vez".

No incluye las pruebas e2e de Playwright de Trivia — son la tarea siguiente de
`tasks.md` ("Pruebas unitarias de las reglas + e2e...").

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "4. Trivia / Preguntados".

## Diseño

### 1. Tipos y estado puro — `apps/frontend/src/lib/`

- **`trivia-types.ts`**: espejo de `apps/backend/src/trivia/trivia.types.ts`
  (`trivia_turn_waiting`, `trivia_turn_started`, `trivia_turn_update`,
  `trivia_turn_result`, `trivia_match_result`, `TriviaTurnResult`).
- **`trivia-match.ts`**: reducer puro `triviaReducer(state, action)`. Estado (forma
  final, implementada):
  ```ts
  type TriviaMatchView =
    | { phase: 'idle' }
    | { phase: 'waiting_turn'; playerId: string; playerName: string; teamId: string }
    | { phase: 'my_turn'; playerId: string; playerName: string; pregunta: string; opciones: string[]; durationSeconds: number; remainingSeconds: number }
    | { phase: 'turn_result'; pregunta: string; opciones: string[]; indiceCorrecto: number; resultado: TriviaTurnResult }
    | { phase: 'match_result'; scores: TeamScore[] };
  ```
  **Ajuste respecto al sketch original**: `my_turn` no lleva `opcionElegida` — ese
  estado ("opción tocada, esperando confirmación") queda como `useState` local en
  `play-trivia.tsx`, no en el reducer compartido. Mantiene `triviaReducer` reflejando
  *solo* lo que manda el servidor, sin mezclar estado optimista del cliente.
  `subscribeToTrivia(socket, dispatch)` registra los 5 listeners — compartido entre
  `use-room-state` (pantalla) y `use-join-room` (jugador), mismo criterio que ya
  usábamos. El cliente no decide correcta/incorrecta ni arma el orden de turnos: solo
  refleja lo que el servidor manda (`plan.md`).
  - **Distinción pantalla vs. jugador**: no hay dos variantes del reducer — ambos
    consumidores usan el mismo. La distinción está en qué hace cada componente con la
    vista resultante: como `trivia_turn_started` (con la pregunta completa) solo llega
    al socket de la pantalla y al del jugador en turno (nunca a los demás jugadores),
    recibirlo en el propio socket ya significa "es mi turno" — el celular no necesita
    comparar `playerId` contra el propio. `play-trivia.tsx` no distingue tampoco
    `waiting_turn` con `playerId === miPlayerId`: ese caso es instantáneo, el mismo
    turno llega también como `trivia_turn_started` casi al mismo tiempo y lo pisa.
- **`trivia-match.spec.ts`**: transiciones del reducer para ambos consumidores (pantalla
  y jugador reciben eventos distintos según a qué se suscribieron).

### 2. Hooks

- **`use-room-state.ts`** (pantalla): agrega `trivia` (vía `useReducer` +
  `subscribeToTrivia`, quedándose siempre con la versión "pantalla" — pregunta
  completa vía `trivia_turn_started`) y la acción `startTriviaGame()` → emite
  `start_trivia_game { code }`.
  - **Auto-arranque**: `screen-trivia.tsx` (no el hook) es quien, al montarse con
    `trivia.phase === 'idle'`, llama `startTriviaGame()` una sola vez (con un
    `useRef` de guarda para no reemitir en cada render) — es la única vista que lo
    dispara, así no hay doble arranque si por algún motivo `/play` también estuviera
    escuchando (no lo hace, pero la responsabilidad queda clara en un solo lugar: la
    pantalla, que es el host).
- **`use-join-room.ts`** (celular): agrega `trivia` (versión "jugador": distingue
  `my_turn` de `waiting_turn` según si el evento fue dirigido a este socket) y
  `submitAnswer(opcionIndex)` → emite `submit_trivia_answer`. Reusa el patrón `error`/
  `actionError` ya existente (un turno respondido tarde o fuera de lugar no debe sacar
  al jugador de la vista).

### 3. Componentes compartidos

- **`src/components/trivia-options.tsx`** (+ `.module.css`, `.spec.tsx`): grilla de 4
  opciones con letra/color A–D. Props: `opciones`, `onSelect?` (sin él → solo lectura,
  para la pantalla o para un jugador que no está en turno), `selectedIndex?`,
  `correctIndex?` (resalta correcta/incorrecta en el resultado), `disabled?`. Mismo
  diseño que se había pensado antes — este componente no dependía del modelo viejo.
- **`src/components/trivia-countdown.tsx`**: número grande de segundos restantes,
  reutilizable en pantalla y en el celular del jugador en turno.
- **`src/lib/trivia-sounds.ts`**: helper mínimo — `playCorrectSound()` /
  `playIncorrectSound()`. **Decisión de esta iteración (confirmada con Kalin):**
  sintetizados con la Web Audio API (osciladores + envolvente corta), no archivos
  `.mp3`/`.ogg` — evita depender de conseguir assets con licencia clara y el tema de
  `public/sounds/`. Un solo `AudioContext` lazy, creado en el primer uso. Se
  reproducen **solo desde `screen-trivia.tsx`** (el dispositivo del host) —
  `play-trivia.tsx` nunca los llama, según pide `spec.md`.

### 4. Pantalla — `app/screen/[roomCode]/screen-trivia.tsx`

Se monta cuando `state.currentGame === 'trivia'` (ver `game-selection-ui`). Renderiza
según `trivia.phase`:

- `idle`: dispara `startTriviaGame()` (ver arriba) y muestra "Arrancando Trivia…".
- `waiting_turn`: no debería verse en pantalla (la pantalla salta directo a
  `my_turn`-equivalente vía `trivia_turn_started`) — se deja como resguardo visual
  mínimo por si el evento llega en otro orden.
- El equivalente de "hay una pregunta activa" (nombre del jugador en turno + pregunta +
  `TriviaOptions` solo lectura + `TriviaCountdown`).
- `turn_result`: `TriviaOptions` con `correctIndex`/`selectedIndex` resaltados,
  **animación** (una clase CSS con keyframes al entrar — check/cruz grande, sin
  librería nueva) y **sonido** (`playCorrectSound`/`playIncorrectSound` según
  `resultado.correcta`, en un `useEffect` con `[trivia]` como dependencia — el reducer
  arma un objeto nuevo en cada `dispatch`, así que corre exactamente una vez por
  `trivia_turn_result` recibido, sin necesidad de trackear a mano un id de turno).
  La pausa de 2-3s ya la controla el backend (ver `trivia-module/analysis.md`) — el
  frontend no necesita su propio `setTimeout`, solo reacciona a que llegue el próximo
  `trivia_turn_started`.
- `match_result`: puntaje final por equipo (`scores`), sin acción de "otra pregunta" —
  la partida ya terminó; volver a jugar es la tarea de Fase 4 (selector de siguiente
  juego).

### 5. Celular — `app/play/[roomCode]/play-trivia.tsx`

Se monta cuando `state.currentGame === 'trivia'` en `/play`. Según `trivia.phase` de
la versión "jugador":

- `idle` / `waiting_turn` con `playerId !== miPlayerId`: "Esperando..." + si hay dato de
  `waiting_turn`, "Le toca a **[nombre]**".
- `my_turn`: pregunta + `TriviaOptions` tocables. Al tocar una opción, se deshabilitan
  todas (optimista) hasta la confirmación `trivia_answer_accepted` o el `turn_result`.
- `turn_result` con `resultado.playerId === miPlayerId`: "¡Correcto! +100" /
  "Incorrecto" / "No respondiste a tiempo", más la respuesta correcta.
- `turn_result` con `resultado.playerId !== miPlayerId`: mensaje corto de lo que pasó
  con el turno de esa persona ("[nombre] acertó/falló"), sin mostrarle la pregunta si
  no le tocó a él/ella (ya la recibió si le tocaba por `my_turn`; si no le tocó, el
  `turn_result` sí puede revelar la pregunta porque el turno ya se resolvió — no hay
  nada que cuidar a esa altura).
- `match_result`: puntaje final del propio equipo destacado.
- Muestra `actionError` si el servidor rechaza una respuesta (ej. llegó tarde y el
  turno ya avanzó).

### 6. Integración

- **`screen-lobby.tsx`**: cuando `state.currentGame === 'trivia'` → `<ScreenTrivia>`
  (reemplaza el lobby, según ya diseña `game-selection-ui/analysis.md`).
- **`play-lobby.tsx`**: mismo criterio, `<PlayTrivia>`.

**Límite explícito (no se resuelve acá)**: recargar la pantalla o el celular a mitad de
turno pierde el turno en curso (el backend no reenvía el turno activo en `watch_room`/
`join_room`) — encaja con "Manejo de reconexión" de Fase 4, igual que ya estaba
documentado en la iteración anterior de este análisis.

## Pruebas

- Unitarias (Vitest): `trivia-match.spec.ts` (reducer, ambas variantes
  pantalla/jugador), `trivia-options.spec.tsx`, ampliación de `use-room-state.spec.ts`
  y `use-join-room.spec.ts` con el `FakeSocket` ya usado en esos archivos,
  `screen-trivia.spec.tsx` (incluye verificar que se llama al sonido correcto según
  `resultado.correcta`, mockeando `trivia-sounds.ts`), `play-trivia.spec.tsx`
  (distingue `my_turn` de espera, no muestra pregunta ajena antes del resultado),
  ampliación de `screen-lobby.spec.tsx` / `play-lobby.spec.tsx` para el nuevo caso de
  `currentGame`.
- No incluye e2e de Playwright — tarea siguiente de `tasks.md`.

## Checklist manual

Aplica el checklist completo de `testing-strategy.md`, más lo propio de Trivia:

- [ ] Legibilidad de la pregunta y las opciones en la TV/proyector a la distancia
      típica desde la que se juega.
- [ ] Tamaño de los botones de respuesta en el celular del jugador en turno.
- [ ] Confirmar que el celular de un jugador que NO está en turno nunca muestra la
      pregunta (ni un instante) — solo "le toca a [nombre]".
- [ ] El sonido de acierto/error suena por la pantalla compartida (host), no por los
      celulares de los jugadores.
- [ ] Partida completa de punta a punta con equipos de tamaño distinto (ej. 2 y 3
      integrantes) — confirmar el reparto de turnos (5/4 vs 3/3/3 del ejemplo de
      `spec.md`) jugando, no solo en la prueba unitaria.
- [ ] Caso límite de `spec.md`: alguien no responde a tiempo → se cuenta incorrecta,
      sin puntos negativos, el turno avanza solo.
- [ ] F5 en `/screen` o `/play` a mitad de turno: no rompe la sala (ver límite
      explícito arriba — se espera perder el turno en curso, no un crash).
- [ ] A los 10s de terminar la partida, la pantalla vuelve sola al panel de selección
      de juego (`specs/features/trivia-results-timeout/analysis.md` +
      `trivia-results-timeout-ui/analysis.md`).
- [ ] El marcador de equipos (nombre + puntos acumulados) se ve bien en el panel de
      selección de juego, en TV/proyector, tanto con 2 equipos (esquinas) como con 3+
      (franja completa).
