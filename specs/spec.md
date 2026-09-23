# Spec — GatherPlay

## Visión

Colección de minijuegos interactivos para jugar en familia/amigos en reuniones presenciales, inspirados en la dinámica de juegos de TV tipo "Hoy" / "Viva la Alegría": mímica, adivinar canciones, trivia, dibujar, mímicas verbales. Una pantalla compartida (TV o laptop) muestra el juego; cada invitado juega desde su propio celular.

## Audiencia

Familias y grupos de amigos reunidos presencialmente, sin perfil técnico. Debe poder empezar a jugarse en menos de un minuto desde que alguien decide "juguemos algo".

## Flujo general

1. El host abre la app en la pantalla compartida y crea una partida → se genera un código/QR.
2. EL host crea el nombre de cada equipo y elije color del equipo.
3. Los jugadores escanean el QR o entran el código desde su celular y ponen su nombre. Sin registro.
4. El host arma los equipos (o deja que la app los arme al azar).
5. El host elige el minijuego a jugar (de la lista disponible) y arranca la ronda.
6. La pantalla compartida muestra el estado del juego (pregunta, tablero, tiempo, turno); cada celular muestra los controles propios de ese juego (botón de respuesta, lienzo para dibujar, botón de "ya dije la palabra", etc.).
7. Al terminar la ronda se muestran resultados/puntaje y se puede elegir el siguiente juego.

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

### Vista de pantalla (lobby)

- **Given** una sala existente en `lobby`, **when** la pantalla abre `/screen/[roomCode]`, **then** se suscribe a esa sala sin registrarse como jugador y muestra el código de sala y el QR de invitación.
- **Given** un código de sala que no existe, **when** la pantalla lo abre, **then** muestra un mensaje de sala no encontrada en vez de quedarse esperando indefinidamente.
- **Given** la pantalla mostrando el lobby, **when** un jugador se une desde su celular, **then** su nombre aparece en la pantalla sin necesidad de recargar.
- **Given** una sala con equipos creados, **when** la pantalla muestra el lobby, **then** cada equipo aparece con su nombre, su color y sus integrantes.
- **Given** un jugador conectado que todavía no tiene equipo, **when** la pantalla muestra el lobby, **then** aparece en una lista de "sin equipo" separada de los equipos.
- **Given** la pantalla mostrando el lobby, **when** un jugador pierde la conexión, **then** desaparece de la lista en la pantalla.
- **Given** una pantalla suscrita como espectadora, **when** esa pantalla se desconecta, **then** la lista de jugadores de la sala no se altera.

## Minijuegos

### 1. Mímica / Caras y Gestos
Un jugador de un equipo actúa una palabra o frase sin hablar ni usar objetos; su equipo adivina antes de que se acabe el tiempo.

- **Given** un equipo en turno y una palabra asignada al actor, **when** el tiempo llega a cero sin que el equipo acierte, **then** la ronda termina sin puntos y pasa el turno al siguiente equipo.
- **Given** el equipo en turno, **when** alguien del equipo dice la palabra correcta y el actor confirma desde su celular, **then** se suman los puntos configurados y termina la ronda antes de que se acabe el tiempo.

### 2. Tararea y Adivina
Un jugador escucha una canción con audífonos (conectados a su celular) y la tararea o canta sin decir el nombre; su equipo adivina.

- **Given** el jugador que tararea tiene la canción sonando solo en su dispositivo, **when** el equipo dice el título/artista correcto dentro del tiempo, **then** se otorgan los puntos y termina la ronda.
- **Given** el jugador que tararea, **when** dice el nombre de la canción o el artista en voz alta, **then** la ronda se invalida (0 puntos) — regla anti-trampa.

### 3. Dibuja y Adivina
Un jugador dibuja en su celular/tablet una palabra; el resto ve el trazo en vivo en la pantalla compartida y adivina.

- **Given** el jugador que dibuja tiene una palabra asignada, **when** dibuja trazos en su control, **then** esos trazos se reflejan en tiempo real (latencia perceptible mínima) en la pantalla compartida.
- **Given** el equipo contrario o el propio equipo (según variante) adivinando, **when** alguien acierta la palabra antes del tiempo límite, **then** se otorgan puntos según qué tan rápido se acertó.

### 4. Trivia / Preguntados
Preguntas de cultura general por categorías; cada jugador responde desde su celular.

- **Given** una pregunta con 4 opciones mostrada en pantalla y en el celular de cada jugador, **when** un jugador selecciona una opción antes del tiempo límite, **then** su respuesta queda registrada una sola vez (no se puede cambiar) y se le otorgan puntos si es correcta, con bono por rapidez.
- **Given** el temporizador de la pregunta llega a cero, **when** algún jugador no respondió, **then** se cuenta como incorrecta y no penaliza puntos negativos.

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

## Fuera de alcance (ver constitution.md)

Registro de jugador, app nativa, monetización, historial persistente — no se especifican criterios de aceptación para esto en v1.
