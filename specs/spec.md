# Spec — GatherPlay

## Visión

Colección de minijuegos interactivos para jugar en familia/amigos en reuniones presenciales, inspirados en la dinámica de juegos de TV tipo "Hoy" / "Viva la Alegría": mímica, adivinar canciones, trivia, dibujar, mímicas verbales. Una pantalla compartida (TV o laptop) muestra el juego; cada invitado juega desde su propio celular.

## Audiencia

Familias y grupos de amigos reunidos presencialmente, sin perfil técnico. Debe poder empezar a jugarse en menos de un minuto desde que alguien decide "juguemos algo".

## Flujo general

1. El host abre la app en la pantalla compartida y crea una partida.
2. El host crea el nombre de cada equipo y elije color del equipo, todavía sin mostrar nada a los jugadores.
3. Con al menos un equipo creado, el host revela el código/QR.
4. Los jugadores escanean el QR o entran el código desde su celular y ponen su nombre. Sin registro.
5. El host asigna cada jugador a un equipo (o deja que la app los arme al azar) — puede seguir ajustando equipos en cualquier momento del lobby.
6. El host elige el minijuego a jugar (de la lista disponible) y arranca la ronda.
7. La pantalla compartida muestra el estado del juego (pregunta, tablero, tiempo, turno); cada celular muestra los controles propios de ese juego (botón de respuesta, lienzo para dibujar, botón de "ya dije la palabra", etc.).
8. Al terminar la ronda se muestran resultados/puntaje y se puede elegir el siguiente juego.

## Modelo funcional de sala

- **Sala**: código único, estado (`lobby`, `jugando`, `resultados`), lista de equipos, minijuego activo.
- **Equipo**: nombre, color, lista de jugadores, puntaje acumulado.
- **Jugador**: nombre, equipo asignado, conexión activa (celular).
- **Ronda**: minijuego, turno actual (equipo/jugador), temporizador, resultado.

## Motor de sala

Criterios del motor de sala (Fase 1 de tasks.md): crear sala, generar código, unirse por código, listar jugadores conectados, armado de equipos, y fases de juego (`lobby` → `jugando` → `resultados`) con temporizador y puntaje.

- **Given** ningún dato previo, **when** el host crea una partida, **then** se genera un código único de sala y la sala queda en estado `lobby` sin jugadores.
- **Given** un código de sala válido en estado `lobby`, **when** un jugador se une con un nombre, **then** se agrega a la lista de jugadores de esa sala y todos los clientes conectados a esa sala reciben la lista actualizada.
- **Given** un código de sala que no existe, **when** un jugador intenta unirse con ese código, **then** recibe un error y no se agrega a ninguna sala.
- **Given** dos jugadores uniéndose a la misma sala al mismo tiempo, **when** ambos envían su solicitud de unión, **then** ambos quedan registrados sin pisarse entre sí (sin condición de carrera que pierda a uno de los dos).
- **Given** un jugador conectado a una sala, **when** pierde la conexión (cierra la pestaña o se corta el WebSocket), **then** se remueve de la lista de jugadores y el resto de los clientes ven la lista actualizada. (Reconexión con el mismo código sin perder el lugar es Fase 4 — fuera de esta tarea.)

### Armado de equipos

- **Given** una sala en `lobby`, **when** el host crea un equipo con nombre y color, **then** el equipo se agrega a la sala sin jugadores y todos los clientes conectados reciben el estado actualizado.
- **Given** un jugador sin equipo asignado, **when** el host lo asigna manualmente a un equipo existente, **then** el jugador queda en ese equipo (y se quita de cualquier equipo anterior) y todos los clientes reciben el estado actualizado.
- **Given** una sala con equipos creados y jugadores conectados, **when** el host pide armar los equipos al azar, **then** todos los jugadores quedan redistribuidos entre los equipos existentes de la forma más pareja posible.
- **Given** una sala sin ningún equipo creado, **when** el host pide armar los equipos al azar, **then** recibe un error y no se modifica el estado.
- **Given** un id de jugador o de equipo que no existe en la sala, **when** el host intenta asignarlo, **then** recibe un error y no se modifica el estado.
- **Given** un equipo existente (con o sin jugadores), **when** el host lo elimina, **then** el equipo desaparece de la sala y los jugadores que estaban en él quedan sin equipo asignado, sin dejar de ser jugadores de la sala.
- **Given** un id de equipo que no existe, **when** el host intenta eliminarlo, **then** recibe un error y no se modifica el estado.

