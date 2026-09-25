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
- [ ] Selección y arranque de juego (backend): campo `RoomState.currentGame`, evento `select_game`, utilidad compartida de reparto de turnos (`distributeTurns`). Base genérica, no específica de Trivia — sienta lo que la tarea de Fase 4 "Selector de siguiente juego" va a reusar/extender. Ver `specs/features/game-selection/analysis.md`.
- [ ] Panel de selección de juego (frontend, `/screen` + `/play`): botón "Iniciar partida" → lista de juegos disponibles → al elegir uno, pantalla y celulares pasan a su vista. Depende de: `specs/features/game-selection/analysis.md`. Ver `specs/features/game-selection-ui/analysis.md`.
- [ ] `TriviaModule` (backend): rediseñado a turnos individuales — elige al azar el equipo y jugador que empieza, reparte los turnos parejo entre los integrantes de cada equipo, resuelve cada turno (con límite de tiempo, sin bono por rapidez) y avanza al siguiente jugador del equipo contrario. Reemplaza el diseño anterior de "todos los jugadores responden en simultáneo con bono por rapidez". Depende de: `specs/features/game-selection/analysis.md` (reparto de turnos). Ver `specs/features/trivia-module/analysis.md`.
- [ ] Componentes de pantalla y control para Trivia (frontend): turno individual con nombre del jugador, pregunta y 4 opciones en pantalla y en su celular (los demás celulares en espera sin ver la pregunta), animación al seleccionar, sonido de acierto/error desde el dispositivo del host. Depende de: `specs/features/trivia-module/analysis.md` y `specs/features/game-selection-ui/analysis.md`. Ver `specs/features/trivia-ui/analysis.md`.
- [ ] Pruebas unitarias de las reglas + e2e del camino feliz y del caso "nadie responde a tiempo".

## Fase 3 — Resto de minijuegos (uno por tarea, mismo patrón que Trivia)

- [ ] Mímica / Caras y Gestos
- [ ] Tararea y Adivina (requiere manejo de audio en el celular del jugador que tararea)
- [ ] Dibuja y Adivina (requiere lienzo con trazos en tiempo real, más carga de red que los demás)
- [ ] Rosco de palabras
- [ ] Impostor
- [ ] ¿Quién es quién?
- [ ] La Rocola (buzzer de dos jugadores compitiendo)
- [ ] Cadena de palabras contrarreloj
- [ ] Memoriza los objetos en la imagen (bloqueada: falta que Kalin agregue el requerimiento en `spec.md` → "Minijuegos" → "10. Memoriza los objetos en la imagen")

Cada una de estas ocho tareas incluye: módulo backend, componentes de pantalla/control, pruebas unitarias de sus reglas específicas, y e2e del camino feliz + el caso límite descrito en spec.md.

## Fase 4 — Pulido de sesión completa

- [ ] Selector de "siguiente juego" entre ronda y ronda, sin tener que recrear la sala. (El panel para elegir el primer juego, tras armar equipos, ya se construye en Fase 2 — esta tarea es reutilizar/extender esa misma base para la transición entre partidas sucesivas.)
- [ ] Marcador acumulado visible entre minijuegos.
- [ ] Manejo de reconexión (un jugador pierde señal y vuelve a entrar con el mismo código sin perder su lugar en el equipo).
- [ ] Persistir preguntas generadas por IA en `content_banks` (Postgres) para reusarlas y como respaldo creciente. Depende de: `specs/features/ai-content-trivia/analysis.md`.

## Explícitamente no en el backlog de v1

Registro de jugador, app nativa, cuentas de host, monetización, escalamiento multi-instancia — ver constitution.md.
