# Componentes de pantalla y control para Caras y Gestos — Análisis técnico

Tercera de las tres tareas de "Mímica / Caras y Gestos" (ver `tasks.md`, Fase 3).
Depende de `specs/features/caras-y-gestos-module/analysis.md` (backend) y de
`specs/features/game-selection-ui/analysis.md` (panel que decide qué componente de
juego se monta según `RoomState.currentGame`). Mismo patrón general que
`specs/features/trivia-ui/analysis.md` (tipos espejo + reducer puro + hooks +
componentes en `/screen` y `/play`), reusando lo que ya es genérico de ahí.

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "1. Mímica / Caras y Gestos".

## Diseño

### 1. Tipos y estado puro — `apps/frontend/src/lib/`

- **`gestos-types.ts`**: espejo de `apps/backend/src/caras-y-gestos/caras-y-gestos.types.ts`.
- **`gestos-match.ts`**: reducer puro `gestosReducer(state, action)`. Estado:
  ```ts
  type GestosMatchView =
    | { phase: 'idle' }
    | { phase: 'waiting_turn'; playerId: string; playerName: string; teamId: string }
    | { phase: 'ready_to_start' } // versión jugador: soy yo, muéstrame "Iniciar"
    | { phase: 'acting'; palabra: string; durationSeconds: number; remainingSeconds: number; palabrasRestantes: number } // versión pantalla
    | { phase: 'my_turn_active' } // versión jugador: ya presioné Iniciar, mostrar Adivinada/Paso, sin palabra
    | { phase: 'turn_result'; resultado: GestoTurnResult }
    | { phase: 'match_result'; scores: TeamScore[]; palabrasPorEquipo: Record<string, string[]> };
  ```
  **Misma distinción que Trivia**: no hay dos reducers — la vista `acting` (con
  palabra) solo puede darse en el consumidor que recibió `gestos_turn_started`
  (siempre la pantalla, nunca el jugador — ver "Privacidad" en
  `caras-y-gestos-module/analysis.md`). El celular del actor arma `my_turn_active` a
  partir de `gestos_actor_ready`, que nunca lleva palabra. `subscribeToGestos(socket,
  dispatch)` registra los listeners, mismo criterio que `subscribeToTrivia`.
  - **`ready_to_start` vs `waiting_turn`**: el jugador distingue "me toca a mí, todavía
    no presioné Iniciar" de "le toca a otro" comparando `playerId` del evento
    `gestos_turn_waiting` contra el propio (a diferencia de Trivia, acá **sí** hace
    falta comparar, porque no hay un evento dirigido-solo-a-mí equivalente a
    `trivia_turn_started` en esta fase — `gestos_turn_waiting` va a toda la sala).
- **`gestos-match.spec.ts`**: transiciones del reducer para ambos consumidores.

### 2. Hooks

- **`use-room-state.ts`** (pantalla): agrega `gestos` (vía `useReducer` +
  `subscribeToGestos`, versión "pantalla" — solo le llega `acting` con la palabra
  completa) y `startGestosGame()` → emite `start_gestos_game { code }`.
  - **Auto-arranque**: mismo criterio que `screen-trivia.tsx` — `screen-gestos.tsx`
    dispara `startGestosGame()` una sola vez al montarse con `gestos.phase === 'idle'`
    (`useRef` de guarda).
- **`use-join-room.ts`** (celular): agrega `gestos` (versión "jugador": nunca recibe
  `acting`, solo `waiting_turn`/`ready_to_start`/`my_turn_active`/`turn_result`/
  `match_result`) y dos acciones: `startGestosTurn()` → emite `start_gestos_turn` (solo
  válida en `ready_to_start`), `markGestureWord(resultado)` → emite `mark_gesture_word`
  (solo válida en `my_turn_active`).

### 3. Componentes compartidos

