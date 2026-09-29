# Ciclo de vida de salas (frontend) — Análisis técnico

Sub-tarea de frontend de `room-lifecycle` (Fase 5, paso 1a). Hace visibles en `/play` y `/screen` los eventos que el backend ya emite.

Depende de: `specs/features/room-lifecycle/analysis.md` (backend, ya cerrado: eventos `host_disconnected`, `host_reconnected` y `room_closed { reason }`).

Fuera de alcance: reconexión de jugadores (`specs/features/player-reconnection/analysis.md`), indicador de reconexión del propio socket, cambios de backend.

## Criterios de aceptación

Ver `spec.md` → "Ciclo de vida de la sala" (criterios de interfaz).

## Diseño

- `RoomClosedReason = "host_left" | "max_age"` en `src/lib/room-types.ts`, espejo del backend.
- **`useJoinRoom` (celular):** estado `hostConnected` (inicia `true`) y `closedReason` (`null`). Escucha `host_disconnected`, `host_reconnected` y `room_closed`. Ante `room_closed` **desconecta el socket**: así socket.io no reintenta y el `connect` del hook no vuelve a emitir `join_room` contra una sala que ya no existe.
- **`useRoomState` (pantalla):** solo `closedReason` + desconexión. La pantalla es el host, no recibe `host_disconnected`.
- **`RoomClosedNotice`** (componente compartido): mensaje por motivo y enlace "Volver al inicio" (`next/link`).
  - `host_left`: "El anfitrión se desconectó y la sala se cerró."
  - `max_age`: "La sala llegó a su duración máxima y se cerró."
- **`HostDisconnectedBanner`:** banner `position: fixed` con `role="status"`, para no tocar las cinco vistas de juego de `/play`. No menciona cifras: la gracia es configurable en el servidor.
- `PlayLobby` y `ScreenLobby` devuelven el aviso de sala cerrada antes que cualquier otra rama. En `ScreenLobby` la música de fondo también se detiene al cerrarse la sala (su `useEffect` dependía solo de `currentGame`).
- Recargar `/screen/<CODIGO>` de una sala ya cerrada sigue mostrando el "No encontramos la sala" existente.

## Pruebas

Vitest + Testing Library, con el mismo doble `FakeSocket` de los specs existentes: los tres eventos en ambos hooks, los dos componentes nuevos, y la integración en `PlayLobby` (banner en lobby y en juego, aviso de sala cerrada) y en `ScreenLobby` (aviso y música).

## Checklist manual

Backend con `ROOM_HOST_GRACE_MS=15000` y `ROOM_SWEEP_INTERVAL_MS=2000` (para no esperar 2 minutos) y un celular, o una segunda pestaña, en `/play`:

1. Con la sala armada y el celular unido, cerrar la pestaña de `/screen`: en el celular aparece el banner en menos de un segundo, tanto en el lobby como con un juego en curso.
2. Reabrir `/screen/<CODIGO>` antes de 15 s: el banner desaparece y los equipos siguen intactos.
3. Cerrar `/screen` y esperar más de 15 s: el celular muestra "sala cerrada" y el enlace lleva al inicio.
4. Recargar `/screen/<CODIGO>` de esa sala ya cerrada: sigue saliendo "No encontramos la sala".
5. Con `ROOM_MAX_AGE_MS=30000`: a los 30 s `/screen` y `/play` muestran "duración máxima"; en `/screen` deja de sonar la música de fondo.

## Subtareas

- [x] Tipo `RoomClosedReason` y estado nuevo en `useJoinRoom` / `useRoomState`.
- [x] Componentes `RoomClosedNotice` y `HostDisconnectedBanner`.
- [x] Integración en `PlayLobby` y `ScreenLobby` (incluida la música de fondo).
- [x] Pruebas unitarias y de componente.
