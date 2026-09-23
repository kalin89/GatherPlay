# Vista `/play/[roomCode]` (formulario de nombre + espera) — Análisis técnico

Quinta tarea de Fase 1 (ver `tasks.md`), sobre `RoomModule` y la vista `/screen` ya existentes (`specs/features/room-module/analysis.md`, `specs/features/screen-lobby/analysis.md`). Alcance: la vista "control" (celular del jugador) — formulario de nombre para unirse a una sala, y pantalla de espera reflejando el equipo asignado en vivo.

No incluye controles de minijuego ni fases `jugando`/`resultados` — eso llega con Fase 2 en adelante, montado dinámicamente según `room_state.currentGame` (`plan.md`).

**Chequeo de la regla "Tamaño de las tareas" de `CLAUDE.md`**: `RoomGateway.handleJoinRoom` / `RoomService.joinRoom` ya existen desde la tarea 1.1 y alcanzan para que un jugador entre con su nombre — no se necesitó ningún evento nuevo de backend. `joinRoom` no valida nada (nombre vacío, solo espacios, sin límite de largo, código sensible a mayúsculas) — se decidió resolver **solo en el cliente**, sin tocar el backend. La tarea quedó 100% frontend.

## Criterios de aceptación

Ver `spec.md` → "Motor de sala" → "Vista de jugador (unirse)".

## Diseño

### Frontend

- `src/hooks/use-join-room.ts` (nuevo): a diferencia de `useRoomState` (espectador, se suscribe con `watch_room` sin registrarse), este hook **es** la identidad del jugador — abre un socket, emite `join_room { code, name }` y lo mantiene vivo mientras espera en el lobby, reflejando `room_state` en vivo. Si se desconecta, el backend lo remueve de la sala (comportamiento correcto, no se evita). Normaliza el código a mayúsculas y recorta el nombre antes de emitir. Calcula `playerId` propio emparejando `player.socketId` con el id del socket (necesario porque `room_state` no marca "vos sos este").
- `src/app/play/[roomCode]/page.tsx`: mismo patrón que `screen/page.tsx` — Server Component que resuelve `params` y delega con `key={roomCode}`.
- `src/app/play/[roomCode]/play-lobby.tsx` (nuevo, `"use client"`): tres estados — formulario (nombre + validación de cliente: no vacío/solo espacios, máx. 20 caracteres), sala no encontrada (mismo patrón que `/screen`, reemplaza toda la vista), y esperando en el lobby (reutiliza `TeamBoard` para mostrar el equipo propio una vez asignado, vía `splitPlayersByTeam`).
- `play-lobby.module.css`: mismo lenguaje visual que `screen-lobby.module.css`, adaptado a celular (una columna, controles ≥44px para tocar con el dedo).

Se reutiliza sin cambios: `createSocket()`, `room-types.ts`, `splitPlayersByTeam`, `TeamBoard`.

## Pruebas

- **Backend**: sin cambios, no se agregó ningún test nuevo ahí.
- **Frontend (Vitest + Testing Library)**: `use-join-room` con un doble de `@/lib/socket` (nombre vacío no emite, normalización de código/nombre, cálculo de `playerId`, error de servidor, `connect_error`, desconexión al desmontar); `play-lobby` cubriendo el formulario deshabilitado sin nombre, unirse, esperar equipo, mostrar equipo asignado, y sala no encontrada.

## Checklist manual

Segunda tarea de Fase 1 con UI real — aplica el checklist completo de `testing-strategy.md`:

- [x] Probado desde al menos dos celulares reales (no solo devtools/emulador), conectados a la misma red WiFi: entraron al lobby escaneando el QR y completando el nombre, y el nombre apareció en `/screen` sin recargar ninguna de las dos vistas.
- [x] El equipo asignado se refleja en `/play` sin recargar — probado con asignación manual desde `/screen` y con el botón de randomizar (tarea "Controles de host en `/screen`", ya lista).
- [x] El flujo completo (crear sala en `/screen` → escanear QR → completar nombre en `/play` → host arma equipos → `/play` refleja el equipo) se jugó de principio a fin como lo jugaría un familiar sin contexto técnico.
- [x] Se probó el nombre vacío/solo espacios: el formulario no lo deja enviar.

*(Reconexión con el mismo código sin perder el lugar es Fase 4 — fuera de esta tarea, spec.md lo marca explícitamente. Nombres duplicados se permiten a propósito, no hay pedido de restringirlos.)*

## Subtareas

- [x] Frontend: `use-join-room` (unirse, reflejar estado, `playerId` propio, `connect_error`) + pruebas.
- [x] Frontend: `play-lobby` (formulario, espera, error) + página `/play/[roomCode]` + pruebas.
- [x] `spec.md`: criterios Given/When/Then de "Vista de jugador (unirse)".
- [x] Checklist manual completo (ver arriba).
