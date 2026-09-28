# Componentes de pantalla y control para Memoriza los objetos — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). Depende de
`specs/features/memoriza-objetos-module/analysis.md` (backend) y de
`specs/features/game-selection-ui/analysis.md` (panel que decide qué componente de
juego se monta según `RoomState.currentGame`). También depende de
`specs/features/la-rocola-ui/analysis.md` — reusa tal cual los 4 componentes
genéricos de convención que esa tarea construyó (`GameInstructions`, `ReadyButton`,
`MatchScoreboard`, `MatchWinnerBanner`), sin volver a diseñarlos. Misma rama sin
mergear (`feat/la-rocola`) de la que depende `memoriza-objetos-module`.

No incluye pruebas e2e de Playwright — mismo criterio que `adivina-palabra-ui/analysis.md`:
el camino feliz con sockets reales ya lo cubre `memoriza-objetos-module/analysis.md`.

## Criterios de aceptación

Ver `spec.md` → "Minijuegos" → "10. Memoriza los objetos en la imagen" y
"Convenciones de toda pantalla de juego".

## 1. Componentes genéricos reusados (sin cambios)

`GameInstructions`, `ReadyButton`, `MatchScoreboard`, `MatchWinnerBanner` — ver
`la-rocola-ui/analysis.md` para su diseño. Esta tarea es la primera en reusarlos desde
un juego distinto de "La Rocola" (junto con la eventual tarea de retrofit de Trivia/
Caras y Gestos/Adivina la palabra) — si al integrarlos acá aparece algún ajuste
necesario a su API, se hace ahí mismo (son genéricos, no de La Rocola) y se documenta
como nota en `la-rocola-ui/analysis.md`, no se bifurca una copia local.

## 2. Componentes nuevos, específicos de este juego — `apps/frontend/src/components/`

