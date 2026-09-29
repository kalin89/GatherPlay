# Ciclo de vida de salas — Análisis técnico

Paso 1a de la Fase 5 (ver `specs/features/production-readiness/analysis.md`). Cubre la tarea ya existente de Fase 4 "Limpieza de salas abandonadas" y amplía su alcance: expiración por inactividad, host caído y limpieza en cascada de todos los servicios de juego.

Depende de: nada. Es la base de `specs/features/player-reconnection/analysis.md` (la reconexión necesita saber cuándo una sala sigue viva).

## Problema (verificado en el código)

1. `RoomService.rooms` (`room.service.ts`) solo tiene `set` (en `createRoom`); no existe ningún `delete`. Una sala vive hasta que muere el proceso.
2. Cada servicio de juego guarda estado por código de sala y tampoco lo libera al terminar la sala: `TriviaService.matches` / `askedQuestions`, `CarasYGestosService.matches` / `usedWords`, `AdivinaPalabraService.matches` / `roomWords`, `LaRocolaService.matches` / `roomUsedSongs`, `MemorizaObjetosService.matches` / `roomUsedObjects`, y `GameEngineService.timers`. Los `matches` sí se borran al terminar **una partida**, pero los acumuladores "por sala" (`used*`, `asked*`, `roomWords`) viven mientras viva la sala — y hoy eso es para siempre.
3. `RoomGateway.handleDisconnect` solo llama a `removePlayerBySocketId`. El host se conecta por `watch_room` (no es un `Player`), así que su desconexión no dispara nada.
4. Los timers (`RoundTimer` con `setInterval`, y los `scheduler`/`setTimeout` de cada juego) siguen corriendo si nadie mira la sala. `GameEngineService.handleTick` ya se autodetiene si `room.players.length === 0`, pero los de los minijuegos no.
5. Como los códigos son de 5 caracteres (32^5 ≈ 33 M), acumular salas muertas no rompe la unicidad por sí mismo, pero sí consume memoria y hace que `removePlayerBySocketId` (que recorre todas las salas) sea cada vez más lento.

## Decisiones de diseño

- **Una sala está "viva" mientras haya al menos un socket conectado a ella** (host o jugador). Se lleva el conteo con eventos `join`/`disconnect` del gateway, no con `players.length` (el host no cuenta como jugador).
- **Dos umbrales, ambos configurables por variable de entorno:**
  - `ROOM_EMPTY_TTL_MS` — tiempo de gracia desde que la sala queda **sin ningún socket** hasta borrarla. Por defecto 5 minutos: cubre que el host recargue la pantalla o pierda WiFi un rato.
  - `ROOM_MAX_AGE_MS` — vida máxima absoluta, aunque haya sockets. Por defecto 12 horas: evita que una pestaña olvidada abierta retenga una sala para siempre.
- **Host caído con jugadores conectados:** no se cierra la sala de inmediato. Se emite a los celulares un evento `host_disconnected` y arranca el mismo periodo de gracia (`ROOM_HOST_GRACE_MS`, 2 minutos por defecto). Si el host reconecta con `watch_room` antes de que venza, se cancela el cierre y se emite `host_reconnected`. Si vence, la sala se cierra (ver abajo). Los juegos en curso se **pausan** durante la gracia (ver "Pausa" más abajo) en vez de seguir corriendo sin pantalla.
- **Cierre de sala** (`closeRoom(code, reason)`): (1) emite `room_closed { reason }` a todos los sockets de la sala; (2) manda a cada servicio de juego a liberar su estado; (3) borra la sala del `Map`; (4) saca a los sockets del canal de Socket.io (`server.socketsLeave(code)`).
- **Barrido periódico** en lugar de un temporizador por sala: un único `setInterval` (cada 30 s, con `.unref()` como ya hace `RoundTimer`) revisa las salas y cierra las que pasaron algún umbral. Un solo timer es más fácil de probar y no deja cientos de `setTimeout` vivos.
- **Tope de salas** (`MAX_ROOMS`, por defecto 200): `createRoom` lanza `TooManyRoomsError` y el gateway responde `error` con un mensaje claro. Es la defensa mínima contra llenar la memoria; el rate limit por IP vive en `server-hardening`.

### Limpieza en cascada — contrato entre servicios

Hoy cada servicio de juego limpia lo suyo de forma distinta. Se define una interfaz común, `RoomScopedState`, con un método `disposeRoom(code: string): void`. `RoomService` mantiene una lista de servicios registrados y los invoca en `closeRoom`. Cada implementación:

- Detiene sus timers (`match.timer?.stop()`) y cancela callbacks programados.
- Borra su entrada en `matches` **y** en los acumuladores por sala.
- Es idempotente: llamarlo dos veces, o sobre una sala que no tiene partida, no falla.

Se implementa en `GameEngineService`, `TriviaService`, `CarasYGestosService`, `AdivinaPalabraService`, `LaRocolaService` y `MemorizaObjetosService`. Para no crear una dependencia circular con `RoomModule`, los servicios se **registran** en `RoomService` al construirse (patrón "registro"), en lugar de que `RoomService` los importe.

