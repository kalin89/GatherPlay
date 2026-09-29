# Endurecimiento del servidor — Análisis técnico

Paso 1c de la Fase 5 (ver `specs/features/production-readiness/analysis.md`). Reúne lo que hace falta para exponer el backend a internet sin que cualquiera que conozca (o adivine) un código de sala pueda controlar la partida, llenar la memoria o gastar la cuenta de Anthropic.

Depende de: nada para la mayor parte. El ítem de "host autenticado" comparte la idea de token efímero con `specs/features/player-reconnection/analysis.md` (mismo patrón, distinto rol); conviene cerrarlos en ese orden para no inventar dos mecanismos distintos.

## Problema (verificado en el código)

1. **Sin autorización por rol.** Los 29 eventos de negocio de los gateways (más `echo`) (`create_team`, `assign_team`, `remove_team`, `randomize_teams`, `select_game`, `start_*_game`, `start_round`, `end_round`, `award_points`, `start_gestos_turn`, etc.) ejecutan sin comprobar quién los manda. Un celular cualquiera —o alguien con solo el código— puede borrar equipos, arrancar juegos o sumar puntos con `award_points`.
2. **Sin validación de payloads.** Los handlers reciben `@MessageBody() payload: XPayload` con interfaces de TypeScript, que no existen en tiempo de ejecución. `payload.name` puede ser un objeto, un texto de 10 MB o `undefined`; `payload.points` en `award_points` puede ser `NaN` o negativo. `zod` está en `package.json` pero no se usa aquí.
3. **Sin límites de tasa.** `create_room` en bucle llena el `Map` de salas; `join_room` en bucle llena `players`; eventos de juego a alta frecuencia consumen CPU. Con `RoomService.removePlayerBySocketId` recorriendo todas las salas, el costo crece con el abuso.
4. **Códigos adivinables.** 5 caracteres sobre 32 símbolos (≈33 M). Sin rate limit, un script puede probar `join_room`/`watch_room` a miles por segundo; con pocas salas activas la probabilidad de acertar una es alta.
5. **Costo variable de la IA.** `AiContentModule` llama a Anthropic (Trivia, Gestos, Adivina la palabra). Cada partida iniciada dispara llamadas de pago. Sin límites, un abuso de `start_trivia_game` es dinero.
6. **CORS abierto.** `@WebSocketGateway({ cors: { origin: '*' } })` en `RoomGateway` y `AppGateway`; `main.ts` no configura CORS HTTP.
7. **Sin `/health`, sin cierre ordenado, sin límite de tamaño de mensaje.** `NestFactory.create(AppModule)` sin `enableShutdownHooks()`; Socket.io con `maxHttpBufferSize` por defecto (1 MB) y sin `pingInterval`/`pingTimeout` ajustados.
8. **Dependencia externa sin protección.** `ItunesPreviewProvider` consulta `itunes.apple.com` en cada partida de La Rocola desde la IP del servidor: en producción todas las salas comparten una sola IP frente al límite de iTunes.

## Decisiones de diseño

### 1. Rol de host con token efímero

Mismo patrón que la reconexión de jugadores (token efímero de sala, sin cuentas):

- `create_room` devuelve, **solo al socket creador**, un evento `room_created { code, hostToken }`. El `hostToken` no viaja en `room_state`.
- El flujo actual descarta el socket creador y navega a `/screen/[code]` (`create-room-button.tsx`), así que el frontend guarda el token en `sessionStorage` (`gatherplay:<CODIGO>:host`) antes de navegar, y `/screen` lo envía en `watch_room { code, hostToken }`.
- `watch_room` **sin** token (o con uno inválido) sigue permitido pero como **espectador**: recibe `room_state` y eventos, no puede mandar comandos. Esto conserva el caso de mostrar la pantalla en una segunda TV.
- Un decorador/guard `@HostOnly()` (o una comprobación centralizada en un `HostGuard` de Nest) protege los comandos de host. Un socket es host si su `socket.data.hostOf` incluye el código de la sala **y** el token coincidió. Los eventos de jugador (`join_room`, `rocola_buzz`, `submit_trivia_answer`, etc.) siguen abiertos a jugadores de esa sala, verificando además que el socket pertenece a la sala del payload (hoy se confía en `payload.code`).
- Clasificación de los 29 eventos de negocio (más `echo`):
  - **Solo host:** `create_team`, `assign_team`, `remove_team`, `randomize_teams`, `select_game`, `start_la_rocola_game`, `rocola_get_artists`, `start_trivia_game`, `start_memoriza_objetos_game`, `start_adivina_palabra_game`, `start_gestos_game`, `start_round`, `end_round`, `award_points`.
  - **Solo jugador de la sala, en su turno/rol cuando aplique:** `rocola_ready`, `rocola_buzz`, `rocola_submit_answer`, `submit_trivia_answer`, `memoriza_ready`, `memoriza_submit_guess`, `memoriza_pass`, `adivina_ready`, `adivina_guess`, `adivina_pass`, `start_gestos_turn`, `mark_gesture_word`.
  - **Abiertos:** `create_room`, `join_room` (con validación y límites), `watch_room` (espectador), `echo`.