- **`object-grid.tsx`** (+ `.module.css`, `.spec.tsx`): `{ items: { id: string;
  imagenUrl: string }[]; remainingSeconds: number }` → la secuencia animada de 5
  tramos de la fase "memorizando" (`spec.md` → "10. Memoriza los objetos en la
  imagen", criterio de la cuenta regresiva de 30s). Sin caption de texto — este
  componente nunca recibe ni muestra la palabra. Contenedor único
  `position: relative`, cada imagen es un `<img>` con `position: absolute` dentro,
  cuya posición/transformación depende del tramo activo (derivado de
  `remainingSeconds`, ver `object-grid-positions.ts`):
  - **Tramo A** (`elapsed` 0-9, `remainingSeconds` 30-21): posiciones de grilla (filas
    y columnas), sin fondo ni borde de celda — solo la imagen a tamaño uniforme,
    calculado para que las 20 quepan legibles sin scroll.
  - **Tramo B** (`elapsed` 10-14): mismas posiciones de grilla que el tramo A, pero
    permutadas una sola vez (qué imagen ocupa qué celda) al entrar a este tramo — no
    se vuelve a permutar mientras dure.
  - **Tramo C** (`elapsed` 15-19): posición libre `{top, left}` en porcentaje,
    sorteada una sola vez al entrar al tramo, con margen mínimo respecto a los bordes
    del contenedor (ej. 8%-88% en ambos ejes) para que ninguna imagen quede cortada.
  - **Tramo D** (`elapsed` 20-24): las 20 imágenes orbitan un centro común en círculo,
    igualmente espaciadas entre sí (ángulo inicial de cada una = `(índice / total) *
    360°`, mismo criterio de espaciado que ya usa `answer-matcher.ts`... no, sin
    relación — espaciado geométrico simple) y girando juntas a velocidad constante
    moderada (una vuelta completa cada ~8-10s, ver "velocidad media" de `spec.md`).
    Implementado con el truco CSS de dos capas: un contenedor por imagen gira
    (`@keyframes orbit-spin`, `animation: orbit-spin 9s linear infinite`, con
    `animation-delay` negativo distinto por imagen para mantener el espaciado tipo
    serpiente sin JS por frame) y la imagen interior contra-gira a la misma velocidad
    para no quedar invertida cabeza abajo en cada vuelta.
  - **Tramo E** (`elapsed` 25-29): fundido a opacidad 0 (`transition: opacity 5s`),
    quedan invisibles justo cuando `remainingSeconds` llega a 0.
  - Las transiciones entre tramos A/B/C usan `transition: top 1s ease, left 1s ease`
    (o `transform` equivalente) para que el cambio de posición se vea como
    movimiento, no como salto brusco — la entrada al tramo D (animación continua) y a
    E (fade) puede tener un salto visual mínimo al tomar el relevo de la última
    posición estática del tramo C; se acepta, no amerita más esfuerzo de suavizado.
  - Es 100% un efecto de la pantalla — no hay ningún evento ni estado nuevo del
    backend involucrado; el componente deriva todo de `remainingSeconds`, que ya
    viaja en cada tick de `memoriza_memorizando`.
- **`word-board.tsx`** (+ `.module.css`, `.spec.tsx`): `{ items: MemorizaTablaItem[] }`
  donde cada item trae `{ id, imagenUrl, pista, estado, equipoQueAcerto, teamColor?
  }`. Misma grilla que `object-grid`, pero cada celda muestra: la imagen, y debajo el
  patrón de blanks (`pista`, ej. "M _ _ _ _ _ _") si `estado === 'oculta'`, o la
  palabra completa en el color del equipo (`teamColor`, resuelto por el padre a partir
  de `equipoQueAcerto` + `teams`) si `estado === 'revelada'`. Un solo componente para
  ambos estados de celda (no dos componentes separados) — la transición
  oculta→revelada de una celda puntual es lo único que cambia visualmente en esta
  pantalla durante toda la fase de adivinanza.
- **`team-clocks.tsx`** (+ `.module.css`, `.spec.tsx`): `{ clocks: { teamId: string;
  teamName: string; teamColor: string; remainingSeconds: number; activo: boolean
  }[] }` → dos (o más) relojes en formato `mm:ss`, con el reloj `activo` resaltado
  (borde/fondo con el color del equipo) para que se note a simple vista de quién está
  corriendo el tiempo — igual función visual que "de quién es el turno" en Trivia/
  Adivina la palabra, pero acá el dato central es el tiempo, no el nombre del
  jugador.

## 3. Tipos y estado puro — `apps/frontend/src/lib/`

- **`memoriza-objetos-types.ts`**: espejo de
  `apps/backend/src/memoriza-objetos/memoriza-objetos.types.ts`.
- **`memoriza-objetos-match.ts`**: reducer puro `memorizaObjetosReducer(state, action)`.
  ```ts
  type MemorizaObjetosView =
    | { phase: 'idle' }
    | { phase: 'waiting_ready'; readyPlayerIds: string[]; eligiblePlayerIds: string[]; items: { id: string; imagenUrl: string }[] }
    | { phase: 'pon_atencion'; remainingSeconds: number }
    | { phase: 'memorizando'; items: { id: string; imagenUrl: string }[]; remainingSeconds: number }
    | {
        phase: 'adivinando';
        items: MemorizaTablaItem[];
        clocks: { teamId: string; remainingSeconds: number }[];
        equipoActivoId: string | null;
        jugadorActivo: { teamId: string; playerId: string; playerName: string } | null;
        marcador: TeamScore[];
      }
    | { phase: 'match_result'; scores: TeamScore[]; palabrasPorEquipo: { teamId: string; palabras: string[] }[] };
  ```
  El tablero de imágenes (`items`) ya viaja desde `waiting_ready` (ver sección 4,
  precarga) — se reutiliza el mismo array en `memorizando` una vez arranca esa fase
  visualmente. El cliente no decide puntaje, no elige quién empieza ni juzga
  respuestas: solo refleja lo que manda el servidor (`plan.md`).
- **`memoriza-objetos-match.spec.ts`**: transiciones del reducer, incluida
  `memoriza_intento_resultado` (no cambia de fase, solo se usa para el sonido/flash de
  acierto-error en la pantalla, ver sección 5) y que `memoriza_tablero` en fase
  `adivinando` actualiza `items`/`clocks`/`equipoActivoId` sin perder `marcador`.
- **`object-grid-positions.ts`**: funciones puras que usa `object-grid.tsx` (sección
  2) para calcular la secuencia animada de 5 tramos — separadas del componente para
  poder probarlas con Vitest sin montar React ni depender de temporizadores reales.
  ```ts
  export type GridSegment = 'grid' | 'shuffle' | 'scatter' | 'orbit' | 'fadeout';

  export function segmentForElapsed(elapsedSeconds: number): GridSegment; // 0-9 → 'grid', 10-14 → 'shuffle', 15-19 → 'scatter', 20-24 → 'orbit', 25-29 → 'fadeout'
  export function gridPositions(count: number): { top: number; left: number }[]; // filas/columnas en %, orden estable por índice
  export function shufflePositions(count: number, random?: () => number): { top: number; left: number }[]; // = gridPositions(count) permutado
  export function scatterPositions(count: number, random?: () => number): { top: number; left: number }[]; // %, con margen 8-88 en ambos ejes
  export function orbitAngleOffsetDeg(index: number, count: number): number; // = (index / count) * 360, ángulo inicial de cada imagen en el tramo 'orbit'
  ```
  `random` inyectable (`Math.random` por defecto) — mismo criterio de pruebas
  deterministas que el resto del proyecto. `elapsedSeconds = MEMORIZE_SECONDS -
  remainingSeconds` se calcula en el propio `object-grid.tsx`, no en este módulo (que
  se mantiene sin conocer `remainingSeconds`, solo `elapsed`).
- **`object-grid-positions.spec.ts`**: límites exactos de cada tramo (9→'grid',
  10→'shuffle', 14→'shuffle', 15→'scatter', 19→'scatter', 20→'orbit', 24→'orbit',
  25→'fadeout', 29→'fadeout'); `gridPositions`/`scatterPositions`/`shufflePositions`
  devuelven la cantidad pedida, todas dentro de los márgenes válidos (0-100,
  `scatterPositions` dentro de 8-88); `shufflePositions` es una permutación del mismo
  conjunto de `gridPositions` (mismos valores, orden distinto) con `random` fijo;
  `orbitAngleOffsetDeg` reparte 360° parejo entre `count` imágenes.

## 4. Precarga de imágenes (spec.md, punto 1 de "10. Memoriza los objetos")

Vive en `screen-memoriza-objetos.tsx` (no en un hook aparte — es un efecto
específico de esta pantalla, sin estado que otro componente necesite leer):

```ts
useEffect(() => {
  if (state.phase !== 'waiting_ready') return;
  state.items.forEach((item) => {
    const img = new Image();
    img.src = item.imagenUrl;
  });
}, [state.phase]);
```

Crear un `Image()` con el `src` seteado alcanza para que el navegador lo descargue y
lo deje en su cache HTTP normal — cuando `object-grid.tsx` monte el `<img>` real con
la misma URL en la fase `memorizando`, ya está en cache (sin parpadeo/carga
progresiva). No hace falta ningún estado de "listo"/spinner: el `waiting_ready` ya
tiene su propia espera visible (esperar a que todos presionen "Listo"), que en la
práctica le da tiempo de sobra a la descarga de 20 imágenes chicas.

## 5. Pantalla — `app/screen/[roomCode]/screen-memoriza-objetos.tsx`

Se monta cuando `state.currentGame === 'memoriza-objetos'`. `<MatchScoreboard>`
visible desde `adivinando` en adelante (no antes — no hay puntaje que mostrar todavía).

- `waiting_ready`: `<GameInstructions title="Memoriza los objetos" bullets={[...]}>`
  (bullets: "Vas a ver 20 objetos durante 30 segundos", "Después, cada equipo compite
  por escribirlos a partir de una sola letra", "Un integrante a la vez, un intento por
  turno", "El reloj de tu equipo corre solo mientras es tu turno"]) + progreso
  `{readyPlayerIds.length}/{eligiblePlayerIds.length}`. Dispara la precarga (sección
  4) al montarse esta fase.
- `pon_atencion`: texto animado grande "Pon Mucha Atención" (animación CSS simple,
  ej. escala/parpadeo) + `<Countdown seconds={remainingSeconds}>` (reusa el mismo
  componente que "La Rocola") + `playTickSound()` una vez por `remainingSeconds`
  (mismo criterio anti-duplicado ya usado en `screen-la-rocola.tsx`).
- `memorizando`: `<ObjectGrid items={items} remainingSeconds={remainingSeconds}>`
  (anima sola los 5 tramos, sección 2) + `<Countdown seconds={remainingSeconds}>`
  posicionado para no superponerse a ninguna imagen en ningún tramo (ej. esquina fija
  con fondo propio, fuera del área donde `scatterPositions`/`orbit` pueden colocar
  imágenes — mismo criterio de "no interfiere con la imagen" de `spec.md`).
- `adivinando`: `<WordBoard items={...}>` (con `teamColor` resuelto desde `teams` de
  `RoomState`) + `<TeamClocks clocks={...}>` + texto "Turno de **{jugadorActivo.playerName}**
  ({jugadorActivo.teamId})". Un `useEffect` sobre `[ultimoIntento]` (ver más abajo)
  dispara `playCorrectSound()`/`playIncorrectSound()` según `acierto` del último
  `memoriza_intento_resultado` recibido — igual criterio anti-duplicado con un
  `nonce`/id de evento que `laRocolaAudio` en `la-rocola-ui`, porque dos intentos
  fallidos seguidos no deberían colapsar en un solo sonido.
- `match_result`: `<MatchWinnerBanner>` + lista de qué equipo adivinó cada palabra,
  `playVictorySound()` una sola vez al llegar (mismo criterio que el resto de los
  juegos).

### Último intento (para el sonido de acierto/error)

`use-room-state.ts` agrega `memorizaUltimoIntento: { acierto: boolean; nonce: number }
| null`, actualizado por un listener propio de `memoriza_intento_resultado` — **no**
pasa por el reducer principal (no es estado de vista, es un disparador de efecto
puntual, mismo patrón exacto que `laRocolaAudio` en `la-rocola-ui/analysis.md`).

## 6. Celular — `app/play/[roomCode]/play-memoriza-objetos.tsx`

- `waiting_ready`: `<GameInstructions>` (mismo texto que la pantalla) +
  `<ReadyButton onReady={markMemorizaReady} pressed={...} readyCount={...}
  totalCount={...}>`.
- `pon_atencion` / `memorizando`: mensaje corto "Mira la pantalla" sin controles —
  la memorización pasa 100% en la pantalla compartida, el celular no muestra nada
  del tablero (mismo criterio de privacidad/enfoque que Caras y Gestos con el resto
  de los celulares en espera).
- `adivinando` con `jugadorActivo.playerId === miPlayerId`: `<GuessForm>`
  (subcomponente local) — campo de texto + botón "Enviar" (deshabilitado con el
  campo vacío) + botón "Pasar" (deshabilitado hasta que el propio
  `remainingSeconds` del evento `memoriza_turno_jugador` indique `puedePasar`, dato
  que ya llega resuelto desde el backend, no se recalcula en el cliente).
- `adivinando` con `jugadorActivo.playerId !== miPlayerId`: mensaje "Le toca a
  **{jugadorActivo.playerName}**" + de qué equipo, sin campo de texto — mismo
  criterio de "el resto espera sin poder interactuar" que el resto de los juegos por
  turnos.
- `match_result`: puntaje final del propio equipo destacado, sin sonido (los sonidos
  de esta pantalla suenan solo desde el host).
- Muestra `actionError` si el servidor rechaza una acción (ej. "Pasar" antes de
  tiempo por una desincronización de reloj cliente/servidor — el servidor es la
  fuente de verdad, el cliente solo refleja `puedePasar`).

### `<GuessForm>` (subcomponente local del archivo)

Maneja su propio `useState` de texto y un guard de "ya envié" (se deshabilita tras
enviar, hasta que llegue el siguiente `memoriza_turno_jugador` dirigido a este
jugador — en la práctica nunca pasa dos veces seguidas al mismo jugador salvo que
sea el único integrante restante de un equipo ya sin rival, caso ya cubierto por el
backend). Se monta de nuevo con `key={`guess-${jugadorActivo.playerId}-${equipoActivoId}`}`
para resetear ese estado entre turnos distintos, mismo criterio que `BuzzButton`/
`AnswerForm` en `play-la-rocola.tsx`.

## Checklist manual (Kalin, tras implementación)

1. Elegir "Memoriza los objetos" desde el panel de selección → la pantalla muestra
   instrucciones + progreso de "Listo" mientras ya se están precargando las imágenes
   (verificable en la pestaña Network del navegador, sin bloquear la UI).
2. Con todos los jugadores en "Listo": "Pon Mucha Atención" (5s, con sonido) → 30
   segundos de imágenes sin ninguna palabra visible, confirmando los 5 tramos
   animados en orden: grilla quieta (0-9s) → se reordenan entre sí (10-14s) → se
   esparcen libres por toda la pantalla sin salirse de ella (15-19s) → giran en
   círculo tipo serpiente a velocidad media (20-24s) → se desvanecen hasta
   desaparecer justo al llegar a 0 (25-29s) → aparece la grilla de pistas con una
   letra por palabra + ambos relojes en 1:30.
3. En el celular del primer jugador en turno: campo de texto + "Enviar"; "Pasar"
   aparece recién a los 10 segundos.
4. Enviar una palabra correcta (probar también con un error de tipeo chico) revela
   esa celda con el color del equipo y detiene su reloj; el turno pasa al otro
   equipo, cuyo reloj arranca a correr.
5. Dejar que el reloj de un equipo llegue a cero mientras juega: confirmar que el
   turno le sigue tocando solo al equipo con tiempo restante, sin volver a alternar.
6. Terminar la partida (ambos relojes en 0, o revelando las 20 palabras) y confirmar
   el banner de ganador/empate, el sonido de victoria, y que a los 10 segundos la
   sala vuelve sola al panel de selección de juego.
7. Jugar una segunda partida en la misma sala y confirmar que no se repite ningún
   objeto ya mostrado en la primera.
