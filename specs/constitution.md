# Constitution — Family Game App

Reglas no negociables del proyecto. Cualquier decisión en spec.md, plan.md o tasks.md debe respetar esto; si algo entra en conflicto, se actualiza este archivo primero, explícitamente, no se ignora en silencio.

## Visión

App web para jugar en familia/amigos en reuniones presenciales: una pantalla compartida (TV/laptop) muestra el juego, cada invitado se une desde su propio celular como control. Inspirado en la dinámica de juegos de "Hoy" / "Viva la Alegría" (mímica, trivia, adivinar canciones, etc.) y en el modelo técnico de Jackbox Games.

## Principios

1. **Cero fricción para unirse.** Un jugador entra con un código o QR y un nombre. Nada más. No hay pantalla de registro entre el QR y el juego.
2. **Sin cuentas de jugador en v1.** Solo el host (quien crea la partida) puede tener cuenta más adelante; en v1 tampoco la necesita — cualquiera crea una partida libremente. No se diseña ni se deja "hueco" en el modelo de datos para auth de jugador todavía: se agrega como capa nueva cuando haga falta, no se anticipa.
3. **Tiempo real es el corazón del sistema.** El estado de una partida (equipos, turno, tiempo, puntaje) vive en memoria del backend mientras dura la partida. No se depende de una base de datos para que el juego funcione en vivo.
4. **Cada minijuego es un módulo independiente.** Comparten el mismo "motor de sala" (sala, equipos, jugadores, puntaje, temporizador) pero la lógica específica de cada juego (mímica, trivia, rocola, etc.) vive aislada, sin acoplarse entre sí.
5. **IA como generador de contenido, no como parte del bucle de tiempo real.** Preguntas de trivia, selección de canciones, categorías para la cadena de palabras: se generan/consultan como servicio aparte. La lógica de turnos y tiempos nunca depende de una llamada a un modelo de IA en caliente.
6. **Todo requisito nace como criterio de aceptación verificable.** Ninguna funcionalidad se implementa si no tiene primero un criterio Given/When/Then en spec.md del que se pueda derivar una prueba.

## Stack

- **Backend:** NestJS + Socket.io (WebSocket Gateway) para el motor de salas y tiempo real.
- **Frontend:** Next.js, con dos superficies separadas: vista "pantalla" (host/TV) y vista "control" (jugador/celular), ambas como clientes del mismo WebSocket de sala.
- **Persistencia:** Postgres, usado únicamente para lo que sí debe sobrevivir a una partida (cuentas de host cuando existan, bancos de preguntas/canciones personalizados, historial). No se usa para el estado en vivo de una partida.
- **Auth:** JWT, reservado para cuentas de host cuando se implementen. Jugadores usan un token efímero de sala, no cuenta real.
- **Testing:** unitarias (Vitest) para toda la lógica de juego; e2e (Playwright) para flujos críticos de cada minijuego; pruebas de aceptación derivadas directamente de los criterios Given/When/Then del spec. Ver testing-strategy.md.

## Fuera de alcance para v1

- Registro/login de jugador.
- App nativa (mobile). Solo web responsive.
- Monetización.
- Persistencia de historial de partidas.

Estos puntos se revisan explícitamente cuando "llegue el buen momento" — no se construyen "por si acaso".