### Fases, temporizador y puntaje

- **Given** una sala en `lobby` con equipos armados, **when** el host inicia una ronda con una duración en segundos, **then** la sala pasa a estado `jugando` y todos los clientes de la sala reciben el estado con el tiempo restante igual a la duración configurada.
- **Given** una ronda en curso, **when** pasa cada segundo, **then** todos los clientes de la sala reciben el tiempo restante actualizado calculado por el servidor, sin que ningún cliente lleve su propio reloj.
- **Given** una ronda en curso, **when** el tiempo restante llega a cero, **then** la sala pasa a estado `resultados`, se notifica el fin de la ronda con el puntaje de cada equipo y deja de emitirse tiempo restante.
- **Given** una ronda en curso, **when** el host la termina antes de que se acabe el tiempo, **then** la sala pasa a `resultados` igual que si el tiempo se hubiera agotado y el temporizador se detiene.
- **Given** una sala con una ronda ya en curso, **when** el host intenta iniciar otra ronda en esa misma sala, **then** recibe un error y la ronda en curso sigue corriendo con su tiempo intacto.
- **Given** una sala en `resultados`, **when** el host inicia una ronda nueva, **then** la sala vuelve a `jugando` y los puntajes acumulados de los equipos se conservan.
- **Given** un equipo de una sala, **when** se le otorgan puntos, **then** su puntaje acumulado aumenta en esa cantidad y todos los clientes de la sala reciben el marcador actualizado.
- **Given** un equipo recién creado, **when** todavía no se le otorgan puntos, **then** su puntaje es cero.
- **Given** un código de sala o un id de equipo que no existe, **when** el host intenta iniciar una ronda u otorgar puntos con ese id, **then** recibe un error y no se modifica ningún estado.
- **Given** una duración de ronda inválida (cero, negativa o no entera), **when** el host intenta iniciar la ronda, **then** recibe un error y la sala permanece en el estado en que estaba.
- **Given** una ronda en curso, **when** todos los jugadores de la sala se desconectan, **then** el temporizador se detiene y la sala deja de emitir actualizaciones de tiempo.

### Vista de pantalla (lobby y controles de host)

La pantalla compartida (TV/iPad/computadora) es también el panel del host — el host nunca es un jugador, no entra por `/play`. Antes de invitar a nadie, arma los equipos desde acá mismo; recién entonces revela el código/QR.

- **Given** una sala recién creada sin equipos, **when** la pantalla abre `/screen/[roomCode]`, **then** se suscribe a esa sala sin registrarse como jugador y muestra el armado de equipos, sin revelar todavía el código ni el QR.
- **Given** un código de sala que no existe, **when** la pantalla lo abre, **then** muestra un mensaje de sala no encontrada en vez de quedarse esperando indefinidamente.
- **Given** la pantalla en el armado de equipos, **when** el host crea un equipo con nombre y color, **then** aparece en la lista y la opción de "mostrar código" queda disponible.
- **Given** ningún equipo creado todavía, **when** el host intenta mostrar el código, **then** no puede — esa opción permanece deshabilitada hasta que exista al menos un equipo.
- **Given** al menos un equipo creado, **when** el host elige mostrar el código, **then** la pantalla revela el código de sala y el QR de invitación, y esto no vuelve a ocultarse en esa sesión de pantalla.
- **Given** el código ya revelado, **when** el host crea, elimina o reasigna equipos, **then** puede seguir haciéndolo con la pantalla mostrando el código y el lobby al mismo tiempo.
- **Given** la pantalla mostrando el lobby, **when** un jugador se une desde su celular, **then** su nombre aparece en la pantalla sin necesidad de recargar.
- **Given** una sala con equipos creados, **when** la pantalla muestra el lobby, **then** cada equipo aparece con su nombre, su color y sus integrantes.
- **Given** un jugador conectado que todavía no tiene equipo, **when** la pantalla muestra el lobby, **then** aparece en una lista de "sin equipo" separada de los equipos, con una forma de asignarlo manualmente a un equipo desde la pantalla.
- **Given** jugadores conectados y equipos creados, **when** el host pide randomizar desde la pantalla, **then** todos los jugadores quedan redistribuidos parejo entre los equipos (mismo comportamiento de "Armado de equipos", ahora disparado desde esta vista).
- **Given** la pantalla mostrando el lobby, **when** un jugador pierde la conexión, **then** desaparece de la lista en la pantalla.
- **Given** una pantalla suscrita como espectadora, **when** esa pantalla se desconecta, **then** la lista de jugadores de la sala no se altera.

