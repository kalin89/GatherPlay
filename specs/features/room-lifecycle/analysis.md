# Ciclo de vida de salas — Análisis técnico

Paso 1a de la Fase 5 (ver `specs/features/production-readiness/analysis.md`). Cubre la tarea de Fase 4 "Limpieza de salas abandonadas" y amplía su alcance: expiración cuando no hay host, vida máxima, tope de salas y limpieza en cascada de todos los servicios de juego.

Depende de: nada. Es la base de `specs/features/player-reconnection/analysis.md` (la reconexión necesita que la sala siga viva mientras el jugador vuelve).

**Estado:** la parte de **backend** está implementada y con pruebas automatizadas en verde. Falta la sub-tarea de **frontend** (mostrar `room_closed` y `host_disconnected`).

## Problema (verificado en el código)

1. `RoomService.rooms` solo tenía `set` (en `createRoom`); ninguna sala se borraba nunca.
2. Cada servicio de juego guarda estado por sala que tampoco se liberaba: `matches` y los acumuladores `askedQuestions` (Trivia), `usedWords` (Caras y Gestos), `roomWords` (Adivina la palabra), `roomUsedSongs` (La Rocola), `roomUsedObjects` (Memoriza los objetos), más los `timers` de `GameEngineService`.
3. `RoomGateway.handleDisconnect` solo quitaba al jugador. El host se conecta por `watch_room` y no es un `Player`, así que su desconexión no disparaba nada.
4. **Condición de carrera (bug encontrado al implementar):** los servicios que esperan a la IA o al catálogo (`TriviaService`, `CarasYGestosService`, `AdivinaPalabraService`, `LaRocolaService`) seguían con un `match` viejo al volver del `await`. Si la sala se cerraba entretanto, volvían a escribir su acumulador (resucitando estado) y `startTurn` hacía `this.matches.get(code)!` sobre `undefined`, lanzando dentro de una promesa sin `catch` (`void …`) — un `unhandledRejection` que en Node puede tumbar el proceso.

## Decisiones de diseño (implementadas)

- **Una sala está viva mientras tenga una pantalla de host conectada.** Host = socket que hizo `watch_room`. Los jugadores **no** cuentan, y el socket que hace `create_room` tampoco (el frontend lo cierra enseguida, `create-room-button.tsx`).
- **Dos reglas de expiración**, ambas configurables por variable de entorno (ver `apps/backend/.env.example`):
  - Sin ninguna pantalla de host durante `ROOM_HOST_GRACE_MS` (2 min) → se cierra con `reason: 'host_left'`. Cubre el host que se cae, la sala cuya pantalla nunca se abrió y "todos se fueron".
  - Vida máxima `ROOM_MAX_AGE_MS` (12 h) → `reason: 'max_age'`, aunque haya un host conectado.
  - *(Ajuste respecto al análisis original: se descartó `ROOM_EMPTY_TTL_MS`. Una sala vacía nunca tiene host, así que la gracia del host siempre vence antes; una tercera regla no aportaba nada.)*
- **Sin pausa de partida.** Si el host no vuelve dentro de la gracia, la sala se cierra y se pierde la partida. Decisión confirmada con Kalin; se puede mejorar después.
- **Aviso a los clientes:** `host_disconnected` al perder la última pantalla, `host_reconnected` si una pantalla vuelve dentro de la gracia (solo si antes hubo un host y se perdió, no en la primera conexión), `room_closed { reason }` al cerrar. Tras cerrar, `server.in(code).socketsLeave([code, screenRoomName(code)])` saca a los sockets del canal.
- **Barrido periódico:** un único `setInterval` en `RoomGateway` (`ROOM_SWEEP_INTERVAL_MS`, 30 s, con `unref`) llama a `RoomService.closeExpiredRooms(now)`, que es una función pura sobre metadatos internos y se prueba sin timers.
- **Metadatos internos, fuera de `RoomState`:** `createdAt`, sockets de host, `hostlessSince`, `hostLost`. No viajan al cliente.
- **Tope de salas** `MAX_ROOMS` (200): `createRoom` lanza `TooManyRoomsError` y el gateway responde `error`.
- **Configuración:** `src/room/room-lifecycle.config.ts`. Un valor no numérico o ≤ 0 hace fallar el arranque (no cae en silencio al valor por defecto). `RoomService` la recibe por el token `ROOM_LIFECYCLE_CONFIG` con `@Optional()` y valor por defecto, así `new RoomService()` sigue funcionando en las pruebas.
- **Limpieza en cascada — `RoomScopedState`** (`src/room/room-scoped-state.ts`): interfaz con `disposeRoom(code)`. Cada servicio se **registra en su constructor** (`rooms.registerRoomScoped(this)`) y `RoomService.closeRoom` los invoca a todos. Sin dependencia circular. Implementado en `GameEngineService` y los cinco juegos: detiene el `RoundTimer`, borra la partida y el acumulador por sala. Idempotente.
- **Guardas tras cada `await`:** después de esperar a la IA/catálogo se comprueba `this.matches.get(code) !== match` (o, en Adivina, que la sala siga existiendo) antes de tocar estado.
- **Los `setTimeout` del `scheduler` no se cancelan:** todos sus callbacks ya salen si `matches.get(code)` / `rooms.getRoom(code)` no existen, y quedan pendientes a lo sumo unos segundos.