- **`src/components/countdown.tsx`** (renombra `trivia-countdown.tsx` →
  `countdown.tsx`, con su `.module.css`/`.spec.tsx`): ya es puramente presentacional
  (número grande de segundos restantes), sin nada específico de Trivia en su
  implementación — el nombre quedaba desalineado apenas un segundo minijuego lo
  necesita. Se actualizan los imports en `screen-trivia.tsx` y su spec; sin cambios de
  comportamiento.
- **`src/lib/game-sounds.ts`** (renombra `trivia-sounds.ts` → `game-sounds.ts`, mismo
  motivo — helper de sonido ya genérico, usado ahora por dos minijuegos): mismos
  `playCorrectSound()`/`playIncorrectSound()` existentes (se actualiza el import en
  `screen-trivia.tsx` y su spec) más dos funciones nuevas:
  - **`playPassSound()`**: sonido corto y neutro (ej. un solo tono medio, sin la
    envolvente "ascendente" de acierto ni el tono grave de error) — pide `spec.md`
    explícitamente que sea distinto al de "incorrecta"; acá no hay concepto de
    "incorrecta" (no hay respuestas equivocadas, solo adivinada/paso/tiempo agotado), así
    que la distinción real es frente a `playCorrectSound`.
  - **`playVictorySound()`**: jingle corto y divertido (3-4 notas, más largo que los
    otros dos) para el equipo con más puntos en `gestos_match_result`. Mismo mecanismo
    (osciladores + envolvente, sin archivos externos).
  - Se reproducen **solo desde `screen-gestos.tsx`** (dispositivo del host), igual que
    ya exige `spec.md` para los sonidos de Trivia.

### 4. Pantalla — `app/screen/[roomCode]/screen-gestos.tsx`

Se monta cuando `state.currentGame === 'caras-y-gestos'`. Renderiza según
`gestos.phase`:

- `idle`: dispara `startGestosGame()`, muestra "Arrancando Caras y Gestos…".
- `waiting_turn`: nombre + equipo del jugador en turno, mensaje tipo "Que se pare
  frente a la pantalla y presione Iniciar en su celular".
- `acting`: la palabra activa en grande, `Countdown` con `remainingSeconds`, y un
  contador chico de progreso ("2/5 adivinadas" a partir de `palabrasRestantes`).
- Cada `gestos_word_update` recibido (mientras `gestos.phase === 'acting'`) dispara
  `playCorrectSound()` o `playPassSound()` según su campo `motivo` (`'adivinada'` |
  `'paso'`, ver `caras-y-gestos-module/analysis.md`) — sin inferir nada del estado
  anterior, el backend lo manda explícito. Mismo criterio de `useEffect` con la acción
  recibida como dependencia que ya usa `screen-trivia.tsx`.
- `turn_result`: nombre del jugador + puntos ganados + lista de palabras adivinadas
  este turno. No reproduce sonido propio — el de la última palabra ya sonó desde
  `gestos_word_update` (o, si el turno terminó por tiempo con una palabra a medio
  actuar, no hay sonido adicional que reproducir).
- `match_result`: puntaje final por equipo (`scores`) + lista de palabras adivinadas
  por equipo (`palabrasPorEquipo`), `playVictorySound()` una vez (mismo criterio de
  `useEffect` con `[gestos]`) resaltando al equipo (o equipos, en caso de empate) con
  más puntos.

### 5. Celular — `app/play/[roomCode]/play-gestos.tsx`

Según `gestos.phase` de la versión "jugador":

- `idle` / `waiting_turn`: "Esperando..." + "Le toca a **[nombre]**" si hay dato.
- `ready_to_start`: mensaje corto ("¡Te toca!") + botón grande "Iniciar" →
  `startGestosTurn()`.
- `my_turn_active`: sin palabra, solo dos botones grandes "Adivinada" / "Paso" →
  `markGestureWord('adivinada' | 'paso')`. Sin `Countdown` — el jugador está de pie
  mirando la pantalla compartida, no su celular, para el tiempo.
- `turn_result` con `resultado.playerId === miPlayerId`: puntos ganados este turno +
  lista de palabras adivinadas.