### Vista de jugador (unirse)

- **Given** un código de sala válido en `lobby`, **when** el jugador completa el formulario de nombre en `/play/[roomCode]` y lo envía, **then** se une a la sala y la vista pasa a la pantalla de espera.
- **Given** un campo de nombre vacío o con solo espacios, **when** el jugador intenta enviar el formulario, **then** el formulario no lo permite y muestra un mensaje, sin intentar unirse a la sala.
- **Given** un código de sala que no existe, **when** el jugador intenta unirse desde `/play/[roomCode]`, **then** ve un mensaje de sala no encontrada en vez de quedarse esperando indefinidamente.
- **Given** el jugador ya unido esperando en el lobby, **when** el host lo asigna a un equipo, **then** la vista refleja el equipo (nombre y color) sin necesidad de recargar.
- **Given** el jugador ya unido esperando en el lobby, **when** cierra la pestaña o se corta el WebSocket, **then** se remueve de la sala (mismo comportamiento ya cubierto por "Motor de sala" — aplica también a esta vista).

### Selección y arranque de juego

Tras armar equipos, el host arranca la partida eligiendo un minijuego de una lista — no se entra directo a un juego fijo. Esta vista es la base reutilizable para elegir juego entre rondas (Fase 4 la extiende para el caso de "ya hubo una partida antes, elegir la siguiente sin recrear la sala").

- **Given** una sala en `lobby` con al menos un equipo que tiene integrantes, **when** el host presiona "Iniciar partida" en `/screen`, **then** se muestra el panel de selección de juegos con los juegos disponibles.
- **Given** ningún equipo tiene integrantes todavía, **when** el host intenta iniciar partida, **then** no puede — la opción permanece deshabilitada hasta que al menos un equipo tenga jugadores.
- **Given** el panel de selección de juegos, **when** el host elige uno de la lista, **then** la pantalla y el celular de cada jugador pasan a la vista de ese juego, sin necesidad de recargar ninguno de los dos.

### Reparto de turnos entre jugadores de un equipo

Regla compartida para cualquier minijuego que reparta turnos individuales entre los integrantes de un equipo (ej. Trivia) — se documenta una sola vez acá porque aplica igual a cualquier minijuego futuro con el mismo patrón, no solo a Trivia.

- **Given** una cantidad de rondas configurada para el juego y equipos de distinto tamaño, **when** arranca la partida, **then** el total de turnos de cada equipo es "rondas × tamaño del equipo más grande", y ese total se reparte lo más parejo posible entre los integrantes de ese equipo (ningún jugador del equipo tiene dos turnos más que otro compañero de su mismo equipo).

## Contenido de IA — Trivia

`AiContentModule.getTriviaQuestions(categoria)` genera las preguntas de Trivia (ver
"Minijuegos" → "4. Trivia / Preguntados") antes de que arranque la ronda, nunca durante el
temporizador (constitution.md, principio 5).

- **Given** una categoría válida, **when** se piden N preguntas, **then** se devuelven N
  preguntas, cada una con 4 opciones distintas y exactamente una correcta, sin preguntas
  repetidas en el lote.
- **Given** una categoría válida, **when** se generan las preguntas, **then** la posición
  de la opción correcta varía entre preguntas (se baraja en el servidor, no la elige la IA).