- **Decisión abierta para Kalin:** si `award_points`/`start_round`/`end_round` (motor genérico, sin UI conectada según `game-engine-core`) siguen expuestos en producción o se desactivan por variable de entorno. Recomendado: solo host mientras no los use ningún juego.

### 2. Validación de payloads con Zod

- Un esquema por evento, definido junto al gateway (`room.schemas.ts`, etc.), y un `WsValidationPipe` común que responde `error { code: 'INVALID_PAYLOAD' }` sin lanzar excepción no controlada.
- Reglas mínimas: `code` = 5 caracteres del alfabeto de la sala (normalizado a mayúsculas), `name` recortado y de 1 a 24 caracteres, `color` con formato hexadecimal, `points` entero acotado, índices enteros dentro de rango, textos de adivinanza con longitud máxima.
- Se valida **antes** de tocar el servicio; los servicios siguen lanzando sus errores de dominio como hoy.
- Sanear el nombre de jugador (es texto libre que se muestra a toda la sala): sin caracteres de control; React ya escapa al renderizar, pero se recorta y normaliza espacios.

### 3. Rate limiting

- Librería a evaluar: `rate-limiter-flexible` (funciona en memoria, coherente con la decisión de un solo proceso). No se agrega Redis.
- Dos capas:
  - **Por IP en la conexión y en eventos caros:** máx. N `create_room` por IP por minuto (p. ej. 5), M `join_room`/`watch_room` fallidos por IP por minuto (p. ej. 20) — esto es lo que frena la fuerza bruta de códigos.
  - **Por socket en eventos de juego:** tope alto (p. ej. 20 eventos/s) solo para cortar bucles; un buzz legítimo nunca se acerca.
- La IP real detrás del proxy de la plataforma llega en `X-Forwarded-For`: configurar `trust proxy` solo con el número de saltos correcto, o cualquiera falsifica la cabecera y evade el límite. Se define en `deploy-staging`, dependiendo de la plataforma elegida.
- Tras superar el límite: `error { code: 'RATE_LIMITED', retryAfterMs }` y, ante abuso sostenido, desconexión del socket.
- Tope de jugadores por sala (`MAX_PLAYERS_PER_ROOM`, p. ej. 20) y de equipos (p. ej. 8). El tope de salas (`MAX_ROOMS`) vive en `room-lifecycle`.

### 4. Costo de IA

- **Tope por sala:** máximo de generaciones por sala y por hora (contador en memoria, se limpia con `disposeRoom` de `room-lifecycle`). Al superarlo se usa el banco de respaldo, que ya existe (`trivia-fallback-bank.ts`, `gesture-fallback-bank.ts`, `word-fallback-bank.ts`) — degradación, no error.
- **Tope global por hora** para todo el proceso, con el mismo respaldo.
- **Tope de gasto duro en la consola de Anthropic** (fuera del código, paso 5 del índice). El límite en código no sustituye al de la cuenta.
- Ya hay `timeout: 15_000, maxRetries: 1` en el cliente; se mantiene.

### 5. CORS y orígenes

- Variable `CORS_ORIGINS` (lista separada por comas: el dominio de Vercel y el de preview si se usa). En `RoomGateway` y `AppGateway` se reemplaza `origin: '*'` por esa lista; `main.ts` llama a `app.enableCors({ origin: ... })`.
- En desarrollo local y en e2e la variable por defecto sigue siendo permisiva, para no romper el flujo por LAN documentado en los `.env.example` (celulares por IP local).
- Nota: CORS no protege a un WebSocket contra clientes que no son navegadores; por eso el rol de host y el rate limit son las defensas reales, no el origen.

### 6. Operación

