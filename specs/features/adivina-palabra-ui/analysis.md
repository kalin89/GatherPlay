# Componentes de pantalla y control para Adivina la palabra — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). Depende de
`specs/features/adivina-palabra-module/analysis.md` (backend) y de
`specs/features/game-selection-ui/analysis.md` (panel que decide qué componente de
juego se monta según `RoomState.currentGame`). Mismo patrón que
`specs/features/trivia-ui/analysis.md`.

No incluye pruebas e2e de Playwright — van junto con las del backend en
`adivina-palabra-module/analysis.md` (a diferencia de Trivia, acá no hace falta un
archivo e2e separado por fase: el camino feliz completo, con sockets reales, ya lo
cubre esa tarea porque no depende de detalles visuales para validarse).

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "11. Adivina la palabra".

## Diseño

### 1. Tipos y estado puro — `apps/frontend/src/lib/`

- **`adivina-palabra-types.ts`**: espejo de
  `apps/backend/src/adivina-palabra/adivina-palabra.types.ts` (`adivina_turn_waiting`,
  `adivina_pantalla_estado`, `adivina_jugador_estado`, `adivina_turn_result`,
  `adivina_match_result`, `AdivinaTurnResult`).
- **`adivina-palabra-match.ts`**: reducer puro `adivinaPalabraReducer(state, action)`.
  ```ts
  type AdivinaPalabraView =
    | { phase: 'idle' }
    | { phase: 'waiting_ready'; playerId: string; playerName: string; teamId: string }
    | { phase: 'active_screen'; playerId: string; playerName: string; teamId: string; palabra: string | null; remainingSeconds: number; pasesRestantes: number }
    | { phase: 'active_player'; remainingSeconds: number; pasesRestantes: number }
    | { phase: 'turn_result'; resultado: AdivinaTurnResult }
    | { phase: 'match_result'; scores: TeamScore[]; palabrasPorEquipo: { teamId: string; palabras: string[] }[] };
  ```
  Un solo reducer para pantalla y jugador, mismo criterio que `triviaReducer`: la
  distinción está en qué eventos le llegan a cada socket, no en dos variantes de
  estado. La pantalla recibe `adivina_pantalla_estado` (con palabra) → fase
  `active_screen`; el jugador en turno recibe `adivina_jugador_estado` (sin palabra)
  → fase `active_player`. `waiting_ready` es común a ambos (todos reciben
  `adivina_turn_waiting`); cada componente decide qué mostrar comparando
  `playerId === miPlayerId` (solo relevante en `/play`, la pantalla siempre lo muestra
  igual). El cliente no decide puntaje ni arma el orden de turnos: solo refleja lo que
  el servidor manda (`plan.md`).
- **`adivina-palabra-match.spec.ts`**: transiciones del reducer para ambas variantes de
  consumo (pantalla recibe `active_screen`, jugador en turno recibe `active_player`,
  el resto de los jugadores se queda en `waiting_ready` durante todo el turno ajeno).

### 2. Hooks

- **`use-room-state.ts`** (pantalla): agrega `adivinaPalabra` (vía `useReducer` +
  `subscribeToAdivinaPalabra`) y la acción `startAdivinaPalabraGame()` → emite
  `start_adivina_palabra_game { code }`.
  - **Auto-arranque**: `screen-adivina-palabra.tsx` (no el hook) dispara
    `startAdivinaPalabraGame()` una sola vez al montarse con
    `adivinaPalabra.phase === 'idle'` (`useRef` de guarda), mismo criterio que
    `screen-trivia.tsx`.
- **`use-join-room.ts`** (celular): agrega `adivinaPalabra` y tres acciones:
  `markReady()` → `adivina_ready`, `markGuessed()` → `adivina_guess`, `markPassed()` →
  `adivina_pass`. Reusa el patrón `error`/`actionError` ya existente (ej. un "Paso"
  rechazado por límite alcanzado no debe sacar al jugador de la vista — aunque el botón
  ya debería estar deshabilitado antes de eso).

