# Tasks — GatherPlay

**Cómo se usa este archivo:** es el índice general, una línea por tarea. Nunca se le agrega detalle técnico, subtareas ni análisis aquí — eso vive en `specs/features/<juego>/analysis.md` (y su propio `tasks.md` si una tarea necesita desglosarse en subtareas más chicas). Así, para trabajar una tarea puntual (ej. Mímica) solo hace falta leer su carpeta en `features/`, no este archivo completo. Si este archivo empieza a crecer con explicaciones largas, es señal de que ese contenido se movió al lugar equivocado.

Backlog inicial, en orden. Cada tarea se implementa y se cierra antes de pasar a la siguiente; una tarea "lista" significa código + pruebas pasando, no solo código escrito. Se marca [ ] pendiente / [x] hecho.

## Fase 0 — Setup

- [x] Inicializar monorepo (backend NestJS + frontend Next.js), lint/formatter, CI básico (lint + test en cada push).
- [x] Configurar Postgres local + migraciones vacías (esqueleto, sin tablas de negocio todavía).
- [x] Endpoint/gateway WebSocket mínimo: conectar, desconectar, echo — sin lógica de juego, solo probar que la conexión pantalla↔servidor↔celular funciona de punta a punta.

## Fase 1 — Motor de sala (base de todo lo demás)

- [x] `RoomModule`: crear sala, generar código, unirse por código, listar jugadores conectados.
- [x] Armado de equipos (manual por el host + opción aleatoria).
- [x] `GameEngineCore`: fases de sala (`lobby` → `jugando` → `resultados`), temporizador genérico, puntaje por equipo.
- [x] Vista `/screen/[roomCode]` mostrando QR + código + jugadores/equipos en lobby.
- [x] Vista `/play/[roomCode]` con formulario de nombre y espera en lobby.
- [x] Backend: evento `remove_team` para que el host corrija un equipo mal creado (nombre/color) antes de arrancar.
- [x] Controles de host en `/screen`: crear/borrar equipos antes de revelar el código, asignar/randomizar jugadores desde la pantalla (host nunca es jugador). Depende de: `specs/features/remove-team/analysis.md`.
- [x] E2E: camino feliz de "crear sala → unirse → armar equipos" (sin ningún minijuego todavía).

## Fase 2 — Un minijuego de referencia (Trivia)

Se implementa Trivia primero porque es el más simple de validar (no depende de audio ni dibujo), y sirve de plantilla para los demás módulos de juego.

- [x] `AiContentModule.getTriviaQuestions(categoria)`.
- [x] Selección y arranque de juego (backend): campo `RoomState.currentGame`, evento `select_game`, utilidad compartida de reparto de turnos (`distributeTurns`). Base genérica, no específica de Trivia — sienta lo que la tarea de Fase 4 "Selector de siguiente juego" va a reusar/extender. Ver `specs/features/game-selection/analysis.md`.
- [ ] Panel de selección de juego (frontend, `/screen` + `/play`): botón "Iniciar partida" → lista de juegos disponibles → al elegir uno, pantalla y celulares pasan a su vista. Depende de: `specs/features/game-selection/analysis.md`. Ver `specs/features/game-selection-ui/analysis.md`. Código y pruebas automatizadas en verde — falta la checklist manual (`testing-strategy.md` + la propia de `game-selection-ui/analysis.md`).
- [x] `TriviaModule` (backend): rediseñado a turnos individuales — elige al azar el equipo y jugador que empieza, reparte los turnos parejo entre los integrantes de cada equipo, resuelve cada turno (con límite de tiempo, sin bono por rapidez) y avanza al siguiente jugador del equipo contrario. Reemplaza el diseño anterior de "todos los jugadores responden en simultáneo con bono por rapidez". Depende de: `specs/features/game-selection/analysis.md` (reparto de turnos). Ver `specs/features/trivia-module/analysis.md`.
- [ ] Componentes de pantalla y control para Trivia (frontend): turno individual con nombre del jugador, pregunta y 4 opciones en pantalla y en su celular (los demás celulares en espera sin ver la pregunta), animación al seleccionar, sonido de acierto/error desde el dispositivo del host. Depende de: `specs/features/trivia-module/analysis.md` y `specs/features/game-selection-ui/analysis.md`. Ver `specs/features/trivia-ui/analysis.md`. Código y pruebas automatizadas en verde — falta la checklist manual (`testing-strategy.md` + la propia de `trivia-ui/analysis.md`).
- [x] Trivia: al terminar la partida, mostrar resultados 10s y volver sola a la selección de juego (backend) — `TriviaService.finishMatch` resetea `RoomState.currentGame` a `null` después de una pausa, para poder elegir juego de nuevo sin recrear la sala. Ver `specs/features/trivia-results-timeout/analysis.md`.
- [ ] Trivia: al terminar la partida, mostrar resultados 10s y volver sola a la selección de juego (frontend) — resetear la vista de `trivia` a `idle` al recibir `currentGame: null`, para poder jugar una segunda partida sin quedar pegado en la pantalla de resultados anterior. Depende de: `specs/features/trivia-results-timeout/analysis.md`. Ver `specs/features/trivia-results-timeout-ui/analysis.md`. Código y pruebas automatizadas en verde — falta la checklist manual (jugar dos partidas seguidas).
- [ ] Pruebas unitarias de las reglas + e2e del camino feliz y del caso "nadie responde a tiempo".

