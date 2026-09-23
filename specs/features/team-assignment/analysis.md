# Armado de equipos — Análisis técnico

Segunda tarea de Fase 1 (ver `tasks.md`), sobre el `RoomModule` ya existente (`specs/features/room-module/analysis.md`). Alcance: crear equipos con nombre y color, asignar jugadores manualmente, y armarlos al azar.

No incluye puntaje por equipo ni fases de juego (`jugando`/`resultados`) — son la tarea siguiente de Fase 1 (`GameEngineCore`). No se agrega campo de puntaje a `Team` en esta tarea.

## Criterios de aceptación

Ver `spec.md` → "Motor de sala" → "Armado de equipos".

## Diseño

`RoomState` se extiende con equipos:

```
RoomState {
  code: string
  status: 'lobby'
  players: Player[]
  teams: Team[]
}
Team {
  id: string
  name: string
  color: string
  playerIds: string[]
}
```

- **`RoomService`**: agrega `createTeam(code, name, color)`, `assignPlayerToTeam(code, playerId, teamId)` y `randomizeTeams(code)`. Un jugador solo puede estar en un equipo a la vez — `assignPlayerToTeam` lo remueve de cualquier otro equipo antes de agregarlo al nuevo. `randomizeTeams` redistribuye a **todos** los jugadores de la sala (no solo los sin asignar) de forma pareja entre los equipos existentes, así el host puede volver a tirar los dados después de ajustes manuales. Errores dedicados: `PlayerNotFoundError`, `TeamNotFoundError`, `NoTeamsError` (al randomizar sin equipos creados).
- **`RoomGateway`** (nuevos eventos, mismo patrón que `create_room`/`join_room`):
  - Cliente → servidor: `create_team { code, name, color }`, `assign_team { code, playerId, teamId }`, `randomize_teams { code }`.
  - Servidor → cliente: `room_state` (broadcast a la sala en cada cambio), `error` (código/jugador/equipo inválido).

## Pruebas

- **Unitarias** (`RoomService`): crear equipo sin jugadores; asignar jugador manualmente; mover jugador de un equipo a otro; error si el jugador o el equipo no existen; randomizar reparte a todos los jugadores sin repetir y sin dejar ninguno afuera; error al randomizar sin equipos.
- **E2E** (`RoomGateway`): el host crea un equipo y asigna un jugador, ambos clientes ven el `room_state` actualizado; randomizar equipos asigna a todos los jugadores conectados; asignar a un equipo inexistente devuelve `error`.

## Checklist manual

Tarea de puro backend — todavía no existen `/screen` ni `/play` (son las tareas siguientes de Fase 1). Aplica la excepción de `testing-strategy.md`: se cierra con solo las pruebas automatizadas en verde.

## Subtareas

- [x] `RoomService`: `createTeam` (nombre + color, sin jugadores).
- [x] `RoomService`: `assignPlayerToTeam` (asignación manual, mueve de equipo si ya estaba en otro).
- [x] `RoomService`: `randomizeTeams` (reparto parejo de todos los jugadores).
- [x] `RoomGateway`: eventos `create_team` / `assign_team` / `randomize_teams` conectados al servicio, con broadcast de `room_state` y `error` en casos inválidos.
- [x] Pruebas unitarias de `RoomService` + e2e de `RoomGateway`.
