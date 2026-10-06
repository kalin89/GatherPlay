# Reconexión de jugadores — Análisis técnico

Paso 1b de la Fase 5 (ver `specs/features/production-readiness/analysis.md`). Cubre la tarea ya existente de Fase 4 "Manejo de reconexión". Es la funcionalidad que más va a notar la gente en un celular: bloquear la pantalla, perder señal un segundo o cambiar de app no debe sacar al jugador de su equipo.

Depende de: `specs/features/room-lifecycle/analysis.md` (la sala tiene que seguir viva mientras el jugador vuelve, y el contador de sockets por sala es su base).

## Problema (verificado en el código)

- `RoomService.joinRoom` crea `Player { id: randomUUID(), name, socketId }` en cada `join_room`. No hay forma de decir "soy el mismo de antes".
- `RoomGateway.handleDisconnect` → `removePlayerBySocketId` **borra** al jugador de `room.players`. Sus `playerIds` en los equipos quedan apuntando a un jugador que ya no existe.
- La identidad en los minijuegos es `socket.id`: `LaRocolaService.markReady` / `handleBuzz`, y los equivalentes de Memoriza, Adivina y Gestos hacen `room.players.find((p) => p.socketId === socketId)`. Un socket nuevo es un jugador desconocido (`PlayerNotInRoomError`).
- Frontend: `useJoinRoom` deriva `playerId` de `room.players.find((p) => p.socketId === socket.id)` y no guarda nada localmente. `createSocket()` usa `io(url, { transports: ['websocket'] })`; socket.io-client sí reintenta solo, pero al reconectar `connect` vuelve a emitir `join_room` con el nombre — y como el jugador ya fue borrado, entra **como uno nuevo, sin equipo**.
- La especificación actual lo dice así (`spec.md`, línea 37): al perder conexión el jugador se remueve. Ese criterio hay que **reemplazarlo**, no solo extenderlo (ver "Cambios a `spec.md`").

## Decisiones de diseño

### Identidad: token efímero de sala

Alineado con la constitución (Stack → Auth: "los jugadores usan un token efímero de sala, no cuenta real"):

- Al hacer `join_room`, el servidor genera un `playerToken` (UUID v4 aleatorio, sin significado) y lo devuelve **solo a ese socket** en un evento nuevo `joined { playerId, playerToken }`. No viaja dentro de `room_state` (que se difunde a todos y expondría el token a los demás celulares).
- El cliente lo guarda en `sessionStorage` bajo una clave por sala (`gatherplay:<CODIGO>:token`). `sessionStorage` (no `localStorage`): sobrevive a recargar y a volver de otra app, pero no se comparte entre pestañas ni sobrevive semanas.
- El servidor guarda `token → playerId` en una estructura interna de la sala (no en `RoomState`, que es lo que se serializa).
- **No es autenticación.** Su único fin es reclamar el mismo lugar. Un token robado solo permite hacerse pasar por ese jugador dentro de esa sala efímera; con el TTL de sala (`room-lifecycle`) el riesgo es bajo para el alcance del MVP.

### Estado "desconectado" en vez de borrar

- `Player` gana `connected: boolean` (y `disconnectedAt` interno, no serializado). `handleDisconnect` marca `connected = false` y arranca un temporizador de gracia por jugador; **no** lo saca de `room.players` ni de su equipo.
- Vencida la gracia (`PLAYER_GRACE_MS`, por defecto 90 s), el jugador se elimina como hoy: sale de `players` y de sus equipos, y se emite `room_state`.
- Si el jugador estaba en el **lobby** (sin `currentGame`), la gracia puede ser más corta (30 s): no hay partida que proteger y así la lista de jugadores no se llena de fantasmas.
- Los `Player` desconectados se muestran atenuados en `/screen` ("reconectando…") — dato `connected` en `room_state`.

### Reclamar el lugar

- Nuevo evento cliente → servidor: `rejoin_room { code, playerToken }`. El cliente lo emite en el `connect` cuando tiene token guardado, **en lugar de** `join_room`. Si el servidor no reconoce el token (sala cerrada, gracia vencida), responde `error { code: 'REJOIN_FAILED' }` y el cliente cae al flujo normal de `join_room` mostrando el formulario de nombre.
- Éxito: se reemplaza `player.socketId` por el socket nuevo, `connected = true`, se cancela el temporizador de gracia, el socket se une al canal de la sala (`client.join(code)`), y se le envía el `room_state` actual **más el estado del minijuego en curso** (ver "Resincronización").
- Si el jugador ya está conectado con **otro** socket (pestaña duplicada), gana el más nuevo y el anterior recibe `replaced` y se desconecta, para no tener dos sockets actuando como el mismo jugador.