- **Given** la IA falla, tarda más que el timeout, rechaza el pedido o devuelve contenido
  inválido, **when** se piden preguntas, **then** se devuelven N preguntas del banco de
  respaldo de esa categoría, sin error hacia quien llama.
- **Given** no hay credencial de IA configurada, **when** se piden preguntas, **then** se
  usa el banco de respaldo directamente, sin intentar llamar a la IA.
- **Given** una categoría que no existe, **when** se piden preguntas, **then** se recibe un
  error y no se llama a la IA.
- **Given** una cantidad inválida (menor a 1, mayor a 20, o no entera), **when** se piden
  preguntas, **then** se recibe un error y no se llama a la IA.

## Contenido de IA — Caras y Gestos

`AiContentModule.getGestureWords(cantidad, excluir)` genera las palabras/frases para
mímica (ver "Minijuegos" → "1. Mímica / Caras y Gestos") antes de arrancar la partida
completa (todos los turnos, no turno por turno), nunca durante el temporizador de un
turno (constitution.md, principio 5). No hay categoría seleccionable — cada pedido
devuelve una mezcla de tipos (cosa, verbo, objeto, profesión, animal, lugar, personaje,
etc.), igual que describe el requerimiento original.

- **Given** una cantidad válida, **when** se piden N palabras, **then** se devuelven N
  palabras o frases cortas, sin repetidas en el lote.
- **Given** una lista de palabras a excluir (ya usadas antes en la misma sala), **when**
  se piden palabras nuevas, **then** ninguna de las devueltas coincide con las excluidas,
  para que una sala que juega varias partidas de este minijuego no repita palabras.
- **Given** la IA falla, tarda más que el timeout, rechaza el pedido o devuelve contenido
  inválido, **when** se piden palabras, **then** se devuelven N palabras del banco de
  respaldo (aplicando el mismo criterio de exclusión), sin error hacia quien llama.
- **Given** no hay credencial de IA configurada, **when** se piden palabras, **then** se
  usa el banco de respaldo directamente, sin intentar llamar a la IA.
- **Given** una cantidad inválida (menor a 1, mayor al máximo permitido por pedido, o no
  entera), **when** se piden palabras, **then** se recibe un error y no se llama a la IA.

## Minijuegos

### 1. Mímica / Caras y Gestos
Por turnos individuales (usa "Reparto de turnos entre jugadores de un equipo", 3 rondas por defecto — igual que Trivia): a cada integrante le toca un turno de 1 minuto en el que debe hacer mímica de 5 palabras para que su equipo las adivine, sin hablar ni usar objetos. El actor ve la palabra únicamente en la pantalla compartida (host) — nunca en su celular — por eso se para de frente a ella; su equipo se da la espalda a la pantalla para no verla antes de adivinar.

