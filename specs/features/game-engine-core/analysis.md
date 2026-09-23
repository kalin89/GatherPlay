# GameEngineCore — Análisis técnico

Tercera tarea de Fase 1 (ver `tasks.md`), sobre el `RoomModule` y el armado de equipos ya existentes (`specs/features/room-module/analysis.md`, `specs/features/team-assignment/analysis.md`). Alcance: fases de sala (`lobby` → `jugando` → `resultados`), temporizador genérico que tickea desde el servidor, y puntaje por equipo.

No incluye la interfaz de plugin de minijuegos (`startRound`/`handlePlayerAction`/`resolveRound`) ni su registro — eso llega en Fase 2 con Trivia, que es cuando hay un caso real para validar esa abstracción. Tampoco incluye turnos: `plan.md` los menciona bajo `GameEngineCore`, pero `tasks.md` no los pide para esta tarea, y las reglas de rotación (¿por equipo? ¿por jugador? ¿qué pasa si un equipo queda vacío?) solo las define el primer minijuego que las necesita (Mímica, Fase 3). Tampoco se agrega `currentGame`/`GameId`: hoy solo podría valer `null`, es Fase 2 quien le da contenido real. No se dejan estos campos vacíos "por si acaso".

## Criterios de aceptación

Ver `spec.md` → "Motor de sala" → "Fases, temporizador y puntaje".

## Diseño

`RoomState` se extiende:

```
RoomState {
  code: string
  status: 'lobby' | 'jugando' | 'resultados'
  players: Player[]
  teams: Team[]          // Team gana el campo score: number
  round: RoundState | null
}
RoundState {
  durationSeconds: number
  remainingSeconds: number
}
```

`remainingSeconds` es un entero decreciente calculado por el servidor, no un `endsAt` epoch — así el cliente nunca necesita su propio reloj para mostrar el tiempo restante.

- **`RoomModule`** ahora exporta `RoomService` (antes no lo exportaba nadie fuera del módulo) para que `GameEngineModule` pueda inyectarlo. `RoomService.getRoomOrThrow` pasa de privado a público para reuso sin duplicar el `if (!room) throw`.
- **`RoundTimer`** (`src/game-engine/round-timer.ts`): clase pura sin `@Injectable()`, un `setInterval` por instancia con `.unref()`, callbacks `onTick`/`onEnd` — sin dependencia de Socket.io ni de Nest, se prueba con `vi.useFakeTimers()`.
- **`GameEngineService`**: inyecta `RoomService`, mantiene `Map<code, RoundTimer>`, muta el `RoomState` compartido (mismo objeto que ve `RoomGateway`, sin estado duplicado). Publica cada cambio como un evento tipado (`GameEngineEvent`) en un `Subject` de rxjs expuesto como `events$` — el gateway es el único suscriptor y traduce cada evento a un `emit` de Socket.io. Ningún handler del gateway emite nada en el camino feliz: toda la lógica de "qué se emite" vive en el service, para que el fin de ronda por tiempo agotado (asíncrono) y por `end_round` (síncrono) produzcan exactamente la misma secuencia de eventos.
  - Errores de dominio: `RoundAlreadyRunningError`, `NoRoundRunningError`, `InvalidRoundDurationError` (nuevos); reutiliza `RoomNotFoundError`/`TeamNotFoundError` de `RoomService`.
  - Defensas contra intervalos huérfanos: `startRound` rechaza si ya hay timer para esa sala; cada tick verifica que la sala siga existiendo y con jugadores conectados (si no, detiene el timer sin emitir `round_result`); `onModuleDestroy` detiene todos los timers vivos al apagar la app.
- **`GameEngineGateway`** (mismo namespace por defecto que `RoomGateway`):
  - Cliente → servidor: `start_round { code, durationSeconds }`, `end_round { code }`, `award_points { code, teamId, points }`.
  - Servidor → cliente: `room_state`, `round_started { code, round }`, `round_update { code, remainingSeconds }` (una vez por segundo), `round_result { code, scores }`, `error`.
  - Se suscribe a `events$` en `afterInit` (hook de `OnGatewayInit`, se dispara cuando el `@WebSocketServer()` ya está listo), se desuscribe en `onModuleDestroy`.

`RoomGateway` no se refactoriza a este patrón de eventos — es una tarea cerrada y verde con emisión síncrona directa, que sigue siendo correcta para lo que hace.

Nota pre-existente, fuera de alcance: `RoomService` nunca borra salas del `Map`, así que las abandonadas se acumulan indefinidamente. Corresponde a Fase 4 (ciclo de vida de sesión / reconexión).

## Pruebas

- **Unitarias (`RoundTimer`)**: ticks decrecientes hasta cero y un solo `onEnd`; sin ticks después de terminar; `stop()` no dispara `onEnd`; `stop()` sin `start` y doble `stop()` no lanzan.
- **Unitarias (`GameEngineService`)**: transición `lobby`→`jugando` con orden de eventos `room_state`→`round_started`; ticks vía `events$`; fin en cero con `round: null`; `end_round` anticipado; doble `start_round` rechazado sin duplicar el intervalo; re-arranque desde `resultados` conserva `score`; `award_points` acumulativo; errores por id/código inexistente; duración inválida sin crear timer; desconexión total detiene el timer sin `round_result`; `onModuleDestroy` detiene timers vivos.
- **Unitarias (`RoomService`)**: equipo recién creado tiene `score === 0`.
- **E2E (`GameEngineGateway`)**: camino feliz completo del temporizador (arranque, ticks, fin); el jugador también recibe los ticks, no solo el host; `end_round` anticipado; doble `start_round` da error solo al emisor; `award_points` reflejado en todos los clientes; código de sala inexistente da error.

## Checklist manual

Tarea de puro backend — todavía no existen `/screen` ni `/play` (son las tareas siguientes de Fase 1). Aplica la excepción de `testing-strategy.md`: se cierra con solo las pruebas automatizadas en verde.

## Subtareas

- [x] `RoomModule` exporta `RoomService`; `Team.score` y `RoomState.round` agregados.
- [x] `RoundTimer`: temporizador puro testeable con fake timers.
- [x] `GameEngineService`: `startRound`, `endRound`, `addScore`, emisión de eventos vía `events$`, defensas contra intervalos huérfanos.
- [x] `GameEngineGateway`: eventos `start_round` / `end_round` / `award_points` conectados al servicio, traduciendo `events$` a Socket.io.
- [x] Pruebas unitarias de `RoundTimer` y `GameEngineService` + e2e de `GameEngineGateway`.
