# Trivia: volver a selección de juego a los 10s (frontend) — Análisis técnico

Sub-tarea de frontend de `specs/features/trivia-results-timeout/analysis.md` (backend,
ya cerrado). El backend resetea `room.currentGame` a `null` 10s después de
`trivia_match_result`.

## Qué ya funciona sin tocar nada

`screen-lobby.tsx`/`play-lobby.tsx` ya reaccionan bien a `state.currentGame === null`
(vuelven al lobby; `showGamePanel` en `screen-lobby.tsx` nunca se resetea a `false`, así
que cae directo en `<GameSelectionPanel>`, no en el botón "Iniciar partida").

## Problema

El `trivia` (vista del `useReducer` de `trivia-match.ts`, expuesto por
`useRoomState`/`useJoinRoom`) se queda en `match_result` para siempre. Si el host elige
Trivia una segunda vez, `<ScreenTrivia>` se vuelve a montar pero `trivia.phase` sigue
en `'match_result'` de la partida anterior — el `useEffect` que dispara
`startTriviaGame()` solo corre en `phase === 'idle'`, así que nunca arranca la segunda
partida.

## Diseño

- `apps/frontend/src/lib/trivia-match.ts`: nueva acción local `{ type: 'reset' }` (no
  viene de un evento de socket, la disparan los hooks) → `triviaReducer` vuelve a
  `initialTriviaMatchView`.
- `apps/frontend/src/hooks/use-room-state.ts` y `use-join-room.ts`: en el handler de
  `room_state`, si `room.currentGame === null` → `dispatchTrivia({ type: 'reset' })`.
  Se dispara en cualquier `room_state` sin juego elegido (incluido el primero, donde ya
  es `idle` — idempotente) en vez de trackear la transición no-null→null.

## Pruebas

`trivia-match.spec.ts` (reset desde cualquier fase), `use-room-state.spec.ts` y
`use-join-room.spec.ts` (un `room_state` con `currentGame: null` resetea `trivia`; uno
con `currentGame` no nulo no lo toca).

## Checklist manual

No aplica una nueva — completa el punto ya agregado en
`specs/features/trivia-ui/analysis.md` ("a los 10s de terminar la partida, la pantalla
vuelve sola al panel de selección"). El punto real a validar acá es jugar **dos**
partidas de Trivia seguidas en la misma sala y confirmar que la segunda arranca bien
(no un resultado viejo pegado en pantalla).
