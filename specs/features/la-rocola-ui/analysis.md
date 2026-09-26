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

- **`la-rocola-types.ts`**: espejo de `apps/backend/src/la-rocola/la-rocola.types.ts`.
- **`la-rocola-match.ts`**: reducer puro `laRocolaReducer(state, action)`.
  ```ts
  type LaRocolaView =
    | { phase: 'idle' }
    | {
        phase: 'waiting_ready';
        readyPlayerIds: string[];
        eligiblePlayerIds: string[];
        marcador: TeamScore[];
      }
    | {
        phase: 'countdown';
        remainingSeconds: number;
        roundNumber: number;
        totalRounds: number;
        marcador: TeamScore[];
      }
    | {
        phase: 'sonando';
        roundNumber: number;
        totalRounds: number;
        marcador: TeamScore[];
        previewUrl: string | null; // solo llega en la pantalla, null en /play
      }
    | {
        phase: 'respondiendo' | 'robo_respondiendo';
        buzzedPlayerId: string;
        buzzedPlayerName: string;
        buzzedTeamId: string;
        marcador: TeamScore[];
      }
    | {
        phase: 'robo';
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
  Un solo reducer para pantalla y jugador, mismo criterio que `adivinaPalabraReducer`:
  la pantalla recibe además `rocola_audio_control` (ignorado por el reducer de
  `/play`, ver "Hooks" abajo — el jugador nunca necesita `previewUrl`). El cliente no
  decide puntaje ni arma canciones: solo refleja lo que manda el servidor (`plan.md`).
- **`la-rocola-match.spec.ts`**: transiciones del reducer, incluida la ida y vuelta
  `respondiendo` → `robo` → `robo_respondiendo` → `revelacion`, y que `sonando` solo
  trae `previewUrl` cuando la propia suscripción lo recibió (pantalla sí, jugador no).

## 3. Hooks

- **`use-room-state.ts`** (pantalla): agrega `laRocola` (vía `useReducer` +
  `subscribeToLaRocola`) y la acción `startLaRocolaGame()` → emite
  `start_la_rocola_game { code }`. Auto-arranque igual que los demás juegos:
  `screen-la-rocola.tsx` dispara `startLaRocolaGame()` una sola vez al montarse con
  `laRocola.phase === 'idle'` (`useRef` de guarda).
  - `subscribeToLaRocola` también escucha `rocola_audio_control` y lo expone aparte
    (no como parte de `LaRocolaView`, como un callback/efecto imperativo) — es un
    comando de reproducción, no un estado a renderizar; ver "Pantalla" abajo.
- **`use-join-room.ts`** (celular): agrega `laRocola` y cuatro acciones: `markReady()`
  → `rocola_ready`, `buzz()` → `rocola_buzz`, `markCorrect()` → `rocola_mark_correct`,
  `markIncorrect()` → `rocola_mark_incorrect`. Reusa el patrón `actionError` existente
  (ej. un buzz fuera de tiempo por latencia de red no debe sacar al jugador de la
  vista).

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

- `idle`: dispara `startLaRocolaGame()`, muestra "Arrancando La Rocola…".
- `waiting_ready`: `<GameInstructions>` (título "La Rocola", bullets: "Se juegan 10
  canciones", "En cuanto suene, el primero en presionar ¡Me la sé! tiene la
  oportunidad", "Digan la respuesta en voz alta — el grupo decide si es correcta",
  "Si fallan, el equipo contrario tiene 5 segundos para robar el punto") + progreso
  "{readyPlayerIds.length}/{eligiblePlayerIds.length} jugadores listos" (la pantalla no
  tiene su propio "Listo", solo observa).
- `countdown`: número grande `remainingSeconds` (reusa `<Countdown>` ya existente),
  `playTickSound()` en un `useEffect` con `[remainingSeconds]` como dependencia (mismo
  criterio anti-duplicado que otros sonidos ya usan con el objeto de vista completo).
  En 0 (transición a `sonando`, no en esta fase) aparece el texto grande.
- `sonando`: texto grande "🎵 Adivina la canción", número de ronda (`{roundNumber} de
  {totalRounds}`).
- `respondiendo` / `robo_respondiendo`: "**{buzzedPlayerName}** está respondiendo…"
  (equipo entre paréntesis).
- `robo`: "Robo de punto del equipo {nombres}" (uno o varios, `eligibleTeamNames.join('/')`
  si son más de uno) + cuenta regresiva chica de `remainingSeconds`.
- `revelacion`: portada, título y artista de `resultado`, con "**{playerName}** acertó
  (+1 {teamName})" o "Nadie acertó" según `resultado.teamId`.
- `match_result`: `<MatchWinnerBanner>` + lista de canciones jugadas con su equipo
  ganador (o "nadie" si `teamId` es `null`), `playVictorySound()` una sola vez al
  llegar (mismo criterio anti-duplicado con `[laRocola]` como dependencia que ya usan
  `screen-trivia.tsx`/`screen-adivina-palabra.tsx`).

## 6. Celular — `app/play/[roomCode]/play-la-rocola.tsx`

- `idle` / `waiting_ready` sin haber presionado "Listo": `<GameInstructions>` (mismo
  texto que la pantalla) + `<ReadyButton onReady={markReady} pressed={...}
  readyCount={...} totalCount={...}>`.
- `countdown`: mensaje corto "Prepárate…" sin número (el conteo protagoniza la
  pantalla, no el celular).
- `sonando`: **un único botón redondo verde** "¡Me la sé!", deshabilitado hasta que la
  fase sea efectivamente `sonando` (ya lo es en esta rama) y habilitado mientras nadie
  más haya buzzeado — en cuanto este jugador lo presiona, `buzz()` se llama una vez
  (guard local para no duplicar el emit por doble tap).
- `respondiendo` / `robo_respondiendo` con `playerId === miPlayerId`: dos botones
  grandes — verde con ✓, rojo con ✗ — que llaman `markCorrect()`/`markIncorrect()`.
  Con `playerId !== miPlayerId`: botón "¡Me la sé!" deshabilitado/atenuado con texto
  "**{buzzedPlayerName}** está respondiendo".
- `robo`: mismo botón verde "¡Me la sé!", habilitado solo si el equipo propio está en
  `eligibleTeamIds` (si no, deshabilitado con texto "Tu equipo no puede robar esta
  vez" — validación de UI, el servidor igual la aplica).
- `revelacion`: resumen corto ("¡Acertaste! +1 punto" / "{nombre} acertó" / "Nadie
  acertó"), sin sonido (los sonidos de esta pantalla suenan solo desde el host, mismo
  criterio que el resto de los juegos).
- `match_result`: puntaje final del propio equipo destacado, sin sonido.
- Muestra `actionError` si el servidor rechaza una acción (ej. buzz tarde, equipo no
  elegible en robo).

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
  el mismo puntaje máximo); `la-rocola-match.spec.ts` (reducer, ambas variantes de
  `sonando`); ampliación de `use-room-state.spec.ts`/`use-join-room.spec.ts` con el
  `FakeSocket` ya usado en esos archivos; `screen-la-rocola.spec.tsx` (el `<audio>`
  recibe `play`/`pause`/`resume` según los eventos, `playTickSound`/`playVictorySound`
  se llaman las veces esperadas, mockeando `game-sounds.ts`); `play-la-rocola.spec.tsx`
  (el botón de robo está deshabilitado si el equipo propio no es elegible, los botones
  ✓/✗ solo aparecen para `playerId === miPlayerId`); ampliación de
  `screen-lobby.spec.tsx`/`play-lobby.spec.tsx` para el nuevo caso de `currentGame`.

## Checklist manual

Aplica el checklist completo de `testing-strategy.md`, más lo propio de este juego:

- [ ] La canción se escucha por las bocinas de la pantalla compartida (TV/laptop),
      nunca por los celulares.
- [ ] Al presionar "¡Me la sé!", la canción se pausa de inmediato (sin corte brusco
      perceptible) y se reanuda desde el mismo punto si hay robo de punto.
- [ ] El botón "¡Me la sé!" está realmente deshabilitado (no solo visualmente) mientras
      el conteo de 5s no llega a cero — probar tocarlo antes de tiempo.
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