### Resincronización del minijuego

El punto más delicado. Un jugador que vuelve a mitad de partida necesita ver lo que corresponde **ahora**, y los reducers del frontend hoy solo saben aplicar eventos incrementales (`round_update`, `trivia_question`, etc.). Dos opciones:

- **A (recomendada):** cada servicio de juego expone `getSnapshot(code, playerId)` que devuelve el conjunto mínimo de eventos que un cliente recién llegado necesita (fase actual, turno, tiempo restante, pregunta/palabra **solo si le corresponde a él**, marcador). `rejoin_room` los emite en orden tras el `room_state`. Respeta el principio actual de no filtrar contenido secreto a quien no debe verlo (p. ej. la palabra de Gestos, `screenRoomName`).
- **B:** mandar solo `room_state` y esperar al siguiente evento del juego. Es barato pero deja al jugador con la pantalla en blanco hasta el próximo tick — inaceptable en Memoriza los objetos (fases largas) y La Rocola (canción sonando).

Se propone **A**, implementado juego por juego como sub-tareas independientes (ver abajo) para poder cerrar el mecanismo con Trivia y extenderlo después.

### Migrar la identidad interna de `socketId` a `playerId`

`markReady`, `handleBuzz` y equivalentes reciben `socketId` y lo traducen a jugador. Con reconexión eso sigue funcionando (el `socketId` del jugador se actualiza en `rejoin_room`), así que **no hace falta reescribir los juegos** para esta tarea. Sí hay que asegurar que el `ReadyGate` y los turnos (`distributeTurns`, `turnCursor`) se basen en `player.id` — que es lo que ya usan — y no en `socketId`. Verificado: `readyGate.markReady(player.id)`. Anotar como riesgo a revisar en cada juego durante su sub-tarea.

### Efecto en las partidas en curso

- Un jugador desconectado **conserva su turno** durante la gracia. Si le toca actuar y no está, la regla de tiempo de cada juego ya resuelve el turno (Trivia: timeout). **Excepción: Memoriza los objetos.** Como el reloj es de **equipo**, dejar que corriera le consumiría tiempo al equipo por una caída que no fue suya: si el jugador en turno se desconecta, su turno termina en ese momento (sin contar como intento fallido), el reloj de su equipo queda congelado y la rotación salta a los desconectados. Si ningún equipo con tiempo tiene a alguien conectado, la partida se pausa hasta que alguien vuelva.
- `ReadyGate`: los desconectados no bloquean la partida — el gate deja de esperarlos mientras están desconectados y los vuelve a contar si regresan antes de que arranque. Definir el comportamiento exacto en la sub-tarea de `ReadyGate`.
- `randomizeTeams` debe repartir solo entre `connected` (o todos, decisión abierta — recomendado: solo los conectados, para no meter en un equipo a alguien que no está).

## Cambios a `spec.md`

Reemplazar el criterio actual (línea 37, "…se remueve de la lista de jugadores…") por:

- **Given** un jugador en una sala, **when** pierde la conexión, **then** aparece como desconectado pero conserva su equipo durante la gracia; el resto de los clientes ven el cambio.
- **Given** un jugador desconectado dentro de la gracia, **when** su celular vuelve a conectar con el mismo código, **then** recupera su lugar, su equipo y ve el estado actual del juego.
- **Given** un jugador desconectado, **when** vence la gracia, **then** se remueve como en el criterio original.

## Pruebas

- **Unitarias (`RoomService`):** `join` devuelve token; `rejoin` con token válido restaura socket y `connected`; token inválido falla; vencida la gracia se elimina de `players` y equipos; pestaña duplicada reemplaza al socket anterior; el token nunca aparece en el `RoomState` serializado (prueba explícita contra fuga).
- **Unitarias (`getSnapshot` por juego):** un jugador que vuelve recibe lo mismo que uno que nunca se fue, y **no** recibe contenido que no le corresponde.
- **E2E:** jugador entra, se desconecta, reconecta con token → mismo `playerId` y mismo equipo; mismo flujo con un juego en curso; con gracia vencida cae al formulario de nombre.
- **Frontend (Vitest):** `useJoinRoom` guarda el token, lo usa en `connect` y cae a `join_room` ante `REJOIN_FAILED`.

## Checklist manual

Es la parte que **no** se puede automatizar y la razón de esta tarea. En celulares reales, con la pantalla del host mostrando `/screen`:

