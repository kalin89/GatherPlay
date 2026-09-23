# Backend: evento `remove_team` — Análisis técnico

Sub-tarea de Fase 1 (ver `tasks.md`), separada de "Controles de host en `/screen`" por la regla "Tamaño de las tareas" de `CLAUDE.md` — es la parte de backend, cerrable sola antes de construir la UI que depende de ella. Sobre `RoomModule` y armado de equipos ya existentes (`specs/features/room-module/analysis.md`, `specs/features/team-assignment/analysis.md`).

Alcance: dar al host una forma de corregir un equipo mal creado (nombre o color equivocado) antes de revelar el código de sala. Solo backend — no incluye ningún cambio de UI, eso es la tarea siguiente.

## Criterios de aceptación

Ver `spec.md` → "Motor de sala" → "Armado de equipos" (los dos criterios de eliminar equipo, agregados junto con esta tarea).

## Diseño

- **`RoomService.removeTeam(code, teamId)`**: busca el equipo por id en `room.teams` y lo saca con `splice`. No toca `Player` ni `playerIds` de otros equipos — la pertenencia a un equipo se deriva de `teams[].playerIds`, así que al desaparecer el equipo sus jugadores automáticamente quedan sin equipo (siguen existiendo en `room.players`). Reutiliza `RoomNotFoundError` (código inexistente) y `TeamNotFoundError` (equipo inexistente, ya usado por `assignPlayerToTeam`) — no se agregó ningún error nuevo.
- **`RoomGateway`**: evento `remove_team { code, teamId }`, mismo patrón try/catch que `randomize_teams`, broadcast de `room_state` a toda la sala.

## Pruebas

- **Unitarias** (`room.service.spec.ts`): elimina un equipo sin jugadores; elimina un equipo con jugadores y quedan sin equipo (siguen en la sala); `TeamNotFoundError` al eliminar un id inexistente; `RoomNotFoundError` con sala inexistente.
- **E2E** (`room.e2e-spec.ts`): el host elimina un equipo y todos los clientes conectados (incluida una pantalla espectadora) reciben el `room_state` actualizado; un jugador asignado a un equipo eliminado queda reflejado sin equipo; eliminar un equipo inexistente devuelve `error`.

## Checklist manual

Tarea de puro backend, sin ninguna UI todavía conectada a `remove_team` — aplica la excepción de `testing-strategy.md`: se cierra con solo las pruebas automatizadas en verde. El checklist manual completo se prueba en la siguiente tarea ("Controles de host en `/screen`"), que sí integra esto a una UI real.

## Subtareas

- [x] `RoomService.removeTeam` + pruebas unitarias.
- [x] `RoomGateway`: evento `remove_team` conectado al servicio, con broadcast de `room_state` y `error` en casos inválidos.
- [x] Pruebas e2e del gateway.
- [x] `spec.md`: criterios Given/When/Then de eliminar equipo.