- **Given** la partida de Caras y Gestos recién elegida desde el panel de selección de juego, **when** arranca, **then** el sistema elige al azar qué equipo empieza y qué integrante de ese equipo tiene el primer turno, igual que Trivia.
- **Given** el turno de un jugador, **when** le toca actuar, **then** su celular muestra solo un botón "Iniciar" (sin ninguna palabra) y el resto de los celulares (de su equipo y del equipo contrario) quedan en espera mostrando a quién le toca, sin ninguna palabra tampoco.
- **Given** el jugador en turno con el botón "Iniciar" en su celular, **when** lo presiona, **then** arranca el temporizador de 1 minuto y la pantalla compartida muestra la primera de sus 5 palabras junto con el tiempo restante descendiendo; el celular del jugador en turno cambia a mostrar únicamente los botones "Adivinada" y "Paso" (nunca la palabra).
- **Given** una palabra activa durante el turno, **when** el jugador en turno presiona "Adivinada", **then** se otorga 1 punto a su equipo, la palabra queda resuelta (no vuelve a aparecer en este turno) y se muestra la siguiente palabra pendiente, con un sonido de éxito reproducido desde el dispositivo del host.
- **Given** una palabra activa durante el turno, **when** el jugador en turno presiona "Paso", **then** esa palabra se pospone al final de las pendientes de este turno (puede volver a aparecer si no se acaba el tiempo) y se muestra la siguiente palabra pendiente, con un sonido de "paso" distinto al de acierto, reproducido desde el dispositivo del host.
- **Given** un turno en curso, **when** las 5 palabras quedan resueltas como "Adivinada" antes de que se acabe el minuto, **then** el turno termina de inmediato con los puntos de las palabras adivinadas (5 en este caso), sin esperar a que se agote el tiempo.
- **Given** un turno en curso, **when** el minuto llega a cero sin que se hayan adivinado las 5 palabras, **then** el turno termina con los puntos de las palabras adivinadas hasta ese momento únicamente (ej. 3 de 5 adivinadas → 3 puntos), sin penalización por las no adivinadas.
- **Given** un turno recién resuelto, **when** termina la pausa de transición, **then** le toca el turno al integrante correspondiente del equipo contrario, con la misma dinámica (botón "Iniciar" primero), según el reparto de turnos de la partida.
- **Given** todos los turnos repartidos de todos los equipos ya jugados, **when** eso ocurre, **then** la partida pasa a resultados mostrando el puntaje obtenido en esa partida por cada equipo y las palabras que adivinó cada uno, con un sonido divertido para el equipo (o equipos) con más puntos.

### 2. Tararea y Adivina
Un jugador escucha una canción con audífonos (conectados a su celular) y la tararea o canta sin decir el nombre; su equipo adivina.

- **Given** el jugador que tararea tiene la canción sonando solo en su dispositivo, **when** el equipo dice el título/artista correcto dentro del tiempo, **then** se otorgan los puntos y termina la ronda.
- **Given** el jugador que tararea, **when** dice el nombre de la canción o el artista en voz alta, **then** la ronda se invalida (0 puntos) — regla anti-trampa.

### 3. Dibuja y Adivina
Un jugador dibuja en su celular/tablet una palabra; el resto ve el trazo en vivo en la pantalla compartida y adivina.

- **Given** el jugador que dibuja tiene una palabra asignada, **when** dibuja trazos en su control, **then** esos trazos se reflejan en tiempo real (latencia perceptible mínima) en la pantalla compartida.
- **Given** el equipo contrario o el propio equipo (según variante) adivinando, **when** alguien acierta la palabra antes del tiempo límite, **then** se otorgan puntos según qué tan rápido se acertó.

### 4. Trivia / Preguntados
Preguntas de cultura general por categorías, por turnos individuales: en cada turno responde un solo jugador mientras el resto espera, alternando entre equipos. Usa el reparto de turnos compartido ("Reparto de turnos entre jugadores de un equipo", en "Motor de sala") con 3 rondas por defecto.

- **Given** la partida de Trivia recién elegida desde el panel de selección de juego, **when** arranca, **then** el sistema elige al azar qué equipo empieza y qué integrante de ese equipo tiene el primer turno.
- **Given** el turno de un jugador, **when** le toca responder, **then** la pantalla muestra su nombre, la pregunta y las 4 opciones, y su celular muestra la misma pregunta con las mismas 4 opciones; los celulares del resto de los jugadores permanecen en espera, sin mostrar la pregunta.
- **Given** el turno de un jugador, **when** selecciona una opción dentro del tiempo límite del turno, **then** su respuesta queda registrada una sola vez (no se puede cambiar), se otorgan puntos fijos a su equipo si es correcta (sin bono por rapidez), y se muestra el resultado en pantalla con una animación y un sonido de acierto o error reproducido desde el dispositivo del host, con una pausa de 2 a 3 segundos antes de continuar.
- **Given** el turno de un jugador, **when** el tiempo límite del turno llega a cero sin que responda, **then** se cuenta como incorrecta, no se otorgan puntos ni se penaliza con puntos negativos, y se sigue la misma pausa y sonido de "incorrecta" antes de continuar.
- **Given** un turno recién resuelto, **when** termina la pausa, **then** le toca el turno al integrante correspondiente del equipo contrario, según el reparto de turnos de la partida.
- **Given** todos los turnos repartidos de ambos equipos ya jugados, **when** eso ocurre, **then** la partida de Trivia pasa a resultados con el puntaje **obtenido en esa partida** de cada equipo (no el acumulado entre partidas — ese se ve en el panel de selección de juego, ver "Motor de sala" → "Selección y arranque de juego").