- `GET /health` → `{ status: 'ok', uptime, rooms, sockets, memoryMb }`. El contador de salas es el mismo de diagnóstico definido en `room-lifecycle`. No expone códigos de sala ni nombres.
- `app.enableShutdownHooks()` + un `OnApplicationShutdown` en `RoomGateway` que emite `server_restarting` a todos los sockets y espera un breve margen antes de cerrar. Los servicios ya limpian timers en `onModuleDestroy`.
- Socket.io: `pingInterval: 25_000`, `pingTimeout: 20_000` (explícitos), `maxHttpBufferSize: 10_000` (los mensajes son pequeños), `connectTimeout` corto. Ajustables por variable de entorno.
- Logging: nivel por `LOG_LEVEL`; sin registrar nombres de jugador ni contenido de respuestas.
- Proteger `ItunesPreviewProvider`: caché en memoria de las URLs ya resueltas (el catálogo curado es finito) para no repetir la consulta en cada partida, y manejo de error 403/429 → usar el banco sin previews o reintentar más tarde. Además, el script `apps/backend/scripts/resolve-rocola-track-ids.ts` ya existe: evaluar resolver y guardar las `previewUrl` **antes** del despliegue si iTunes limita la IP del servidor (se comprueba en `deploy-staging`).

## Criterios de aceptación (para pasar a `spec.md`)

- **Given** un socket que no es el host de una sala, **when** emite un evento solo-host (p. ej. `select_game`), **then** recibe `error { code: 'FORBIDDEN' }` y el estado no cambia.
- **Given** el creador de la sala con su `hostToken`, **when** abre `/screen` y hace `watch_room` con el token, **then** puede ejecutar comandos de host.
- **Given** una pantalla que hace `watch_room` sin token, **then** solo recibe estado (espectador).
- **Given** un payload mal formado (nombre de 5.000 caracteres, `points: "abc"`, código con símbolos), **then** recibe `error { code: 'INVALID_PAYLOAD' }` y ningún servicio se ejecuta.
- **Given** más de N `create_room` desde una misma IP en un minuto, **then** los siguientes reciben `RATE_LIMITED`.
- **Given** una sala que superó su tope de generaciones de IA por hora, **then** la siguiente partida usa el banco de respaldo y no llama a Anthropic.
- **Given** un origen no incluido en `CORS_ORIGINS`, **then** el navegador no completa el handshake.
- **Given** el servidor recibiendo SIGTERM, **then** los clientes reciben `server_restarting` y el proceso termina limpio.

## Pruebas

- **Unitarias:** cada esquema Zod (casos válidos e inválidos), el guard de host (matriz rol × evento, generada a partir de la clasificación de arriba para que un evento nuevo sin clasificar falle la prueba), el limitador (con `vi.useFakeTimers()`), el contador de IA por sala.
- **E2E:** matriz de autorización real contra gateways (jugador intenta comando de host, espectador idem, host correcto sí); payloads inválidos; rate limit; `/health`.
- **Prueba de contrato:** una que recorra todos los `@SubscribeMessage` del backend y falle si alguno no está en la tabla de clasificación de roles.

## Checklist manual

Tarea mayormente de backend. La parte con UI es que `/screen` guarde y envíe el `hostToken` y que abrir `/screen/<codigo>` en otra pestaña **sin** haber creado la sala muestre la pantalla sin controles (espectador). Se verifica a mano en staging. Aplica la excepción de `testing-strategy.md` para el resto.

## Subtareas

Se secuencian backend → frontend por la regla de "Tamaño de las tareas". Las de backend son independientes entre sí salvo donde se indica.

- [ ] **Backend — validación:** esquemas Zod + `WsValidationPipe` para los 29 eventos de negocio (más `echo`).
- [ ] **Backend — rol de host:** `hostToken` en `create_room`, `watch_room` con token, `@HostOnly()` y verificación de pertenencia a la sala en eventos de jugador, prueba de contrato de clasificación. Comparte patrón con `player-reconnection`.
- [ ] **Backend — límites:** rate limit por IP/socket, `MAX_PLAYERS_PER_ROOM`/equipos, tope de generaciones de IA por sala y global.
- [ ] **Backend — configuración y operación:** `CORS_ORIGINS`, `/health`, `enableShutdownHooks` + `server_restarting`, parámetros de Socket.io, caché de previews de iTunes.
- [ ] **Frontend:** guardar `hostToken` al crear la sala, enviarlo en `watch_room`, vista de espectador sin controles, manejo de `FORBIDDEN`, `RATE_LIMITED` y `server_restarting`. Depende de las de backend correspondientes.
