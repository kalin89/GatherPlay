# RoomModule — Análisis técnico

Primera tarea de Fase 1 (ver `tasks.md`). Alcance: crear sala, generar código, unirse por código, listar jugadores conectados.

No incluye equipos ni fases de juego (`jugando`/`resultados`) — son las tareas siguientes de Fase 1, cada una con su propio análisis cuando le toque. No se dejan campos vacíos "por si acaso" para eso en el modelo de esta tarea.

## Criterios de aceptación

Ver `spec.md` → "Motor de sala".

## Diseño

`RoomState` mínimo para esta tarea (subconjunto del que define `plan.md`):

```
RoomState {
  code: string
  status: 'lobby'
  players: Player[]
}
Player {
  id: string
  name: string
  socketId: string
}
```

- **`RoomService`**: mantiene `Map<code, RoomState>` en memoria (un solo proceso — ver `plan.md` → Escalamiento). Responsable de generar el código (4-6 caracteres, evitando ambigüedad visual como `0`/`O`, `1`/`I`), crear sala, agregar jugador, remover jugador. Sin dependencia de Socket.io (SOLID-D, `plan.md`) — se prueba unitariamente sin red real.
- **`RoomGateway`** (WebSocket, eventos de `plan.md`):
  - Cliente → servidor: `create_room`, `join_room { code, name }`.
  - Servidor → cliente: `room_state` (broadcast a todos los sockets de la sala en cada cambio), `error` (código inválido).
  - `handleDisconnect` remueve al jugador de su sala y hace broadcast del `room_state` actualizado.

## Pruebas

- **Unitarias** (`RoomService`): crear sala genera código único; unirse con código válido agrega jugador; unirse con código inválido lanza error; dos joins simultáneos a la misma sala no se pisan entre sí.
- **E2E** (`RoomGateway`, mismo patrón vitest e2e que ya usa el backend): un cliente crea sala y recibe el código; un segundo cliente se une y ambos reciben `room_state` actualizado; un cliente se desconecta y los demás ven la lista actualizada.

## Subtareas

- [x] `RoomService`: generación de código + creación de sala en memoria.
- [x] `RoomService`: unirse por código (agregar jugador, error si la sala no existe).
- [x] `RoomGateway`: eventos `create_room` / `join_room` conectados al servicio.
- [x] Broadcast de `room_state` a todos los sockets de la sala en cada cambio.
- [x] Manejo de desconexión: remover jugador y broadcastear el estado actualizado.
- [x] Pruebas unitarias de `RoomService` + e2e de `RoomGateway`.