### 5. Rosco de palabras (estilo Pasapalabra)
Preguntas ordenadas por letra del abecedario; se puede pasar y volver.

- **Given** una letra activa con su pregunta, **when** el jugador en turno responde correctamente, **then** esa letra se marca en verde y avanza a la siguiente letra pendiente.
- **Given** una letra activa, **when** el jugador dice "paso", **then** esa letra se marca como pendiente y se reinsertan al final de la ronda para intentarla de nuevo antes de que se acabe el tiempo total del rosco.

### 6. Impostor
Todos los jugadores de una ronda reciben la misma palabra secreta excepto uno (el impostor), que no la conoce. Con pistas orales por turnos, el grupo intenta descubrir al impostor antes de que él adivine la palabra.

- **Given** el inicio de la ronda, **when** se reparten los roles, **then** exactamente un jugador recibe el rol de impostor (sin la palabra) y el resto recibe la misma palabra — el impostor no sabe quién más es impostor porque no hay otro.
- **Given** la ronda de votación al final del tiempo de pistas, **when** la mayoría vota correctamente por el impostor, **then** el grupo gana los puntos; **when** el impostor logra decir la palabra secreta o la mayoría vota mal, **then** el impostor gana los puntos.

### 7. ¿Quién es quién?
Un jugador recibe un personaje/celebridad asignado (solo visible para los demás) y le hace preguntas de sí/no al grupo hasta adivinar quién es.

- **Given** un jugador con un personaje asignado que él no puede ver, **when** hace una pregunta y el grupo responde "sí" o "no" (por voto mayoritario desde sus celulares), **then** la respuesta agregada se muestra al jugador que pregunta.
- **Given** el jugador que pregunta, **when** dice el nombre correcto del personaje antes de agotar sus intentos/tiempo, **then** gana los puntos de la ronda.

### 8. La Rocola
Se forman equipos; en cada ronda un integrante de cada equipo escucha la canción que suena y compite contra su rival por adivinarla primero.

- **Given** dos jugadores (uno por equipo) con la misma canción sonando, **when** uno de los dos presiona su botón de "ya sé" antes que el otro, **then** se le da la primera oportunidad de responder; si acierta, su equipo gana los puntos y termina la ronda.
- **Given** el primer jugador en presionar responde incorrecto, **when** eso ocurre, **then** se le da la oportunidad al segundo jugador antes de pasar a la siguiente canción.

### 9. Cadena de palabras contrarreloj
Se da una categoría; cada equipo dice una palabra relacionada y presiona un botón, lo que arranca la cuenta regresiva del equipo contrario.

- **Given** una categoría activa y el equipo A en posesión del turno con su temporizador corriendo, **when** alguien del equipo A dice una palabra válida (no repetida) y presiona el botón, **then** el temporizador del equipo A se detiene y arranca el del equipo B.
- **Given** el temporizador de un equipo llega a cero, **when** eso ocurre, **then** ese equipo pierde la ronda y el equipo contrario gana los puntos.
- **Given** una palabra ya dicha en la ronda, **when** algún jugador repite esa misma palabra, **then** no se acepta como válida y el temporizador de su equipo sigue corriendo.

### 10. Memoriza los objetos en la imagen

_Pendiente: Kalin agrega acá el requerimiento — descripción del juego, reglas y cómo
funciona. Sin esto, no se escribe `specs/features/<juego>/analysis.md` ni se empieza
la tarea correspondiente en Fase 3 de `tasks.md` (regla de `CLAUDE.md`: todo requisito
nace como criterio de aceptación verificable)._

## Fuera de alcance (ver constitution.md)

Registro de jugador, app nativa, monetización, historial persistente — no se especifican criterios de aceptación para esto en v1.
