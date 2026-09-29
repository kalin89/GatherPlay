# Puesta en producción — Índice y decisiones generales

Documento paraguas de la Fase 5 de `specs/tasks.md`. Reúne **todos** los pendientes para subir GatherPlay a un servidor real. Los pasos 1 a 3 tienen análisis propio (enlazados abajo); los pasos 4 y 5 quedan documentados aquí y se analizan a fondo cuando lleguen.

Alcance: publicar el MVP tal como está (sin cuentas de jugador ni de host, sin Postgres para el estado en vivo — ver `specs/constitution.md`). No incluye escalamiento multi-instancia ni monetización.

## Hallazgos que motivan esta fase

Sacados de leer el código actual (no son suposiciones):

- `RoomService.rooms` es un `Map` en memoria y **nunca se le hace `delete`**. Cada servicio de juego tiene además su propio `matches` (y `roomUsedSongs`, `roomUsedObjects`, `askedQuestions`, `usedWords`…) sin limpieza por sala.
- `RoomGateway.handleDisconnect` solo llama a `removePlayerBySocketId`. El host (que entra por `watch_room` y no es un `Player`) **no se detecta**.
- La identidad del jugador es el `socket.id`: `Player.socketId` se usa en `markReady`, `handleBuzz` y equivalentes. Un corte de conexión elimina al jugador del equipo, y al volver es otro jugador nuevo.
- Los eventos de host (`create_team`, `assign_team`, `remove_team`, `randomize_teams`, `select_game`, `start_*_game`, `start_round`, `end_round`, `award_points`) **no validan quién los manda**: basta conocer el código de la sala.
- Los payloads llegan sin validar (`zod` está instalado pero no se usa en los gateways). Los códigos son de 5 caracteres sobre un alfabeto de 32 (≈33 millones de combinaciones) y no hay rate limit.
- `@WebSocketGateway({ cors: { origin: '*' } })` en `RoomGateway` y `AppGateway`; `main.ts` no configura CORS HTTP, ni `/health`, ni cierre ordenado.
- El frontend crea el socket con `io(url, { transports: ['websocket'] })` (`apps/frontend/src/lib/socket.ts`), sin política de reconexión ni identidad persistente.
- El backend **no puede ir a Vercel**: necesita un proceso siempre encendido con WebSockets y estado en memoria. Solo el frontend Next.js va a Vercel.

## Decisiones tomadas

1. **Un solo proceso de backend.** El estado en vivo sigue en memoria (principio 3 de la constitución). Escalar a varias instancias requeriría Redis + sticky sessions y queda fuera de v1.
2. **Frontend en Vercel; backend en una plataforma de contenedor persistente** (Railway, Fly.io o Render — se elige en `deploy-staging`). **Postgres no se provisiona en staging**: hoy ningún archivo de `apps/backend/src` usa Prisma y `schema.prisma` no tiene tablas. Ojo con una discrepancia a resolver antes del paso 3: `tasks.md` marca como hecha la tarea "Persistir preguntas generadas por IA en `content_banks` (Postgres)", pero ese código/tabla no existe en el repo (revisado en esta fase). O la tarea se marcó por error, o no llegó a `main`; hay que aclararlo con Kalin, porque si de verdad se necesita, Postgres pasa a ser un requisito de despliegue.
3. **Sin cuentas.** La "identidad" que se agrega es un token efímero de sala (constitución → Stack → Auth), no un login.
4. **Orden: primero robustez local, después empaquetado, después staging.** Nada de infraestructura hasta que el backend aguante los casos reales de un celular.

## Pasos (en orden)

| # | Paso | Análisis | Estado |
|---|------|----------|--------|
| 1a | Ciclo de vida de salas: expiración, host caído, limpieza en cascada | `specs/features/room-lifecycle/analysis.md` | Documentado |
| 1b | Reconexión de jugadores con identidad persistente | `specs/features/player-reconnection/analysis.md` (depende de 1a) | Documentado |
| 1c | Endurecimiento del servidor: validación, autorización de host, rate limits, CORS, `/health`, cierre ordenado | `specs/features/server-hardening/analysis.md` | Documentado |
| 2 | Empaquetado: Dockerfile, variables de entorno, build reproducible | `specs/features/deploy-packaging/analysis.md` | Documentado |
| 3 | Staging: backend en contenedor + frontend en Vercel, HTTPS/WSS | `specs/features/deploy-staging/analysis.md` (depende de 1 y 2) | Documentado |
| 4 | Prueba real con celulares | Ver abajo | Solo esbozado |
| 5 | Apertura al público | Ver abajo | Solo esbozado |

Los pasos 1a, 1b y 1c son independientes entre sí salvo la dependencia indicada; 1c puede ir en paralelo a 1a.

## Paso 4 — Prueba real (esbozo)

Se hace en staging, no en local, con 4 a 6 celulares reales y una TV o laptop como pantalla:

- Bloquear y desbloquear el celular a mitad de una partida (debe volver a su equipo — depende de 1b).
- Cambiar de WiFi a datos móviles y de vuelta.
- Cerrar y reabrir la pestaña del navegador del celular.
- Recargar la pantalla del host a mitad de partida (hoy pierde la vista pero la sala sigue; documentado en `room-lifecycle`).
- Jugar los seis minijuegos completos, incluyendo audio (La Rocola) e imágenes (Memoriza los objetos) sobre la red real.
- Latencia percibida del botón "buzz" de La Rocola y del reloj de equipo de Memoriza los objetos.
- Dejar una sala abandonada y comprobar que se libera (métrica de salas activas en `/health`).

Resultado esperado: una checklist manual propia que se documenta en `deploy-staging/analysis.md` al cerrar el paso 3. Cualquier bug encontrado se registra como tarea aparte en `tasks.md`, no se arregla dentro de este paso.

## Paso 5 — Apertura al público (esbozo)

Antes de compartir la URL fuera del círculo cercano:

- **Tope de gasto en la consola de Anthropic** (límite mensual duro) — la `ANTHROPIC_API_KEY` es el único recurso con costo variable. Complementa el rate limit por IP de `server-hardening`.
- **Alertas mínimas**: aviso si el proceso se reinicia o si la memoria pasa de un umbral.
- **Logs estructurados** con el código de sala como campo, sin datos personales (los nombres de jugador son texto libre, no se registran).
- **Página de error/mantenimiento** en el frontend cuando el backend no responde (hoy `connect_error` solo muestra un mensaje en `use-join-room.ts`).
- **Política de privacidad mínima** si se comparte públicamente (no hay cuentas ni datos persistentes, pero sí nombres de jugador en memoria).
- **Decisión pendiente de Kalin**: dominio propio o subdominio de la plataforma; y si el acceso es abierto o con una contraseña de host simple mientras no haya cuentas.

Se analiza a fondo cuando 1 a 4 estén cerrados.

## Fuera de alcance de esta fase

Cuentas de host o jugador, multi-instancia, Redis, historial de partidas, monetización, app nativa, CDN propio para imágenes/audio (hoy las imágenes de Memoriza y el audio de La Rocola salen de sus fuentes actuales — se revisa en el paso 4 si la prueba real muestra lentitud).