## Fase 3 — Resto de minijuegos (uno por tarea, mismo patrón que Trivia)

- [x] `AiContentModule.getGestureWords(cantidad, excluir)` para Mímica / Caras y Gestos. Ver `specs/features/ai-content-gestos/analysis.md`.
- [x] `CarasYGestosModule` (backend): turnos individuales de 1 minuto con 5 palabras por turno, botón "Iniciar" antes de arrancar el temporizador, palabra visible solo en la pantalla compartida (nunca en ningún celular), puntaje por palabra adivinada. Depende de: `specs/features/ai-content-gestos/analysis.md` y `specs/features/game-selection/analysis.md` (reparto de turnos). Ver `specs/features/caras-y-gestos-module/analysis.md`.
- [ ] Componentes de pantalla y control para Mímica / Caras y Gestos (frontend): botón "Iniciar" en el celular del actor, palabra + tiempo + progreso en pantalla, botones "Adivinada"/"Paso" en el celular del actor sin la palabra, sonidos de acierto/paso/victoria desde el dispositivo del host, resumen final con palabras adivinadas por equipo. Depende de: `specs/features/caras-y-gestos-module/analysis.md` y `specs/features/game-selection-ui/analysis.md`. Ver `specs/features/caras-y-gestos-ui/analysis.md`. Código y pruebas automatizadas en verde — falta la checklist manual completa de `specs/features/caras-y-gestos-ui/analysis.md`.
- [x] Adivina la palabra: generación de palabras con dedup por sala mientras la sala
      exista. Ver `specs/features/ai-content-adivina-palabra/analysis.md`.
- [x] Adivina la palabra (backend): turnos de 30s por integrante alternando equipos
      (reusa `distributeTurns`), pool de palabras de toda la partida (no por turno),
      límite de 3 "Paso", resumen verde/rojo por turno y resultado final de la
      partida. Depende de: `specs/features/ai-content-adivina-palabra/analysis.md` y
      `specs/features/game-selection/analysis.md`. Ver
      `specs/features/adivina-palabra-module/analysis.md`.
- [ ] Adivina la palabra (frontend): pantalla con la palabra + celular del Adivinador
      con "Listo"/"Adivinada"/"Paso" (nunca ve la palabra), celulares del resto en
      espera con estado mínimo, sonidos de acierto/error reutilizados de Trivia más
      sonido de victoria nuevo. Depende de:
      `specs/features/adivina-palabra-module/analysis.md` y
      `specs/features/game-selection-ui/analysis.md`. Ver
      `specs/features/adivina-palabra-ui/analysis.md`. Código y pruebas automatizadas
      en verde — falta la checklist manual (`testing-strategy.md` + la propia de
      `adivina-palabra-ui/analysis.md`).
