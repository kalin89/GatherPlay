# Trivia: volver a selección de juego a los 10s del resultado (backend) — Análisis técnico

Tarea nueva de Fase 2 (ver `tasks.md`), pedida por Kalin tras jugar una partida de
Trivia completa. Backend puro — la sub-tarea de frontend
(`specs/features/trivia-results-timeout-ui/analysis.md`) depende de esta.

Es la porción puntual de Trivia de lo que `specs/features/game-selection/analysis.md`
ya dejó anotado para Fase 4 ("Selector de siguiente juego entre ronda y ronda, sin
recrear la sala"): acá se resuelve "volver sola a los 10s", no un selector manual
persistente entre minijuegos — eso sigue siendo Fase 4 si en el futuro hace falta
poder saltear la espera o cancelarla.

## Problema

Hoy `RoomState.currentGame` queda en `'trivia'` para siempre una vez elegido.
`RoomService.selectGame` rechaza cualquier segunda llamada con
`GameAlreadyStartedError` — no hay forma de elegir otro juego (ni el mismo de nuevo)
sin recrear la sala.

## Diseño

`apps/backend/src/trivia/trivia.service.ts`:

- `RESULTS_DISPLAY_MS = 10_000`, constante junto a `TURN_TRANSITION_DELAY_MS`.
- `finishMatch(code)` llama a `scheduleReturnToSelection(code)` después de emitir
  `trivia_match_result`.
- `scheduleReturnToSelection(code)` (privado, nuevo): programa con `this.scheduler`
  (mismo mecanismo inyectable que ya usa `resolveTurn`, para poder testear con fake
  timers) que a los `RESULTS_DISPLAY_MS` se busque la sala (`getRoom`, no
  `getRoomOrThrow` — corre dentro de un `setTimeout` sin try/catch alrededor), se
  ponga `room.currentGame = null` y se emita `room_state`.
- No resetea `team.score` (el marcador se acumula entre partidas — Fase 4, "Marcador
  acumulado visible entre minijuegos", ya lo da por sentado) ni `room.round` (ya lo
  dejó en `null` `finishMatch`).
- No se toca `room.gateway.ts` ni `room.service.ts`: en cuanto `currentGame` vuelve a
  `null`, `select_game` para la próxima partida ya funciona con la validación
  existente, sin cambios.

## Pruebas

`trivia.service.spec.ts`: agotar una partida de 6 turnos, confirmar que justo antes de
los 10s `currentGame` sigue en `'trivia'`, y que al cumplirse pasa a `null` sin alterar
el puntaje acumulado de los equipos.

## Checklist manual

Se agrega a la de `specs/features/trivia-ui/analysis.md` (todavía pendiente):

- [ ] A los 10s de terminar la partida, la pantalla vuelve sola al panel de selección
      de juego (no hace falta tocar nada).