### 3. Componentes compartidos

- **`src/components/adivina-palabra-word.tsx`** (+ `.module.css`, `.spec.tsx`): la
  palabra actual en tipografía grande, para la pantalla compartida. Con `palabra: null`
  (caso límite de pool agotado) muestra "Sin más palabras…" en vez de romper.
- **`src/lib/trivia-sounds.ts`**: se reutiliza tal cual para
  `playCorrectSound()`/`playIncorrectSound()` en "Adivinada"/"Paso" — pedido explícito
  de `spec.md`. Se agrega **una función nueva**, `playVictorySound()` (sintetizada con
  Web Audio API, mismo criterio que las otras dos, sin archivos de audio), para el
  sonido de fin de partida. **Nota de esta iteración**: agregarla a un archivo que se
  llama `trivia-sounds.ts` acopla nominalmente un sonido de otro juego a Trivia; se
  deja así por ahora para no renombrar/mover código de una tarea ya cerrada sin
  necesidad concreta — si un tercer juego necesita sonidos compartidos, ahí sí conviene
  extraer un `game-sounds.ts` neutral con las tres funciones.
- Se reutiliza **`src/components/trivia-countdown.tsx`** tal cual para el conteo
  regresivo (ya es genérico — un número grande de segundos restantes, sin lógica de
  Trivia adentro).

### 4. Pantalla — `app/screen/[roomCode]/screen-adivina-palabra.tsx`

Se monta cuando `state.currentGame === 'adivina-palabra'`. Renderiza según
`adivinaPalabra.phase`:

- `idle`: dispara `startAdivinaPalabraGame()` y muestra "Arrancando Adivina la
  palabra…".
- `waiting_ready`: nombre del equipo y del Adivinador en turno, marcador actual,
  mensaje de "esperando que presione Listo".
- `active_screen`: `AdivinaPalabraWord` con la palabra actual (o "Sin más palabras…"),
  `TriviaCountdown` con `remainingSeconds`, marcador, nombre del Adivinador en turno.
- `turn_result`: lista de palabras adivinadas (verde) y pasadas (rojo) del
  `resultado`, puntos ganados en el turno, mensaje "Siguiente Jugador {Nombre}" tomado
  del próximo `adivina_turn_waiting` que ya debería haber llegado casi al mismo tiempo
  (mismo criterio que Trivia con `waiting_turn`/`turn_started` casi simultáneos). Se
  queda así indefinidamente — no hay temporizador de frontend, es el próximo jugador
  quien avanza presionando "Listo" desde su celular.
- `match_result`: puntaje final por equipo, palabras adivinadas por equipo
  (`palabrasPorEquipo`), y **sonido de victoria** (`playVictorySound()`, en un
  `useEffect` con `[adivinaPalabra]` como dependencia, mismo criterio anti-duplicado
  que usa `screen-trivia.tsx` con los sonidos de acierto/error). El equipo(s) ganador
  se calcula en el propio componente comparando `scores` (mayor puntaje; empate
  posible, se resaltan todos los que empatan en el máximo) — el backend no manda un
  campo "ganador" explícito, mismo criterio minimalista que ya usa Trivia con sus
  resultados.

### 5. Celular — `app/play/[roomCode]/play-adivina-palabra.tsx`

Según `adivinaPalabra.phase`:

- `idle` / `waiting_ready` con `playerId !== miPlayerId`: "Es el turno de **[equipo]**
  — le toca a **[nombre]**", marcador visible.
- `waiting_ready` con `playerId === miPlayerId`: botón grande "Listo" (con espacio
  para que la persona se acomode y le dé la espalda a la pantalla antes de tocar).
- `active_player`: solo dos botones grandes, "Adivinada" y "Paso" — nunca texto de la
  palabra (el backend nunca la manda a este socket, así que no hay nada que ocultar a
  propósito en el cliente, es una garantía de origen). "Paso" se deshabilita cuando
  `pasesRestantes === 0`. Countdown opcional (`remainingSeconds`) chico, no
  protagonista — la persona no debería estar mirando el celular más que para tocar los
  botones.