- [ ] Tararea y Adivina (requiere manejo de audio en el celular del jugador que tararea)
- [ ] Dibuja y Adivina (requiere lienzo con trazos en tiempo real, más carga de red que los demás)
- [ ] Rosco de palabras
- [ ] Impostor
- [ ] ¿Quién es quién?
- [x] La Rocola: contenido (banco de 79 canciones reales + preview/portada vía
      iTunes, banco de respaldo, dedup por sala). Ver
      `specs/features/rocola-content/analysis.md`.
- [x] La Rocola (backend): buzzer libre, pausa/reanuda canción, robo de punto,
      revelación de título/artista/portada por ronda, 10 canciones por partida.
      Depende de: `specs/features/rocola-content/analysis.md`. Ver
      `specs/features/la-rocola-module/analysis.md`.
- [ ] La Rocola (frontend): botón "¡Me la sé!", conteo con sonido de reloj, audio desde
      el host, robo de punto, revelación, y primera implementación de las
      convenciones de pantalla de juego (instrucciones + "Listo" de todos, marcador en
      la esquina superior derecha, ganador/empate). Depende de:
      `specs/features/la-rocola-module/analysis.md` y
      `specs/features/game-selection-ui/analysis.md`. Ver
      `specs/features/la-rocola-ui/analysis.md`. Código y pruebas automatizadas en
      verde — falta la checklist manual (`testing-strategy.md` + la propia de
      `la-rocola-ui/analysis.md`).