- `turn_result` con `resultado.playerId !== miPlayerId`: mensaje corto ("[nombre]
  adivinó N de 5").
- `match_result`: puntaje final del propio equipo destacado + sus palabras adivinadas.
- Muestra `actionError` si el servidor rechaza una acción (ej. doble tap en "Iniciar").

### 6. Integración

- **`screen-lobby.tsx`** / **`play-lobby.tsx`**: agregan el caso
  `state.currentGame === 'caras-y-gestos'` → `<ScreenGestos>` / `<PlayGestos>`, mismo
  criterio que ya usa Trivia.
- **`game-selection-ui`**: agrega "Caras y Gestos" a la lista de juegos disponibles del
  panel (ya genérico por `GameId`, ver `game-selection/analysis.md`).

**Límite explícito (no se resuelve acá)**: recargar la pantalla o el celular a mitad de
turno pierde el turno en curso — mismo límite ya documentado en `trivia-ui/analysis.md`,
Fase 4 lo va a resolver para todos los minijuegos a la vez.

## Pruebas

- Unitarias (Vitest): `gestos-match.spec.ts` (reducer, ambas variantes
  pantalla/jugador), ampliación de `use-room-state.spec.ts` y `use-join-room.spec.ts`
  con el `FakeSocket` ya usado ahí, `screen-gestos.spec.tsx` (incluye verificar que se
  llaman los sonidos correctos según la fase, mockeando `game-sounds.ts`),
  `play-gestos.spec.tsx` (distingue `ready_to_start` de `my_turn_active`, nunca muestra
  una palabra), `countdown.spec.tsx` (migrado de `trivia-countdown.spec.tsx`, mismas
  pruebas, nuevo nombre), ampliación de `screen-lobby.spec.tsx` / `play-lobby.spec.tsx`
  para el nuevo caso de `currentGame`.
- No incluye e2e de Playwright — se agrega junto con la tarea equivalente de Trivia
  ("Pruebas unitarias de las reglas + e2e...", Fase 2) si para entonces sigue pendiente,
  o como tarea propia si Trivia ya cerró la suya.

## Checklist manual

Aplica el checklist completo de `testing-strategy.md`, más lo propio de Caras y Gestos:

- [ ] Legibilidad de la palabra en la TV/proyector a la distancia típica desde la que
      se juega, y del contador de tiempo.
- [ ] Confirmar que el celular del actor nunca muestra la palabra (ni un instante) en
      ninguna fase del turno — solo "Iniciar" y después "Adivinada"/"Paso".
- [ ] Tamaño de los botones "Iniciar", "Adivinada" y "Paso" en el celular (se presionan
      rápido, con el jugador de pie).
- [ ] Los tres sonidos (acierto, paso, victoria) suenan por la pantalla compartida
      (host), no por los celulares.
- [ ] Partida completa de punta a punta con equipos de tamaño distinto — confirmar el
      reparto de turnos (reusa `distributeTurns`, ya validado por Trivia) jugando, no
      solo en la prueba unitaria.
- [ ] Caso límite: un equipo adivina las 5 palabras antes de que se acabe el minuto →
      el turno termina de inmediato, sin esperar el resto del tiempo.
- [ ] Caso límite: se acaba el minuto con palabras pendientes → solo suman las
      adivinadas, sin puntos negativos.
- [ ] "Paso" repetido sobre la misma palabra varias veces dentro del mismo turno no la
      pierde — sigue disponible hasta que se acabe el tiempo o se adivine.
- [ ] F5 en `/screen` o `/play` a mitad de turno: no rompe la sala (se espera perder el
      turno en curso, no un crash — ver límite explícito arriba).
- [ ] A los 10s de terminar la partida, la pantalla vuelve sola al panel de selección
      de juego.
- [ ] El resumen final (puntaje + palabras adivinadas por equipo) se lee bien en TV/
      proyector con 2 equipos y con 3+.
