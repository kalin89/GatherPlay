# Componentes de pantalla y control para La Rocola — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). Depende de
`specs/features/la-rocola-module/analysis.md` (backend) y de
`specs/features/game-selection-ui/analysis.md` (panel que decide qué componente de
juego se monta según `RoomState.currentGame`). Primera implementación real de la
convención de pantalla de juego (`spec.md` → "Convenciones de toda pantalla de
juego") — construye los 4 componentes genéricos que la tarea de `tasks.md` "Adaptar
Trivia, Caras y Gestos y Adivina la palabra..." va a reusar tal cual.

No incluye pruebas e2e de Playwright — mismo criterio que
`adivina-palabra-ui/analysis.md`: el camino feliz con sockets reales ya lo cubre
`la-rocola-module/analysis.md`.

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "8. La Rocola" y "Convenciones de toda pantalla de
juego".

## 1. Componentes genéricos de convención — `apps/frontend/src/components/`

Se usan desde La Rocola en esta tarea; quedan disponibles para cualquier juego nuevo y
para la tarea de retrofit de los 3 juegos existentes.

- **`game-instructions.tsx`** (+ `.module.css`, `.spec.tsx`): `{ title: string;
  bullets: string[] }` → tarjeta centrada con título y lista breve de puntos. Sin
  lógica de "Listo" adentro (la tiene `ReadyButton`, abajo) — un componente, una
  responsabilidad.
- **`ready-button.tsx`** (+ `.module.css`, `.spec.tsx`): `{ onReady: () => void;
  pressed: boolean; readyCount: number; totalCount: number }`. Botón grande "Listo";
  al presionarlo llama `onReady` una sola vez (se deshabilita, `pressed` lo refleja
  para sobrevivir un remount) y muestra debajo "Esperando a los demás (`readyCount`/`totalCount`)".
  Con `readyCount === totalCount` no se renderiza (el padre ya debería haber ocultado
  las instrucciones al recibir el evento de arranque real del juego).
- **`match-scoreboard.tsx`** (+ `.module.css`, `.spec.tsx`): `{ teams: Team[]; scores:
  { teamId: string; score: number }[] }` → mismos chips que `TeamScoreboard` (nombre +
  color + puntaje) pero en un contenedor posicionado en la esquina superior derecha
  (`position: absolute; top; right`, dentro de un `main` con `position: relative`) para
  cumplir "esquina superior derecha" de la convención sin duplicar el diseño visual de
  los chips — reusa el mismo patrón de swatch que ya existe en
  `screen-adivina-palabra.tsx`/`screen-trivia.tsx`, no una librería nueva.
- **`match-winner-banner.tsx`** (+ `.module.css`, `.spec.tsx`): `{ teams: Team[];
  scores: { teamId: string; score: number }[] }`. Calcula el puntaje máximo; si más de
  un equipo lo alcanza → texto "Empate"; si no → "El ganador de este juego es el
  equipo **{nombre}**" con el color del equipo. Mismo criterio ya usado en
  `screen-adivina-palabra.tsx` para resaltar ganador(es), ahora extraído a componente
  compartido con el texto exacto que pide `spec.md`.

## 2. Tipos y estado puro — `apps/frontend/src/lib/`

- **`la-rocola-types.ts`**: espejo de `apps/backend/src/la-rocola/la-rocola.types.ts`
  (incluye `RocolaRoundResult.respuesta` y `RocolaAnswerTickPayload`).
- **`la-rocola-match.ts`**: reducer puro `laRocolaReducer(state, action)`.
  ```ts
  type LaRocolaView =
    | { phase: 'idle' }
    | { phase: 'waiting_ready'; readyPlayerIds: string[]; eligiblePlayerIds: string[] }
    | {
        phase: 'countdown';
        remainingSeconds: number;
        roundNumber: number;
        totalRounds: number;
        marcador: TeamScore[];
      }
    | { phase: 'sonando'; roundNumber: number; totalRounds: number; marcador: TeamScore[] }
    | {
        phase: 'respondiendo'; // y una variante idéntica separada para 'robo_respondiendo'
        roundNumber: number;
        buzzedPlayerId: string;
        buzzedPlayerName: string;
        buzzedTeamId: string;
        remainingSeconds: number; // 30 → 0, actualizado por rocola_answer_tick
        marcador: TeamScore[];
      }
    | {
        phase: 'robo';
        roundNumber: number;
        eligibleTeamIds: string[];
        eligibleTeamNames: string[];
        remainingSeconds: number;
        marcador: TeamScore[];
      }
    | { phase: 'revelacion'; resultado: RocolaRoundResult; marcador: TeamScore[] }
    | {
        phase: 'match_result';
        scores: TeamScore[];
        canciones: { titulo: string; artista: string; teamId: string | null }[];
      };
  ```
  `respondiendo` y `robo_respondiendo` son dos variantes separadas del union (mismos
  campos) en vez de un solo miembro con `phase: 'respondiendo' | 'robo_respondiendo'`
  — necesario para que TypeScript pueda angostar el tipo por completo fuera de un
  `if`/`switch` que cubre ambos casos (con un único miembro de discriminante compuesto,
  el compilador no elimina el miembro entero de la unión). `roundNumber` se lleva de
  fase en fase (`carryRoundNumber`) únicamente para poder armar una `key` de React
  estable en `play-la-rocola.tsx` (ver sección 6) — no se muestra en ningún lado.
  `rocola_audio_control` **no** pasa por este reducer — es un comando imperativo para
  el `<audio>` de la pantalla, manejado aparte en `use-room-state.ts` (ver "Hooks").
  Un solo reducer para pantalla y jugador, mismo criterio que `adivinaPalabraReducer`.
  El cliente no decide puntaje ni arma canciones ni juzga respuestas: solo refleja lo
  que manda el servidor (`plan.md`).
- **`la-rocola-match.spec.ts`**: transiciones del reducer, incluida la ida y vuelta
  `respondiendo` → `robo` → `robo_respondiendo` → `revelacion`, y que
  `rocola_answer_tick` solo actualiza `remainingSeconds` en esas dos fases.

## 3. Hooks

- **`use-room-state.ts`** (pantalla): agrega `laRocola` (vía `useReducer` +
  `subscribeToLaRocola`), la acción `startLaRocolaGame(filtro?: RocolaFiltro)` → emite
  `start_la_rocola_game { code, filtro }`, y `laRocolaAudio` — un `useState` **separado**
  del reducer (`{ action, previewUrl?, nonce } | null`), actualizado por un listener
  propio de `rocola_audio_control` con un `nonce` nuevo por evento para que un
  `useEffect({[laRocolaAudio]})` en la pantalla dispare exactamente una vez por
  comando, incluso si dos comandos seguidos tienen el mismo `action` (ej. dos
  `pause` distintos no deberían colapsar en un solo efecto).
  - **Ya no hay auto-arranque.** Antes del filtro, `screen-la-rocola.tsx` disparaba
    `startLaRocolaGame()` solo al montarse con `laRocola.phase === 'idle'`. Ahora
    `idle` es donde vive el selector de filtro (sección 5b) — `startLaRocolaGame` se
    llama recién cuando el host presiona "Empezar" ahí, con el `filtro` que haya
    elegido (o `undefined`).
  - Agrega `getRocolaArtists()` → emite `rocola_get_artists { code }`, y
    `rocolaArtists: string[] | null` (`null` = todavía no llegó la respuesta),
    actualizado por un listener de `rocola_artists` (respuesta directa al socket, no
    pasa por el reducer — no es "estado de partida", es una lista estática de
    catálogo). Se pide una sola vez, al montar la pantalla, independientemente de
    `laRocola.phase` (no hace falta esperar nada del backend para pedirla).
- **`use-join-room.ts`** (celular): agrega `laRocola` y tres acciones: `markRocolaReady()`
  → `rocola_ready`, `rocolaBuzz()` → `rocola_buzz`, `submitRocolaAnswer(texto)` →
  `rocola_submit_answer { code, texto }`. Reusa el patrón `actionError` existente (ej.
  un buzz fuera de tiempo por latencia de red no debe sacar al jugador de la vista).
  No necesita `getRocolaArtists`/`startLaRocolaGame` — esas son acciones de host, viven
  solo en `use-room-state.ts`.

## 4. Sonido nuevo — `src/lib/game-sounds.ts`

Se agrega **`playTickSound()`** (sintetizada con Web Audio API, mismo criterio que las
demás — sin archivos externos): un tono corto y seco, distinto de
`playCorrectSound`/`playIncorrectSound`/`playVictorySound` ya existentes, pensado para
repetirse 5 veces seguidas sin cansar el oído. Cumple el pedido explícito de `spec.md`
("si ya existe uno, reutilizarlo" — no existe todavía, se crea acá y queda disponible
para cualquier conteo regresivo futuro, mismo espíritu que ya se aplicó con
`playVictorySound` en la tarea de Adivina la palabra).

## 5. Pantalla — `app/screen/[roomCode]/screen-la-rocola.tsx`

Se monta cuando `state.currentGame === 'la-rocola'`. Mantiene un `<audio>` vía `useRef`
(nunca se renderiza con controles visibles — el control es 100% por eventos del
servidor) y responde a los comandos de `rocola_audio_control` con un `useEffect` sobre
un callback separado del reducer principal (no dispara re-render de la vista, solo
maneja el elemento de audio):

- `play`: `audioRef.current.src = previewUrl; audioRef.current.play()`.
- `pause`: `audioRef.current.pause()`.
- `resume`: `audioRef.current.play()` (mismo elemento, conserva `currentTime`).

Renderiza según `laRocola.phase`, con `<MatchScoreboard>` siempre visible (excepto en
`idle`) usando `marcador`/`scores` de cada fase:

- `idle`: **ya no dispara nada solo** — muestra el selector de filtro del host, ver
  sección 5b. `<MatchScoreboard>` no se muestra en esta fase (no hay partida creada
  todavía, no hay marcador que mostrar).
- `waiting_ready`: `<GameInstructions>` (título "La Rocola", bullets: "Se juegan 10
  canciones", "En cuanto empieza a sonar, el primero en presionar ¡Me la sé! tiene 30
  segundos para escribir el nombre de la canción", "No hace falta tipearlo perfecto —
  se toleran errores de tipeo", "Si falla, el equipo contrario tiene 5 segundos para
  robar el punto") + progreso "{readyPlayerIds.length}/{eligiblePlayerIds.length}
  jugadores listos" (la pantalla no tiene su propio "Listo", solo observa).
- `countdown`: número grande `remainingSeconds` (reusa `<Countdown>` ya existente),
  `playTickSound()` en un `useEffect` con `[remainingSeconds]` como dependencia (mismo
  criterio anti-duplicado que otros sonidos ya usan con el objeto de vista completo).
  En 0 (transición a `sonando`, no en esta fase) aparece el texto grande.
- `sonando`: texto grande "🎵 Adivina la canción", número de ronda (`{roundNumber} de
  {totalRounds}`).
- `respondiendo` / `robo_respondiendo`: "**{buzzedPlayerName}** está escribiendo la
  respuesta…" + `<Countdown seconds={remainingSeconds}>` (30 → 0).
- `robo`: "Robo de punto del equipo {nombres}" (uno o varios, `eligibleTeamNames.join('/')`
  si son más de uno) + cuenta regresiva chica de `remainingSeconds`.
- `revelacion`: portada, título y artista de `resultado`, con "**{playerName}** acertó
  (+1 {teamName})" o "Nadie acertó" según `resultado.teamId`, más "Escribió:
  “{resultado.respuesta}”" en cursiva cuando `respuesta` no está vacía — transparencia
  sobre qué se juzgó, ya que ahora el juicio es automático y no del grupo.
- `match_result`: `<MatchWinnerBanner>` + lista de canciones jugadas con su equipo
  ganador (o "nadie" si `teamId` es `null`), `playVictorySound()` una sola vez al
  llegar (mismo criterio anti-duplicado con `[laRocola]` como dependencia que ya usan
  `screen-trivia.tsx`/`screen-adivina-palabra.tsx`).

## 5b. Selector de filtro (host) — reemplaza el auto-arranque en `idle`

Nuevo, dentro del mismo `screen-la-rocola.tsx`. Es lo primero que ve el host apenas
elige "La Rocola" desde el panel de selección — antes de la convención de
instrucciones + "Listo" (spec.md → "8. La Rocola", primer criterio nuevo). Los
celulares de los jugadores no participan de esta pantalla (siguen en `idle`, ver
sección 6).

- Al montarse, pide la lista de artistas una sola vez: `getRocolaArtists()`. Mientras
  `rocolaArtists === null`, la opción "Por artista" se muestra pero deshabilitada (con
  un texto chico "Cargando artistas…") — no bloquea elegir "Aleatorio" o "Por género"
  mientras tanto.
- Control segmentado de 3 opciones, **"Aleatorio" seleccionado por default**:
  - **Aleatorio**: sin controles adicionales.
  - **Por género**: `<select>` con las 8 opciones de `ROCOLA_GENEROS` (mismo listado
    que el backend — se mantiene a mano en `la-rocola-types.ts`, mismo criterio de
    "espejo del backend" que el resto de los tipos de este juego).
  - **Por artista**: `<select>` poblado con `rocolaArtists` (nunca un `<input>` de
    texto libre — decisión de Kalin, cero riesgo de "artista no encontrado" por
    tipeo).
- Botón **"Empezar"**: deshabilitado si se eligió "Por artista"/"Por género" pero
  todavía no se seleccionó ningún valor concreto en el `<select>` correspondiente (el
  placeholder inicial de cada `<select>` es un valor vacío no seleccionable). Al
  presionarlo, llama `startLaRocolaGame(filtro)` con:
  - `undefined` si la opción es "Aleatorio".
  - `{ tipo: 'genero', genero }` o `{ tipo: 'artista', artista }` según corresponda.
- Si el servidor rechaza por `InsufficientFilteredSongsError` (llega por el canal
  `error`/`actionError` ya existente, mismo patrón que cualquier otro rechazo de
  acción de host en este código), se muestra inline, junto al selector, algo como
  "Ese filtro tiene solo {disponibles} canciones — probá otro o dejalo en Aleatorio" —
  **sin** resetear la selección que el host ya había hecho, para que pueda ajustar sin
  volver a armar todo desde cero.

## 6. Celular — `app/play/[roomCode]/play-la-rocola.tsx`

- **`idle`** (nuevo, corregido por el filtro): mientras el host todavía está eligiendo
  el filtro (sección 5b), la partida ni siquiera existe del lado del backend — mostrar
  el `<ReadyButton>` acá sería un error esperando a pasar (`NoRocolaMatchError` al
  presionarlo). Se muestra solo `<GameInstructions>` + un mensaje "Esperando a que el
  anfitrión configure la partida…", **sin** `<ReadyButton>`. Esto es un fix sobre el
  diseño original de `la-rocola-module`/`la-rocola-ui` (antes `idle` y `waiting_ready`
  compartían la misma rama de código y el botón se renderizaba en ambos con
  `readyCount`/`totalCount` en `0/0`) — el filtro alarga esa ventana de espera lo
  suficiente como para que valga la pena arreglarlo ahora.
- `waiting_ready`: `<GameInstructions>` (mismo texto que la pantalla) +
  `<ReadyButton onReady={markRocolaReady} pressed={...} readyCount={...}
  totalCount={...}>`.
- `countdown`: mensaje corto "Prepárate…" sin número (el conteo protagoniza la
  pantalla, no el celular).
- `sonando`: `<BuzzButton>` (subcomponente local, ver abajo) — botón redondo verde
  "¡Me la sé!".
- `respondiendo` / `robo_respondiendo` con `playerId === miPlayerId`: `<AnswerForm>`
  (subcomponente local) — campo de texto + botón "Enviar" + cuenta regresiva chica de
  `remainingSeconds`. Con `playerId !== miPlayerId`: mensaje "**{buzzedPlayerName}**
  está escribiendo… ({remainingSeconds}s)", sin campo de texto.
- `robo`: mismo `<BuzzButton>`, con `disabled` si el equipo propio no está en
  `eligibleTeamIds` (más el texto "Tu equipo no puede robar esta vez" — validación de
  UI, el servidor igual la aplica).
- `revelacion`: resumen corto ("¡Acertaste! +1 punto" / "{nombre} acertó" / "Nadie
  acertó") + el título/artista real debajo, sin sonido (los sonidos de esta pantalla
  suenan solo desde el host, mismo criterio que el resto de los juegos).
- `match_result`: puntaje final del propio equipo destacado, sin sonido.
- Muestra `actionError` si el servidor rechaza una acción (ej. buzz tarde, equipo no
  elegible en robo).

### `<BuzzButton>` y `<AnswerForm>` (subcomponentes locales del archivo)

Ambos manejan su propio guard de "ya lo usé" con `useState` local — se montan de
nuevo (y por lo tanto resetean ese estado) cada vez que cambia la `key` que les pasa
el padre: `key={`sonando-${roundNumber}`}`/`key={`robo-${roundNumber}`}` para
`BuzzButton`, `key={`answer-${phase}-${roundNumber}`}` para `AnswerForm` — así
`sonando` y un eventual `robo` son oportunidades de buzzer distintas aunque compartan
estructura visual, sin depender de un efecto que llame `setState` solo para
"resetear" el guard entre rondas (evita el lint `react-hooks/set-state-in-effect`).

`AnswerForm` recibe `remainingSeconds` y `onSubmit(texto)`. Al llegar a 0 segundos,
envía automáticamente el valor actual del campo — spec.md: "se evalúa lo que haya
tecleado hasta ese momento" — vía un `useEffect([remainingSeconds, texto, onSubmit])`
que llama a `onSubmit` (nunca a un `setState` propio: el guard de "ya se auto-envió"
vive en un `useRef`, no en estado, precisamente para no disparar
`react-hooks/set-state-in-effect`). El campo/botón se deshabilitan con un booleano
derivado (`manuallySubmitted || remainingSeconds <= 0`), no con un estado separado
puesto desde el efecto.

## 7. Integración

- **`screen-lobby.tsx`**: `state.currentGame === 'la-rocola'` → `<ScreenLaRocola>`.
- **`play-lobby.tsx`**: mismo criterio, `<PlayLaRocola>`.
- **`game-catalog.ts`**: nueva entrada `{ id: 'la-rocola', label: 'La Rocola',
  description: 'El primero en presionar "¡Me la sé!" cuando suena la canción tiene la
  oportunidad de adivinarla.' }`.

**Límite explícito (no se resuelve acá)**: recargar la pantalla o el celular a mitad de
ronda pierde la ronda en curso — mismo límite ya documentado para los demás juegos,
encaja con "Manejo de reconexión" de Fase 4.

## Pruebas

- Unitarias (Vitest): `game-instructions.spec.tsx`, `ready-button.spec.tsx` (llama
  `onReady` una sola vez ante clics repetidos, muestra el conteo), `match-scoreboard.spec.tsx`,
  `match-winner-banner.spec.tsx` (empate vs. ganador único vs. ganador entre varios con
  el mismo puntaje máximo); `la-rocola-match.spec.ts` (reducer, incluido
  `rocola_answer_tick`); ampliación de `use-room-state.spec.ts`/`use-join-room.spec.ts`
  con el `FakeSocket` ya usado en esos archivos (incluye el `nonce` nuevo por cada
  `rocola_audio_control`); `screen-la-rocola.spec.tsx` (el `<audio>` recibe
  `play`/`pause`/`resume` según los eventos, `playTickSound`/`playVictorySound` se
  llaman las veces esperadas, mockeando `game-sounds.ts`, la revelación muestra la
  `respuesta` escrita); `play-la-rocola.spec.tsx` (el campo de texto solo aparece para
  `playerId === miPlayerId`, enviar llama a `submitRocolaAnswer` con el texto tipeado y
  deshabilita el formulario, al llegar a 0s se auto-envía lo tecleado sin haber
  presionado "Enviar", el botón de robo está deshabilitado si el equipo propio no es
  elegible); ampliación de `screen-lobby.spec.tsx`/`play-lobby.spec.tsx` para el nuevo
  caso de `currentGame`.
  - **Selector de filtro**: en `idle`, "Empezar" llama `startLaRocolaGame(undefined)`
    con "Aleatorio" (default); eligiendo "Por género" y un valor, llama con
    `{ tipo: 'genero', genero }`; "Por artista" deshabilitado mientras
    `rocolaArtists === null`, habilitado con la lista una vez llega; un
    `actionError` de `InsufficientFilteredSongsError` se muestra inline sin perder la
    selección ya hecha en el formulario. En `play-la-rocola.spec.tsx`: `idle` nunca
    muestra el botón "Listo" (a diferencia de `waiting_ready`, que sí).

## Checklist manual

Aplica el checklist completo de `testing-strategy.md`, más lo propio de este juego:

- [ ] La canción se escucha por las bocinas de la pantalla compartida (TV/laptop),
      nunca por los celulares.
- [ ] Al presionar "¡Me la sé!", la canción se pausa de inmediato (sin corte brusco
      perceptible) y se reanuda desde el mismo punto si hay robo de punto.
- [ ] El botón "¡Me la sé!" está realmente deshabilitado (no solo visualmente) mientras
      el conteo de 5s no llega a cero — probar tocarlo antes de tiempo.
- [ ] Escribir una respuesta con errores de tipeo reales (a mano, en un celular, con el
      teclado predictivo activado) y confirmar que se acepta cuando la idea es correcta.
- [ ] Dejar que se acaben los 30 segundos sin presionar "Enviar" y confirmar que lo que
      se alcanzó a escribir se juzga igual (no se pierde ni se ignora).
- [ ] Elegir un género y confirmar que las 10 canciones de esa partida son realmente de
      ese género (a oído/por el título revelado en cada ronda).
- [ ] Elegir un artista de la lista y confirmar lo mismo para artista.
- [ ] Probar un género/artista con pocas canciones en el banco y confirmar que el
      mensaje de "no alcanza" aparece antes de arrancar, no a mitad de partida.
- [ ] Cuando alguien presiona el botón, se deshabilita en TODOS los demás celulares casi
      instantáneamente (probar con 3+ celulares reales a la vez).
- [ ] El sonido de reloj del conteo, el de acierto/error (si se reutilizan) y el de
      victoria suenan por la pantalla compartida, no por los celulares de los
      jugadores.
- [ ] Portada, título y artista se leen bien en la TV/proyector a la distancia típica
      desde la que se juega.
- [ ] Jugar una partida completa con 3 equipos y confirmar que el robo de punto se
      ofrece a los dos equipos rivales, no solo a uno.
- [ ] Jugar dos partidas seguidas de "La Rocola" en la misma sala y confirmar a ojo que
      no se repite ninguna canción ya sonada (salvo agotamiento del banco, caso límite
      aceptado).
- [ ] Las instrucciones se ocultan en pantalla y en todos los celulares en el mismo
      instante en que el último jugador presiona "Listo" — probar con al menos 2
      celulares reales.
- [ ] A los 10s de terminar la partida, la pantalla vuelve sola al panel de selección
      de juego, sin tener que tocar nada.