Los servicios que usan un `scheduler` inyectable (`setTimeout`) deben guardar el handle para poder cancelarlo; hoy el `scheduler` por defecto descarta el retorno. Ese cambio es interno y no altera la firma pública usada por las pruebas.

### Pausa de partida si cae el host

Es la parte con más riesgo del análisis. Hoy, si el host desaparece a mitad de La Rocola, los timers siguen y se emiten eventos a una pantalla que no existe. Opciones:

- **A (recomendada para v1):** al perder al host, `GameEngineService` y cada juego **congelan** su temporizador activo y marcan `paused: true` en el estado emitido; al volver el host se reanuda con el tiempo restante. Los reducers del frontend ya manejan `remainingSeconds` por evento, así que congelar = dejar de emitir ticks.
- **B (más simple, peor experiencia):** no pausar; si el host no vuelve en la gracia, se cierra la sala y se pierde la partida.

Se propone **A solo para el temporizador de ronda y los relojes de turno**, y B para todo lo demás (p. ej. una canción sonando se corta y se retoma en el siguiente `waiting`). **Decisión abierta para Kalin:** confirmar si A merece el costo antes de la primera prueba con gente real, o si basta con B y "si el host se cae, se reinicia la sala".

### Lo que NO cambia

- El host sigue sin ser un `Player` ni tener identidad propia (no hay cuentas — constitución, principio 2). Se identifica su socket por haber hecho `watch_room`; reconectar es volver a hacer `watch_room` con el mismo código.
- `RoomState` no incorpora datos de expiración: los timestamps viven en una estructura interna de `RoomService` (no viajan al cliente).

## Criterios de aceptación (para pasar a `spec.md`)

- **Given** una sala sin ningún socket conectado, **when** pasan `ROOM_EMPTY_TTL_MS`, **then** la sala deja de existir (`getRoom` devuelve `undefined`) y todos los servicios de juego liberaron su estado.
- **Given** una sala sin sockets, **when** un socket vuelve a conectarse a ella antes del TTL, **then** la sala **no** se borra y el reloj de gracia se reinicia.
- **Given** una sala con jugadores y un host que se desconecta, **when** el host reconecta con `watch_room` dentro de la gracia, **then** los celulares reciben `host_reconnected` y la sala sigue igual.
- **Given** un host desconectado, **when** vence la gracia, **then** todos los sockets reciben `room_closed` y quedan fuera del canal.
- **Given** una sala con más de `ROOM_MAX_AGE_MS`, **when** corre el barrido, **then** se cierra aunque tenga sockets, con `reason: 'max_age'`.
- **Given** `MAX_ROOMS` salas activas, **when** se intenta `create_room`, **then** el cliente recibe `error` y no se crea otra.
- **Given** una sala cerrada con una partida y un temporizador activos, **then** no queda ningún `setInterval`/`setTimeout` de esa sala pendiente.

## Pruebas

- **Unitarias (`RoomService`):** TTL vacía, vida máxima, tope de salas, cierre idempotente, `disposeRoom` invocado en todos los servicios registrados. Usar `vi.useFakeTimers()`.
- **Unitarias (por juego):** `disposeRoom` detiene el timer y vacía los mapas, con una partida en curso y sin ella.
- **E2E (`RoomGateway`):** host se desconecta → jugadores reciben `host_disconnected`; reconecta → `host_reconnected`; vence la gracia → `room_closed`. Con `ROOM_*` reducidos a pocos ms por variable de entorno.
- **Prueba de fuga:** crear y cerrar 1.000 salas y comprobar que el tamaño de todos los `Map` vuelve a 0 (los mapas son privados; se expone un contador de diagnóstico, el mismo que usará `/health`).

## Checklist manual

Aplica solo la parte visible en UI: el mensaje de "sala cerrada" y el aviso de "el host se desconectó" en `/play`, y que `/screen` pueda recargarse sin perder la sala dentro de la gracia. Eso se cubre en `deploy-staging`; la tarea en sí es de puro backend con eventos nuevos, así que aplica la excepción de `testing-strategy.md` para lo demás. Consumir `host_disconnected` / `room_closed` en el frontend es una sub-tarea aparte, posterior (regla de "Tamaño de las tareas").

## Subtareas

- [ ] Interfaz `RoomScopedState` + registro en `RoomService`.
- [ ] `disposeRoom` en `GameEngineService` y los cinco servicios de juego (guardando handles de `scheduler`).
- [ ] Contador de sockets por sala y barrido periódico con `ROOM_EMPTY_TTL_MS` / `ROOM_MAX_AGE_MS`.
- [ ] `closeRoom` + eventos `room_closed`, `host_disconnected`, `host_reconnected`.
- [ ] `MAX_ROOMS` y `TooManyRoomsError`.
- [ ] Pausa de temporizadores al caer el host (según la decisión abierta).
- [ ] Pruebas unitarias + e2e + prueba de fuga.
- [ ] (Frontend, aparte) Manejo de `room_closed` y `host_disconnected` en `/screen` y `/play`.