1. Bloquear el celular 20 s y desbloquear: sigue en su equipo.
2. Activar modo avión 10 s y desactivarlo: vuelve solo.
3. Cambiar de WiFi a datos móviles a mitad de una ronda.
4. Cerrar la pestaña y reabrir el mismo enlace de la sala en el mismo navegador: recupera su lugar. En otro navegador o modo incógnito: entra como jugador nuevo.
5. Repetir 1–3 durante Trivia, La Rocola (con canción sonando) y Memoriza los objetos (en fase de memorización).
6. Esperar más que la gracia y comprobar que el jugador se elimina.

## Subtareas

Por la regla de "Tamaño de las tareas", se divide en backend y frontend, secuenciales:

- [x] **Backend — identidad y estado desconectado:** token, `connected`, gracia por jugador, `rejoin_room`, evento `joined`, `replaced`. Pruebas unitarias + e2e de sala. Implementación: la gracia vence con el **barrido** existente de `RoomGateway` (no hay timer por jugador), así que la gracia real es la configurada + hasta `sweepIntervalMs` (30 s). Variables: `PLAYER_GRACE_MS` (90 s) y `PLAYER_LOBBY_GRACE_MS` (30 s). `joined` se emite **después** de la difusión de `room_state` para no alterar el orden de llegada que asumen las pruebas e2e. El timeout de respuesta de La Rocola pasó a juzgar por `playerId` (el `socketId` cambia al reconectar).
- [x] **Backend — resincronización (mecanismo + Trivia):** `RoomScopedState` gana `snapshotFor?(code, playerId)` opcional (se reusa el registro de `registerRoomScoped`, así `RoomModule` sigue sin importar los juegos); `RoomService.getSnapshot` concatena los de todos los registrados y `handleRejoinRoom` los emite solo al socket que vuelve, tras el `room_state`. Trivia implementa `snapshotFor` para cada momento (cargando preguntas → nada; turno en curso → `trivia_turn_waiting` a todos y, solo al jugador en turno, `trivia_turn_started` + `trivia_turn_update` con el tiempo restante real vía `RoundTimer.remainingSeconds`; entre turnos → `trivia_turn_result`; partida terminada → `trivia_match_result` hasta volver a selección). Se corrigieron dos bugs de Trivia que la reconexión destapaba: los `trivia_turn_update` iban al `socketId` congelado al inicio del turno (ahora se resuelve en cada tick), y `find(...)!` sobre un jugador eliminado por gracia vencida reventaba dentro de un `setTimeout` (ahora se salta el turno y el resultado usa el nombre guardado). `randomizeTeams` reparte solo entre conectados. `GameEngineService` no necesita snapshot: `round.remainingSeconds` ya viaja en `room_state`.
- [x] **Backend — resincronización de Caras y Gestos:** `snapshotFor` según el momento (cargando palabras → nada; fase de espera → `gestos_turn_waiting` a todos, y el reducer del jugador lo convierte en "Iniciar" si es el actor; turno activo → `gestos_actor_ready` al actor y `gestos_turn_waiting` al resto; entre turnos → `gestos_turn_result`; partida terminada → `gestos_match_result`). **Ningún snapshot lleva la palabra**: sigue viajando solo a la pantalla (probado en unitaria y e2e). Se agregó al mecanismo `RoomScopedState.onPlayersRemoved?(code, playerIds)`, que `RoomService.removeExpiredPlayers` invoca; lo usa Gestos para no quedar congelado cuando el actor vence su gracia sin haber presionado "Iniciar" (en esa fase no hay temporizador que resuelva el turno) y queda disponible para el ajuste de `ReadyGate`. También se arregló el `find(...)!` sobre el actor eliminado (ahora el turno se salta, y `resolveTurn` usa el nombre guardado). `ReadyGate` no aplica a Gestos: pasa a la primera subtarea que lo use. Nota para el frontend: el reducer del jugador compara `gestos_turn_waiting.playerId` contra `myPlayerId`, así que `playerId` debe estar fijado (evento `joined`) antes de procesar el snapshot.
- [x] **Backend — resincronización de Adivina la palabra:** `snapshotFor` según el momento (primer turno esperando "Listo" → `adivina_turn_waiting` con `marcador`; tras un turno → `adivina_turn_result` + `adivina_turn_waiting`, que el reducer combina en "resumen + siguiente jugador" igual que en vivo; turno activo → `adivina_jugador_estado` (tiempo y pases, sin palabra) al Adivinador y `adivina_turn_waiting` al resto; partida terminada → `adivina_match_result`). **Ningún snapshot lleva la palabra**: solo viaja en `adivina_pantalla_estado` a la pantalla (probado en unitaria y e2e). Igual que en Gestos: `onPlayersRemoved` salta el turno si el Adivinador vence su gracia sin presionar "Listo" (sin temporizador en esa fase), y los `find(...)!` sobre el Adivinador (`emitTurnWaiting`, `emitStates` en cada tick, `resolveTurnEnd`) ya no revientan: se salta el turno, el reloj sigue sin mandarle estado al eliminado, y el resultado usa el nombre guardado. La cola de `resolveTurnEnd` se extrajo a `advanceOrFinish`. No usa `ReadyGate` (el "Listo" es del Adivinador, no un gate de todos): el ajuste de `ReadyGate` pasa a La Rocola, su primer consumidor.
- [x] **Backend — resincronización de La Rocola:** `snapshotFor` según la fase (Listo → `rocola_ready_state`; cuenta regresiva → `rocola_round_started` + `rocola_countdown_tick` con el tiempo real; sonando → `round_started` + `rocola_buzzer_open`; respondiendo → `+ rocola_buzzer_locked` (con el nombre guardado) y `rocola_answer_tick`; robo → `rocola_robo_started`; robo respondiendo → robo + locked + tick; revelación → `round_started` + `rocola_round_result`; partida terminada → `rocola_match_result`). El `round_started` del snapshot lleva el marcador **de inicio de ronda** (`roundStartMarcador`) porque el reducer del frontend suma el punto del resultado encima. **Ningún snapshot lleva `previewUrl` ni el título antes de la revelación** (el audio es solo de la pantalla; probado en unitaria y e2e). `ReadyGate` gana `markAbsent`/`markPresent`: un desconectado deja de bloquear y de contar en el X/Y, y si vuelve antes de arrancar se lo cuenta de nuevo con su "Listo". Para eso `RoomScopedState` gana `onPlayerDisconnected?`/`onPlayerReconnected?` (los invocan `markPlayerDisconnected` y `rejoinRoom`); La Rocola además usa `onPlayersRemoved` para sacarlo del gate al vencer la gracia, y la bandera `match.starting` evita arrancar dos veces mientras se carga el catálogo. El timeout de respuesta ya no busca al jugador en `room.players`: `resolveAnswer` usa `buzzedPlayerId`/`buzzedPlayerName`, así que resuelve la ronda aunque quien escribía haya salido de la sala (antes lanzaba `NotYourAnswerError` dentro del `setInterval`). Memoriza los objetos también usa `ReadyGate`, pero todavía no llama a `markAbsent`: queda para su subtarea.
- [x] **Backend — resincronización de Memoriza los objetos:** `snapshotFor` según la fase (Listo → `memoriza_waiting_ready`; pon atención y memorizando → su evento con el tiempo real de `RoundTimer.remainingSeconds`; adivinando → `memoriza_tablero` a todos y `memoriza_turno_jugador` solo al jugador en turno; partida terminada → `memoriza_match_result`). **Ningún snapshot lleva una palabra oculta** (reusa `toPublicItems`; probado en unitaria y e2e). `ReadyGate`: se conectan `markAbsent`/`markPresent` mediante `onPlayerDisconnected`/`onPlayerReconnected` y `onPlayersRemoved`, igual que La Rocola (acá el arranque es síncrono, no hace falta la bandera `starting`). **Regla nueva de turnos** (ver "Efecto en las partidas en curso"): al desconectarse el jugador en turno su turno termina en ese momento, `startTurn` salta a los desconectados, `teamCanPlay` exige tiempo y al menos un miembro conectado, y si ningún equipo puede jugar la partida queda en **pausa** (`pauseGuessing`: `jugadorActivo: null`, sin timer) hasta que `onPlayerReconnected` la reanuda. `ultimoIntento` (el destello de acierto/error) no se reconstruye: es cosmético. El `targetSocketIds: [player.socketId]` que se anotó como riesgo **no** estaba congelado (`emitTurnoJugador` lo resuelve en cada tick), así que no hizo falta corregirlo.
- [ ] **Backend — resincronizar la pantalla (`watch_room`):** hoy la pantalla que reconecta solo recibe `room_state`; definir su snapshot (vista completa, incluida la palabra de Gestos que sí ve la pantalla).
- [ ] **Frontend:** `useJoinRoom` con token en `sessionStorage`, `rejoin_room` en `connect`, atenuado de jugadores desconectados en `/screen`, mensaje de "reconectando" en `/play`. Depende de las dos anteriores.