### Lo que NO cambia

- El host sigue sin ser un `Player` ni tener identidad propia (no hay cuentas — constitución, principio 2). Reconectar es volver a hacer `watch_room` con el mismo código.
- `RoomState` no incorpora campos nuevos.
- Una pantalla espectadora extra que haga `watch_room` también cuenta como host mientras esté conectada. La distinción host/espectador llega con `specs/features/server-hardening/analysis.md` (rol de host con token).

## Criterios de aceptación

Incorporados a `spec.md` → "Ciclo de vida de la sala".

## Pruebas (todas en verde)

- **Unitarias `RoomService`** (`src/room/room-lifecycle.service.spec.ts`): cierre por gracia sin host (nunca hubo, o se fue); no cierra si el host vuelve; dos pantallas; `reconnected`; vida máxima con host conectado; tope de salas; `closeRoom` invoca a todos los registrados y es idempotente; prueba de fuga (1.000 salas creadas y cerradas dejan todos los mapas internos en 0).
- **Configuración** (`room-lifecycle.config.spec.ts`): valores por defecto, lectura de cada variable, valores inválidos.
- **Por juego** (los cinco specs + `game-engine.service.spec.ts`): `disposeRoom` detiene el reloj (no se emite nada más y la siguiente acción lanza "no hay partida"); es idempotente; y, en los que esperan a la IA/catálogo (Trivia, Caras y Gestos, Adivina, La Rocola), una prueba de carrera que cierra la sala con la promesa pendiente y verifica que no hay `unhandledRejection` ni estado resucitado. Se comprobó que cada prueba de carrera **falla** sin su guarda.
- **E2E** (`test/room-lifecycle.e2e-spec.ts`): `host_disconnected` / `host_reconnected`; sala que sigue viva tras volver el host; `room_closed` y `join_room` posterior con error; sala cuya pantalla nunca se abrió; tope de salas.

## Checklist manual

El backend es de puro eventos de servidor y todavía no hay UI conectada: aplica la excepción de `testing-strategy.md`, se cierra con las pruebas automatizadas. Los puntos visibles para Kalin se verifican en la sub-tarea de frontend: aviso de "el host se desconectó", pantalla de "sala cerrada" en `/play`, y que recargar `/screen` dentro de los 2 minutos no pierda la sala.

Verificación manual opcional en local: arrancar con `ROOM_HOST_GRACE_MS=10000`, abrir `/screen` y un `/play`, cerrar la pestaña de la pantalla y observar en las herramientas de red del celular los eventos `host_disconnected` y, a los 10 s, `room_closed`.

## Subtareas

- [x] Interfaz `RoomScopedState` + registro en `RoomService`.
- [x] `disposeRoom` en `GameEngineService` y los cinco servicios de juego.
- [x] Guardas anti-carrera tras cada `await` (Trivia, Caras y Gestos, Adivina, La Rocola).
- [x] Metadatos de sala, `attachHost` / `detachHost`, `closeExpiredRooms`, `closeRoom`, `getStats`.
- [x] Barrido periódico y eventos `room_closed`, `host_disconnected`, `host_reconnected` en `RoomGateway`.
- [x] `MAX_ROOMS` y `TooManyRoomsError`; configuración por variables de entorno.
- [x] Pruebas unitarias, de carrera, de fuga y e2e.
- [ ] (Frontend, aparte) Manejo de `room_closed` y `host_disconnected` en `/screen` y `/play`. Depende de esta tarea de backend.