- `active_screen` (no debería llegar nunca a `/play`, ver diseño del reducer) — no
  aplica, mismo resguardo defensivo mínimo que Trivia con casos que "no deberían
  verse".
- `turn_result`: si el turno fue propio, resumen de puntos ganados; si fue de otro
  jugador (de cualquier equipo), mensaje corto ("[nombre] adivinó N palabras").
- `match_result`: puntaje final del propio equipo destacado, sin sonido (el sonido de
  victoria suena solo desde la pantalla/host, según `spec.md` — igual que los de
  acierto/error).
- Muestra `actionError` si el servidor rechaza una acción (ej. "Paso" ya en el límite).

### 6. Integración

- **`screen-lobby.tsx`**: `state.currentGame === 'adivina-palabra'` →
  `<ScreenAdivinaPalabra>`.
- **`play-lobby.tsx`**: mismo criterio, `<PlayAdivinaPalabra>`.

**Límite explícito (no se resuelve acá)**: recargar la pantalla o el celular a mitad de
turno pierde el turno en curso — mismo límite ya documentado para Trivia, encaja con
"Manejo de reconexión" de Fase 4.

## Pruebas

- Unitarias (Vitest): `adivina-palabra-match.spec.ts` (reducer, ambas variantes),
  `adivina-palabra-word.spec.tsx` (incluido el caso `palabra: null`), ampliación de
  `use-room-state.spec.ts` y `use-join-room.spec.ts` con el `FakeSocket` ya usado en
  esos archivos, `screen-adivina-palabra.spec.tsx` (incluye verificar que
  `playVictorySound` se llama una sola vez al llegar `match_result`, mockeando
  `trivia-sounds.ts`), `play-adivina-palabra.spec.tsx` (el DOM nunca contiene la
  palabra actual en ningún momento del turno propio — assertion explícita de
  privacidad, no solo de comportamiento; "Paso" se deshabilita al agotar los 3
  intentos), ampliación de `screen-lobby.spec.tsx`/`play-lobby.spec.tsx` para el nuevo
  caso de `currentGame`.

## Checklist manual

Aplica el checklist completo de `testing-strategy.md`, más lo propio de este juego:

- [ ] Legibilidad de la palabra en la TV/proyector a la distancia típica desde la que
      se juega.
- [ ] Confirmar que el celular del Adivinador NUNCA muestra la palabra, ni un instante,
      en ningún punto del turno (revisar también con las devtools abiertas, no solo a
      simple vista).
- [ ] El sonido de acierto/error/victoria suena por la pantalla compartida (host), no
      por los celulares de los jugadores.
- [ ] Al llegar a 3 "Paso" en un turno, el botón se deshabilita visualmente en el
      celular del Adivinador (y no solo del lado del servidor).
- [ ] Partida completa de punta a punta con equipos de tamaño distinto — confirmar la
      alternancia de turnos entre equipos jugando, no solo en la prueba unitaria.
- [ ] Jugar dos partidas seguidas de "Adivina la palabra" en la misma sala y confirmar
      a ojo que no se repite ninguna palabra ya vista (salvo agotamiento del banco,
      caso límite aceptado).
- [ ] Botón "Listo" da tiempo real de acomodarse (probarlo como se juega de verdad: el
      Adivinador dándole la espalda a la pantalla antes de tocarlo).
- [ ] A los 10s de terminar la partida, la pantalla vuelve sola al panel de selección
      de juego, sin tener que tocar nada.
- [ ] El resumen verde/rojo del turno se entiende de un vistazo desde la distancia
      típica de la TV.
- [ ] Si el tiempo se agota con una palabra mostrada sin resolver, esa palabra aparece
      en rojo (pasada) en el resumen, no desaparece sin explicación.
