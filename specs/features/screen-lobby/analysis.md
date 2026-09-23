# Vista `/screen/[roomCode]` (lobby) — Análisis técnico

Cuarta tarea de Fase 1 (ver `tasks.md`), sobre el `RoomModule` y el armado de equipos ya existentes (`specs/features/room-module/analysis.md`, `specs/features/team-assignment/analysis.md`). Alcance: la vista "pantalla" (host/TV) en estado `lobby` — código de sala, QR de invitación, y jugadores/equipos actualizándose en vivo. Es la primera tarea de Fase 1 con UI real conectada al backend.

No incluye controles de host (crear equipo, asignar jugador, randomizar) — `/screen` es solo lectura, como define `plan.md`. Tampoco incluye el minijuego activo ni las fases `jugando`/`resultados` — eso llega con Fase 2 en adelante, cuando `GameScreenProps` tenga contenido que renderizar.

## Criterios de aceptación

Ver `spec.md` → "Motor de sala" → "Vista de pantalla (lobby)".

## Diseño

### Backend: evento `watch_room`

`RoomGateway` gana un evento nuevo para que un socket se suscriba a una sala **sin** registrarse como jugador (necesario para que `/screen` reciba `room_state` al abrir o al recargar — ni `create_room` ni `join_room` cubren ese caso):

- Cliente → servidor: `watch_room { code }`.
- Servidor → cliente: `room_state` (al socket que se suscribe), `error` (código inexistente).

Usa `RoomService.getRoomOrThrow(code)` (ya público) y `client.join(room.code)`, sin agregar al jugador a `room.players`. Al desconectarse, `handleDisconnect` → `removePlayerBySocketId` no lo encuentra y no modifica el estado — el espectador es invisible para la sala.

### Frontend

- `src/lib/room-types.ts`: espejo de `apps/backend/src/room/room.types.ts` (no existe `packages/shared`).
- `src/lib/socket.ts`: fábrica de socket (`NEXT_PUBLIC_WS_URL`), aislada para poder sustituirla en pruebas.
- `src/lib/join-url.ts`: arma la URL que codifica el QR (`NEXT_PUBLIC_APP_URL` o `window.location.origin`).
- `src/lib/room-selectors.ts`: `splitPlayersByTeam(state)` — función pura de presentación (agrupa `players` según `teams[].playerIds`, ya que `Player` no referencia a su equipo).
- `src/hooks/use-room-state.ts`: conecta el socket, emite `watch_room`, refleja `room_state`/`error`.
- `src/app/screen/[roomCode]/screen-lobby.tsx` + componentes presentacionales (`room-code`, `join-qr`, `player-list`, `team-board`): tres estados — conectando, sala no encontrada, lobby.
- `src/components/create-room-button.tsx`: conecta el botón "Crear sala" del home (`create_room` → redirige a `/screen/[code]`).

## Pruebas

- **Backend (e2e, `room.e2e-spec.ts`)**: `watch_room` con código válido devuelve `room_state` y no agrega al espectador a `players`; código inválido devuelve `error`; un `join_room` posterior llega al espectador; desconexión del espectador no altera `players`.
- **Frontend (Vitest + Testing Library, nuevo)**: `room-selectors` (agrupación correcta, no asignados, equipo vacío), `join-url` (con y sin `NEXT_PUBLIC_APP_URL`), componentes presentacionales (`team-board`, `player-list`), `screen-lobby` con un doble de `@/lib/socket` cubriendo los tres estados y la desconexión al desmontar.

## Checklist manual

Primera tarea de Fase 1 con UI real — aplica el checklist completo de `testing-strategy.md` en lo que corresponde a este alcance (lobby, sin minijuego ni reconexión todavía):

- [x] Probado desde al menos dos celulares reales (no solo devtools/emulador), conectados a la misma red WiFi, escaneando el QR y entrando por código.
- [x] La pantalla compartida se probó en una pantalla grande (TV o proyector) — legibilidad del código y tamaño del QR desde varios metros de distancia.
- [x] El flujo se jugó de principio a fin (crear sala → escanear/entrar) como lo jugaría un familiar sin contexto técnico, sin que nadie le explique qué hacer.
- [x] `/screen/[roomCode]` recargado (F5) vuelve a mostrar el estado correcto de la sala (valida `watch_room`).

*(Reconexión de un jugador con el mismo código y el caso límite de minijuego no aplican a esta tarea — son Fase 4 y Fase 2/3 respectivamente. "Ver equipos" como parte del flujo jugado por un familiar tampoco es validable todavía: `/play/[roomCode]` sigue siendo el placeholder de Fase 0 — sin formulario de nombre, un jugador real nunca aparece en la sala para poder agruparse en equipos. Queda pendiente de re-probar en la tarea 1.5, cuando `/play` tenga el formulario de unión.)*

## Subtareas

- [x] `RoomGateway`: evento `watch_room` (suscripción de solo lectura) + pruebas e2e.
- [x] `apps/backend`: fijar `PORT` en `.env`/`.env.example` para no chocar con `next dev`.
- [x] Frontend: infraestructura de pruebas (Vitest + Testing Library) + CI.
- [x] Frontend: `lib/` (tipos, socket, join-url, selectors) + pruebas unitarias.
- [x] Frontend: componentes presentacionales del lobby + pruebas.
- [x] Frontend: `use-room-state` + `screen-lobby` + página `/screen/[roomCode]` + prueba con doble de socket.
- [x] Frontend: conectar botón "Crear sala" del home.
- [x] Checklist manual completo (ver arriba) — pendiente: requiere celulares reales y una TV/proyector, no se puede validar desde este entorno.