- [x] La Rocola: filtro opcional por género o artista, elegido por el host antes de
      arrancar (backend) — `countAvailable`/`getAvailableArtists` en
      `RocolaContentService`, `filtro` opcional en `LaRocolaService.startMatch`,
      validación de "no alcanza" antes del `ReadyGate`. Depende de:
      `specs/features/rocola-content/analysis.md` y
      `specs/features/la-rocola-module/analysis.md` (sección "Cambio de regla
      (iteración 3)" de ambos, ya escrita).
- [ ] La Rocola: filtro opcional por género o artista (frontend) — selector en la
      pantalla antes de las instrucciones ("Aleatorio"/género/artista de una lista),
      corrige además que el celular no muestre "Listo" antes de que la partida exista.
      Depende de la sub-tarea de backend de arriba. Ver
      `specs/features/la-rocola-ui/analysis.md` (sección "5b. Selector de filtro").
      Código y pruebas automatizadas en verde — falta la checklist manual
      (`testing-strategy.md` + la propia de `la-rocola-ui/analysis.md`).
- [ ] Adaptar Trivia, Caras y Gestos y Adivina la palabra a las convenciones de
      pantalla de juego (instrucciones + "Listo" de todos, marcador en la esquina
      superior derecha, ganador/empate) usando los componentes genéricos y el
      `ReadyGate` construidos en `specs/features/la-rocola-module/analysis.md` /
      `specs/features/la-rocola-ui/analysis.md` — no requiere volver a abrir esas
      tareas ya cerradas, solo consumir lo que ya existe.
- [ ] Cadena de palabras contrarreloj
- [x] Memoriza los objetos: banco curado de objetos (palabra + imagen), sin generación
      por IA. Ver `specs/features/memoriza-objetos-content/analysis.md`.
- [x] Memoriza los objetos (backend): tablero de 20 objetos armado al elegir el juego
      (precarga), fases "Pon Mucha Atención" (5s) → memorización (30s, solo imagen) →
      adivinanza con reloj de equipo tipo "reloj de ajedrez" (1:30 c/u, un intento por
      turno, "Pasar" habilitado a los 10s), fin de partida y resultado. Depende de:
      `specs/features/memoriza-objetos-content/analysis.md`,
      `specs/features/game-selection/analysis.md` y
      `specs/features/la-rocola-module/analysis.md` (`ReadyGate`, `answer-matcher.ts`).
      Ver `specs/features/memoriza-objetos-module/analysis.md`.
- [x] Memoriza los objetos (frontend): grilla de imágenes animada en 5 tramos (fase de
      memorización) y de pistas/palabras reveladas (fase de adivinanza), relojes de
      equipo, precarga de imágenes durante la espera de "Listo", campo de texto +
      "Enviar"/"Pasar" en el celular del jugador en turno. Depende de:
      `specs/features/memoriza-objetos-module/analysis.md`,
      `specs/features/game-selection-ui/analysis.md` y
      `specs/features/la-rocola-ui/analysis.md` (componentes genéricos de
      convención: `GameInstructions`, `ReadyButton`, `MatchScoreboard`,
      `MatchWinnerBanner`). Ver `specs/features/memoriza-objetos-ui/analysis.md`.

Cada una de estas nueve tareas incluye: módulo backend, componentes de pantalla/control, pruebas unitarias de sus reglas específicas, y e2e del camino feliz + el caso límite descrito en spec.md.

## Fase 4 — Pulido de sesión completa

- [x] Selector de "siguiente juego" entre ronda y ronda, sin tener que recrear la sala. (El panel para elegir el primer juego, tras armar equipos, ya se construye en Fase 2 — esta tarea es reutilizar/extender esa misma base para la transición entre partidas sucesivas.)
- [x] Marcador acumulado visible entre minijuegos.
- [ ] Manejo de reconexión (un jugador pierde señal y vuelve a entrar con el mismo código sin perder su lugar en el equipo). Depende de: `specs/features/room-lifecycle/analysis.md`. Ver `specs/features/player-reconnection/analysis.md` (subtareas de backend y frontend separadas).
- [ ] Persistir preguntas generadas por IA en `content_banks` (Postgres) para reusarlas y como respaldo creciente. Depende de: `specs/features/ai-content-trivia/analysis.md`. **Diferida** (decisión de Kalin, 2026-09-29): estaba marcada como hecha pero el código/tabla no existe en el repo; staging se despliega sin Postgres.
- [x] Limpieza de salas abandonadas (backend): hoy una sala nunca se borra del `Map` en memoria de `RoomModule` — ni cuando el host se desconecta (no se detecta, no es un `Player`) ni cuando se van todos los jugadores. Definir un criterio de expiración/limpieza (ej. TTL de inactividad) para no acumular estado indefinidamente en el proceso. Ver `specs/features/room-lifecycle/analysis.md` (amplía el alcance: host caído, limpieza en cascada de los servicios de juego, tope de salas).
- [x] Ciclo de vida de salas (frontend): mostrar en `/play` y `/screen` los eventos `host_disconnected` (aviso "el host se desconectó, esperando…") y `room_closed` (pantalla de "sala cerrada" con salida al inicio). Depende de: `specs/features/room-lifecycle/analysis.md` (backend, ya cerrado). Ver `specs/features/room-lifecycle-ui/analysis.md`. Código y pruebas automatizadas en verde — falta la checklist manual descrita ahí.

## Fase 5 — Puesta en producción

Índice y decisiones generales en `specs/features/production-readiness/analysis.md`. Las tareas de Fase 4 "Manejo de reconexión" y "Limpieza de salas abandonadas" (arriba) son los pasos 1b y 1a de esta fase.

- [ ] Endurecimiento del servidor: validación de payloads, rol de host, rate limits, tope de IA, CORS, `/health`, cierre ordenado. Ver `specs/features/server-hardening/analysis.md` (subtareas de backend y frontend separadas; el rol de host comparte patrón con `specs/features/player-reconnection/analysis.md`).
- [ ] Empaquetado: `Dockerfile` del backend, validación de configuración al arrancar, `.env.example` completos, job `docker` en CI. Ver `specs/features/deploy-packaging/analysis.md`.
- [ ] Staging: backend en contenedor persistente + frontend en Vercel, HTTPS/WSS. Depende de: `specs/features/deploy-packaging/analysis.md`, `specs/features/room-lifecycle/analysis.md`, `specs/features/player-reconnection/analysis.md` y `specs/features/server-hardening/analysis.md`. Ver `specs/features/deploy-staging/analysis.md`.
- [ ] Prueba real con celulares en staging (checklist manual, solo esbozada en `specs/features/production-readiness/analysis.md`). Depende de: `specs/features/deploy-staging/analysis.md`.
- [ ] Apertura al público (tope de gasto de Anthropic, alertas, página de error, decisión de acceso). Solo esbozada en `specs/features/production-readiness/analysis.md`; se analiza a fondo cuando lo anterior esté cerrado.

## Explícitamente no en el backlog de v1

Registro de jugador, app nativa, cuentas de host, monetización, escalamiento multi-instancia — ver constitution.md.
