# Tasks — Family Game App

Backlog inicial, en orden. Cada tarea se implementa y se cierra antes de pasar a la siguiente; una tarea "lista" significa código + pruebas pasando, no solo código escrito. Se marca [ ] pendiente / [x] hecho.

## Fase 0 — Setup

- [ ] Inicializar monorepo (backend NestJS + frontend Next.js), lint/formatter, CI básico (lint + test en cada push).
- [ ] Configurar Postgres local + migraciones vacías (esqueleto, sin tablas de negocio todavía).
- [ ] Endpoint/gateway WebSocket mínimo: conectar, desconectar, echo — sin lógica de juego, solo probar que la conexión pantalla↔servidor↔celular funciona de punta a punta.

## Fase 1 — Motor de sala (base de todo lo demás)

- [ ] `RoomModule`: crear sala, generar código, unirse por código, listar jugadores conectados.
- [ ] Armado de equipos (manual por el host + opción aleatoria).
- [ ] `GameEngineCore`: fases de sala (`lobby` → `jugando` → `resultados`), temporizador genérico, puntaje por equipo.
- [ ] Vista `/screen/[roomCode]` mostrando QR + código + jugadores/equipos en lobby.
- [ ] Vista `/play/[roomCode]` con formulario de nombre y espera en lobby.
- [ ] E2E: camino feliz de "crear sala → unirse → armar equipos" (sin ningún minijuego todavía).

## Fase 2 — Un minijuego de referencia (Trivia)

Se implementa Trivia primero porque es el más simple de validar (no depende de audio ni dibujo), y sirve de plantilla para los demás módulos de juego.

- [ ] `AiContentModule.getTriviaQuestions(categoria)`.
- [ ] `TriviaModule` (backend): reparte pregunta, recibe respuestas, calcula puntaje con bono por rapidez.
- [ ] Componentes de pantalla y control para Trivia.
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

Cada una de estas ocho tareas incluye: módulo backend, componentes de pantalla/control, pruebas unitarias de sus reglas específicas, y e2e del camino feliz + el caso límite descrito en spec.md.

## Fase 4 — Pulido de sesión completa

- [ ] Selector de "siguiente juego" entre ronda y ronda, sin tener que recrear la sala.
- [ ] Marcador acumulado visible entre minijuegos.
- [ ] Manejo de reconexión (un jugador pierde señal y vuelve a entrar con el mismo código sin perder su lugar en el equipo).

## Explícitamente no en el backlog de v1

Registro de jugador, app nativa, cuentas de host, monetización, escalamiento multi-instancia — ver constitution.md.
