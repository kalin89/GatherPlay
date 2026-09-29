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

### Convenciones de toda pantalla de juego

Reglas compartidas por cualquier minijuego, nuevas o existentes — se documentan una
sola vez acá. Un minijuego nuevo las implementa desde el día uno; adaptar los
minijuegos ya cerrados (Trivia, Caras y Gestos, Adivina la palabra) a estas
convenciones es una tarea aparte en `tasks.md`, no se reabren esas tareas para esto.

- **Given** un minijuego recién elegido desde el panel de selección, **when** arranca,
  **then** la pantalla y el celular de cada jugador muestran las instrucciones del
  juego de forma clara pero breve, junto con un botón "Listo" en cada celular.
- **Given** las instrucciones visibles con jugadores que todavía no presionaron
  "Listo", **when** falta al menos uno, **then** el juego no arranca y se puede ver
  cuántos faltan.
- **Given** todos los jugadores conectados con equipo asignado presionan "Listo",
  **when** eso ocurre, **then** las instrucciones se ocultan en todos los dispositivos
  y arranca el juego (el conteo o el primer turno, según cada minijuego).
- **Given** un jugador se desconecta mientras se espera que todos presionen "Listo",
  **when** eso ocurre, **then** deja de contarse entre los pendientes.
- **Given** cualquier pantalla de un minijuego en curso, **when** se muestra, **then**
  el marcador de esa partida (puntaje parcial de cada equipo, en 0 al arrancar) aparece
  en la esquina superior derecha durante todo el juego.
- **Given** una partida de cualquier minijuego que termina, **when** se muestran los
  resultados, **then** se indica el equipo ganador ("El ganador de este juego es el
  equipo {nombre}") o, si hay empate en el puntaje más alto, la palabra "Empate".
- **Given** los puntos obtenidos en una partida de cualquier minijuego, **when** la
  partida termina, **then** esos puntos ya quedaron sumados al puntaje acumulado de
  cada equipo (mismo mecanismo que "Fases, temporizador y puntaje" en "Motor de sala")
  y ese acumulado se ve reflejado en el panel de selección de juego.
- **Given** un minijuego en curso en la pantalla (host/TV), **when** no es La Rocola,
  **then** suena de fondo, bajito, una música instrumental sintetizada (sin archivos ni
  licencias, mismo criterio que los efectos de sonido). No suena en el celular de los
  jugadores. En La Rocola no suena, porque ahí hay que escuchar la canción que se está
  adivinando.

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

## Contenido de IA — Adivina la palabra

`AiContentModule.getAdivinaPalabraWords(cantidad, excluir)` genera las palabras del
juego "Adivina la palabra" (ver "Minijuegos" → "11. Adivina la palabra") antes de que
arranque la partida completa, nunca durante el temporizador de un turno
(constitution.md, principio 5). A diferencia de Trivia, la partida se abastece de una
sola vez (no turno a turno) y el resultado se acumula por sala mientras la sala exista,
para poder evitar repetir palabras entre partidas sucesivas del mismo juego en la misma
sala.

- **Given** una cantidad válida y una lista de palabras a excluir, **when** se piden
  palabras, **then** se devuelven `cantidad` palabras distintas entre sí y ninguna
  coincide con la lista de exclusión.
- **Given** la IA falla, tarda más que el timeout, rechaza el pedido o devuelve
  contenido inválido (menos palabras de las pedidas, palabras repetidas entre sí, o que
  coinciden con la exclusión), **when** se piden palabras, **then** se completan con el
  banco de respaldo hasta la cantidad pedida, sin error hacia quien llama.
- **Given** no hay credencial de IA configurada, **when** se piden palabras, **then**
  se usa el banco de respaldo directamente, sin intentar llamar a la IA.
- **Given** una cantidad inválida (menor a 1 o no entera), **when** se piden palabras,
  **then** se recibe un error y no se llama a la IA.
- **Given** el banco de respaldo tampoco tiene suficientes palabras nuevas para cubrir
  la exclusión pedida, **when** se piden palabras, **then** se devuelven las que se
  puedan conseguir sin repetir, aunque sean menos que la cantidad pedida (caso límite
  aceptado: una sesión familiar real no agota un banco de ~150 palabras).

## Contenido — La Rocola (canciones)

`RocolaContentService.selectSongs(cantidad, excluir)` elige las canciones de "La
Rocola" (ver "Minijuegos" → "8. La Rocola") antes de arrancar la partida completa (las
10 canciones de una vez, no ronda a ronda), nunca durante un temporizador
(constitution.md, principio 5). A diferencia de Trivia/Caras y Gestos/Adivina la
palabra, acá no hay generación por IA: el contenido es un banco curado a mano de
canciones en español (cumbia, merengue, salsa, balada, ranchera, pop, rock, popular —
clásicas y actuales, ver punto 16 de "La Rocola") más una API pública gratuita para
obtener el preview de audio y la portada de cada canción.

- **Given** una cantidad válida y una lista de canciones a excluir (ya sonadas antes en
  la misma sala), **when** se piden canciones, **then** se devuelven `cantidad`
  canciones distintas entre sí, ninguna coincide con la exclusión, cada una con su
  preview de audio y portada listos para reproducirse, y como máximo 2 canciones del
  mismo género entre las devueltas (mientras el banco lo permita).
- **Given** el servicio de previews (API externa) falla, tarda más que el timeout o no
  devuelve preview para alguna canción elegida, **when** se piden canciones, **then**
  esa canción se descarta y se completa con otra del banco que si tenga preview
  disponible, sin error hacia quien llama.
- **Given** el servicio de previews falla por completo (ej. sin red), **when** se piden
  canciones, **then** se completan con un sub-banco de respaldo más chico cuyo preview y
  portada ya quedaron guardados de antemano (no depende de la API en ese momento).
- **Given** una cantidad inválida (menor a 1 o no entera), **when** se piden canciones,
  **then** se recibe un error y no se llama a ningún servicio externo.
- **Given** el banco no tiene suficientes canciones nuevas para cubrir la exclusión
  pedida, **when** se piden canciones, **then** se reinicia la exclusión de esa sala
  para este juego (se permite repetir canciones de partidas muy anteriores) en vez de
  bloquear la partida — caso límite aceptado, una sesión familiar real no agota un
  banco de ~150-200 canciones en una sola reunión.

### Filtro opcional por género o artista (elegido por el host)

Antes de arrancar la partida, el host puede angostar de qué canciones se juega —
**por género o por artista, nunca ambos a la vez** — o dejarlo sin filtro (igual que
hoy, aleatorio entre todo el banco). El filtro se aplica **dentro** del banco en
español ya existente — nunca se relaja esa regla, con o sin filtro.

- **Given** el host no elige ningún filtro, **when** arranca la partida, **then** el
  comportamiento es el mismo que hoy: 10 canciones al azar de todo el banco, con el
  tope de variedad de 2 por género.
- **Given** el host elige un género, **when** se piden las canciones, **then** las 10
  son de ese género exclusivamente — el tope de "máximo 2 por género" no aplica en este
  caso (no tendría sentido: pediría contradecir el propio filtro).
- **Given** el host elige un artista (de una lista con los artistas que existen en el
  banco, no texto libre), **when** se piden las canciones, **then** las 10 son de ese
  artista exclusivamente, sin tope de variedad por género.
- **Given** el género o artista elegido no tiene al menos 10 canciones distintas en el
  banco, **when** el host intenta arrancar la partida, **then** no arranca — se le
  informa cuántas canciones hay disponibles para ese filtro y puede elegir otro filtro
  o dejarlo sin filtro. Esta validación ocurre apenas se intenta arrancar, antes de
  pedirle a nadie que presione "Listo".
- **Given** un filtro activo, **when** el servicio de previews en vivo falla y hace
  falta completar desde el banco de respaldo, **then** las canciones de respaldo
  también respetan el filtro elegido.

## Contenido — Memoriza los objetos

`MemorizaObjetosContentService.selectObjects(cantidad, excluir)` arma el tablero de la
partida (ver "Minijuegos" → "10. Memoriza los objetos en la imagen") antes de que
arranque cualquier temporizador, nunca en caliente (`constitution.md`, principio 5).
Mismo criterio que `RocolaContentService.selectSongs`: es un banco curado a mano
(objetos cotidianos, en español, con su imagen ya resuelta), no generación por modelo
de lenguaje ni de imágenes — por eso vive en su propio módulo de contenido,
`MemorizaObjetosContentModule`, no dentro de `AiContentModule`.

- **Given** una cantidad válida y una lista de objetos a excluir, **when** se piden
  objetos, **then** se devuelven `cantidad` objetos distintos entre sí, ninguno
  coincide con la lista de exclusión, y cada uno trae su palabra y la URL de su imagen.
- **Given** una cantidad inválida (menor a 1 o no entera), **when** se piden objetos,
  **then** se recibe un error, sin tocar el banco.
- **Given** el banco no tiene suficientes objetos nuevos para cubrir la exclusión
  pedida, **when** se piden objetos, **then** se completa reutilizando objetos ya
  usados en esa sala en vez de arrancar la partida con menos objetos de los que hacen
  falta (caso límite aceptado: una sesión familiar real no agota un banco de ~150
  objetos).

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

Dos equipos o más (de 1 o más integrantes cada uno) compiten por adivinar la canción
que suena, con buzzer libre: cualquier jugador de cualquier equipo puede presionar
"¡Me la sé!" en cuanto arranca la canción, y tiene 30 segundos para escribir el
nombre de la canción en su celular. La respuesta se juzga automáticamente por
similitud de texto (tolera errores de tipeo, tildes faltantes y alguna palabra de
más/menos — nunca por IA, para no depender de una llamada en caliente durante la
ronda), no por el grupo. Se juegan 10 canciones por partida, en español y variadas
(cumbia, merengue, salsa, baladas, rancheras, pop, rock, popular — desde clásicos
hasta actuales, para que participe toda la familia).

- **Given** el juego recién elegido desde el panel de selección, **when** la pantalla lo
  muestra, **then** el host puede elegir de qué se juega antes de que arranque nada:
  sin filtro (aleatorio, como siempre), por género, o por artista — ver "Contenido —
  La Rocola" → "Filtro opcional por género o artista". Esta elección es anterior a la
  convención de instrucciones + "Listo" de todos: los celulares de los jugadores no
  participan de esta pantalla, solo esperan.
- **Given** el filtro elegido (o ninguno) y la partida arrancada, **when** eso ocurre,
  **then** sigue la convención de instrucciones + "Listo" de todos, y luego **when**
  arranca la primera ronda, **then** la pantalla muestra un conteo descendente de 5
  segundos, con un sonido de reloj en cada segundo que pasa (reutilizando uno existente
  si ya hay un sonido de cuenta regresiva).
- **Given** el conteo llega a cero, **when** eso ocurre, **then** la pantalla muestra
  un texto grande con un ícono o emoji de música y el texto "Adivina la canción", y en
  ese mismo instante empieza a sonar la canción de la ronda (reproducida desde el
  dispositivo del host, nunca desde los celulares) y se habilita el botón de los
  jugadores.
- **Given** la canción sonando, **when** cualquier jugador de cualquier equipo mira su
  celular, **then** ve un único botón redondo verde con el texto "¡Me la sé!",
  deshabilitado hasta el instante en que arranca la canción.
- **Given** el botón habilitado y la canción sonando, **when** un jugador lo presiona,
  **then** el botón de todos los demás jugadores queda deshabilitado de inmediato, la
  canción se pausa, y a ese jugador le aparece un campo de texto con 30 segundos para
  escribir el nombre de la canción.
- **Given** el campo de texto visible, **when** el jugador escribe su respuesta y la
  envía (o se acaban los 30 segundos, lo que pase primero), **then** el texto se
  compara contra el título real de la canción tolerando errores de tipeo, tildes
  faltantes y alguna palabra de más o de menos — sin exigir coincidencia exacta, pero
  sin aceptar una respuesta sin relación real con el título.
- **Given** el jugador no llega a enviar la respuesta antes de que se acaben los 30
  segundos, **when** eso ocurre, **then** se juzga lo que haya escrito hasta ese
  momento (aunque esté incompleto), igual que si lo hubiera enviado.
- **Given** la respuesta escrita coincide (según el criterio de tolerancia) con el
  título, **when** eso ocurre, **then** se otorga 1 punto a su equipo y la ronda
  termina.
- **Given** la respuesta escrita no coincide con el título, **when** eso ocurre,
  **then** el campo de texto desaparece de ese celular y la pantalla muestra "Robo de
  punto del equipo {nombre del equipo contrario}" (o, con más de dos equipos, los
  nombres de todos los equipos distintos al que falló) mientras la canción se reanuda
  desde donde se pausó.
- **Given** la fase de robo de punto, **when** dura hasta 5 segundos, **then** el botón
  "¡Me la sé!" vuelve a habilitarse, mostrado solo a los jugadores de los equipos con
  chance de robar.
- **Given** alguien presiona el botón durante el robo antes de que termine el tiempo,
  **when** eso ocurre, **then** se repite la misma dinámica: canción se pausa, campo de
  texto con 30 segundos solo para ese jugador, juicio automático de la respuesta.
- **Given** el robo también termina en una respuesta que no coincide, **when** eso
  ocurre, **then** la ronda termina sin puntos para nadie y se pasa a la revelación.
- **Given** nadie presiona el botón durante toda la canción, o nadie presiona durante
  los 5 segundos de robo, **when** eso ocurre, **then** la ronda termina sin puntos
  para nadie y se pasa a la revelación (mismo resultado que un robo fallido).
- **Given** una ronda recién resuelta (con o sin punto otorgado), **when** termina,
  **then** la pantalla revela el título, el artista y la portada de la canción durante
  unos segundos antes de pasar a la siguiente ronda.
- **Given** las 10 canciones de la partida ya jugadas, **when** eso ocurre, **then** la
  partida pasa a resultados con el puntaje **obtenido en esa partida** por cada equipo,
  siguiendo la convención general de pantalla de juego (marcador, ganador o empate).
- **Given** una sala donde ya se jugó al menos una partida de "La Rocola", **when** se
  vuelve a elegir este juego en la misma sala, **then** no se repiten canciones ya
  sonadas en partidas anteriores de esa sala, salvo que se agote el banco disponible
  (caso límite aceptado, ver "Contenido — La Rocola").

### 9. Cadena de palabras contrarreloj
Se da una categoría; cada equipo dice una palabra relacionada y presiona un botón, lo que arranca la cuenta regresiva del equipo contrario.

- **Given** una categoría activa y el equipo A en posesión del turno con su temporizador corriendo, **when** alguien del equipo A dice una palabra válida (no repetida) y presiona el botón, **then** el temporizador del equipo A se detiene y arranca el del equipo B.
- **Given** el temporizador de un equipo llega a cero, **when** eso ocurre, **then** ese equipo pierde la ronda y el equipo contrario gana los puntos.
- **Given** una palabra ya dicha en la ronda, **when** algún jugador repite esa misma palabra, **then** no se acepta como válida y el temporizador de su equipo sigue corriendo.

### 10. Memoriza los objetos en la imagen

Se muestran 20 objetos (imagen + palabra) durante 30 segundos para que ambos equipos
los memoricen; al ocultarse, cada equipo compite por escribir esos objetos a partir de
una pista de una sola letra, con su propio reloj de 1:30 minutos que corre en formato
"reloj de ajedrez" — un equipo a la vez. `GameId = 'memoriza-objetos'`.

**Fuente de las imágenes**: banco curado a mano (igual criterio que las canciones de
"La Rocola" — ver "Contenido — Memoriza los objetos" más abajo), no generación de
imágenes por IA en caliente. Cada objeto del tablero es su propio ícono/imagen
individual dentro de una grilla armada por el frontend — no una única imagen-escena
con los 20 objetos dibujados juntos.

**Mejora futura (fuera de alcance de esta iteración)**: en vez de una grilla de íconos
sueltos, mostrar una sola imagen de una escena (ej. una playa, un taller mecánico, un
circo) con los objetos incrustados naturalmente en ella, más difícil de memorizar. Se
deja anotado como posible evolución del juego, no se diseña ni se implementa ahora.

- **Given** el host elige "Memoriza los objetos" en el panel de selección de juego,
  **when** eso ocurre, **then** el sistema arma de inmediato el tablero completo de la
  partida (20 objetos, cada uno con su imagen, su palabra y qué letra de esa palabra va
  a quedar visible) y lo entrega a la pantalla y a los celulares, para que la pantalla
  pueda empezar a precargar las 20 imágenes mientras se muestran las instrucciones —
  todavía sin arrancar ninguna cuenta regresiva ni mostrar la grilla.
- **Given** el tablero recién armado, **when** todos los jugadores con equipo asignado
  presionan "Listo" (convención de toda pantalla de juego), **then** arranca la
  secuencia del juego automáticamente, empezando por "Pon Mucha Atención".
- **Given** la fase "Pon Mucha Atención", **when** arranca, **then** la pantalla
  compartida muestra un texto animado con ese mensaje, reproduce un sonido, y corre una
  cuenta regresiva de 5 segundos; ningún celular muestra nada del tablero todavía.
- **Given** la cuenta regresiva de "Pon Mucha Atención" llega a cero, **when** eso
  ocurre, **then** la pantalla compartida muestra las 20 imágenes (sin ninguna palabra
  visible, solo el ícono/dibujo de cada objeto, con un tamaño legible para los 20 a la
  vez) junto con una cuenta regresiva de 30 segundos que no se superpone a ninguna
  imagen, animadas en 5 tramos consecutivos dentro de esos 30 segundos para hacer más
  entretenida (y más difícil) la memorización:
  - **Segundos 0 a 9** (10s): ordenadas en filas y columnas, sin líneas ni bordes de
    celda visibles (parecen un conjunto prolijo de imágenes, no una tabla).
  - **Segundos 10 a 14** (5s): todas cambian de posición entre sí una sola vez (barajado),
    manteniéndose ordenadas en filas y columnas.
  - **Segundos 15 a 19** (5s): se esparcen libremente por toda la pantalla, sin
    ajustarse a ninguna grilla ni forma fija, sin salirse nunca del área visible.
  - **Segundos 20 a 24** (5s): se mueven en círculo, tipo serpiente (manteniendo la
    misma distancia relativa entre sí mientras se desplazan juntas), a velocidad
    media — ni muy rápida ni muy lenta.
  - **Segundos 25 a 29** (5s): se desvanecen (fundido a transparente) hasta
    desaparecer justo cuando la cuenta regresiva llega a cero.
  - Es un efecto puramente visual de la pantalla compartida (host) — no afecta el
    temporizador del servidor ni necesita sincronizarse entre distintos clientes
    conectados a la misma sala.
- **Given** la cuenta regresiva de memorización llega a cero, **when** eso ocurre,
  **then** las imágenes se ocultan y la pantalla compartida muestra la grilla de las 20
  palabras como pistas de una sola letra cada una (esa letra puede ser la primera, una
  del medio o la última de la palabra, elegida al azar por palabra y fija el resto de
  la partida — ej. "M _ _ _ _ _ _" para "Manzana", con la cantidad de letras de esa
  palabra indicada junto al patrón), y arrancan los relojes de ambos equipos en 1:30
  minutos (90 segundos) cada uno.
- **Given** la fase de adivinanza recién arrancada, **when** eso ocurre, **then** el
  sistema elige al azar qué equipo tiene el primer turno (mismo criterio que Trivia,
  Caras y Gestos y Adivina la palabra) y qué integrante de ese equipo participa,
  repartiendo los turnos siguientes entre los integrantes de cada equipo de forma
  cíclica (no hay un número fijo de turnos por partida, a diferencia del resto de los
  minijuegos, porque acá lo corta el reloj de cada equipo o que se adivinen las 20
  palabras).
- **Given** la grilla de pistas, **when** un objeto todavía no fue adivinado, **then**
  su imagen no se muestra — solo la pista de una letra — dejando el espacio reservado
  para que la grilla no salte de tamaño cuando esa palabra se revele.
- **Given** el jugador en turno, **when** le toca jugar, **then** su celular muestra un
  campo de texto y un botón "Enviar" (deshabilitado con el campo vacío), y el reloj de
  su equipo empieza a descender; el resto de los celulares y la pantalla ven quién
  tiene el turno pero no pueden interactuar con el tablero.
- **Given** el turno de un jugador recién empezado, **when** pasan 10 segundos sin que
  haya enviado nada, **then** en su celular se habilita además un botón "Pasar" (hasta
  ese momento permanece deshabilitado).
- **Given** el jugador en turno, **when** envía una palabra que coincide (tolerando
  errores de tipeo, sin necesidad de escribirla exacta) con alguna palabra todavía no
  revelada del tablero, **then** esa palabra se revela completa en la grilla con el
  color de su equipo, se otorga 1 punto a su equipo, el reloj de su equipo se detiene y
  el turno pasa a un integrante del equipo contrario (si ese equipo todavía tiene
  tiempo en su reloj) o al siguiente integrante de su propio equipo (si el equipo
  contrario ya se quedó sin tiempo).
- **Given** el jugador en turno, **when** envía una palabra que no coincide con
  ninguna palabra pendiente del tablero, **then** no se revela nada ni se otorgan
  puntos, el reloj de su equipo se detiene igual que si hubiera acertado, y el turno
  pasa de la misma forma que en el caso anterior — un solo intento por turno, sin
  poder reintentar aunque su equipo todavía tenga tiempo.
- **Given** el jugador en turno con el botón "Pasar" ya habilitado, **when** lo
  presiona sin haber enviado ninguna palabra, **then** no se revela nada ni se otorgan
  puntos, y el turno pasa de la misma forma que tras un envío.
- **Given** el reloj de un equipo llega a cero mientras uno de sus integrantes tiene el
  turno activo, **when** eso ocurre, **then** ese turno termina de inmediato (como si
  hubiera pasado sin escribir nada) y el turno pasa al equipo contrario si ese equipo
  todavía tiene tiempo.
- **Given** el reloj de un equipo ya en cero y el equipo contrario con tiempo restante,
  **when** eso ocurre, **then** el equipo con tiempo sigue jugando turno tras turno
  entre sus propios integrantes sin que el reloj del equipo contrario vuelva a
  intervenir, hasta que su propio reloj llegue a cero o se adivinen todas las palabras
  pendientes.
- **Given** la partida en curso, **when** los relojes de ambos equipos llegan a cero, o
  cuando se revela la última palabra pendiente del tablero (lo que ocurra primero),
  **then** la partida termina de inmediato.
- **Given** la partida recién terminada, **when** eso ocurre, **then** la pantalla
  muestra el resultado final con el puntaje **obtenido en esa partida** por cada
  equipo (no el acumulado entre partidas), el equipo ganador (o "Empate" si ambos
  quedaron igual) con un sonido de victoria, y a los 10 segundos la sala vuelve sola al
  panel de selección de juego — misma convención que Adivina la palabra. Junto con el
  resultado, se revela también la imagen y la palabra de cualquier objeto que ningún
  equipo llegó a adivinar (sin el color de ningún equipo, para diferenciarlo de los que
  sí se acertaron), para que ambos equipos vean cuáles eran.
- **Given** una sala donde ya se jugó al menos una partida de "Memoriza los objetos",
  **when** se vuelve a elegir este juego en la misma sala, **then** no se repiten
  objetos ya usados en partidas anteriores de esa sala, salvo que se agote el banco
  disponible (caso límite aceptado, ver "Contenido — Memoriza los objetos").

### 11. Adivina la palabra

Un integrante del equipo (el "Adivinador") debe adivinar la mayor cantidad de palabras
posible en 30 segundos, mientras el resto de su equipo le da pistas verbales sin decir
la palabra — leyéndola en la pantalla compartida, que el Adivinador no puede ver (le da
la espalda). Usa el reparto de turnos compartido ("Reparto de turnos entre jugadores de
un equipo", en "Motor de sala") con 3 rondas por defecto, alternando entre equipos.

- **Given** la partida recién elegida desde el panel de selección de juego, **when**
  arranca, **then** el sistema arma el orden completo de turnos (equipo + integrante)
  para toda la partida y la pantalla muestra de entrada el primer equipo/integrante en
  turno, sin arrancar el temporizador todavía.
- **Given** el Adivinador en turno, **when** presiona "Listo" en su celular, **then**
  arranca el temporizador de 30 segundos de ese turno, la pantalla muestra la primera
  palabra y el celular del Adivinador muestra únicamente los botones "Adivinada" y
  "Paso" (nunca la palabra).
- **Given** un turno en curso, **when** el Adivinador presiona "Adivinada", **then**
  esa palabra suma 1 punto al equipo, suena el sonido de éxito (reutilizado de Trivia),
  y la pantalla muestra la siguiente palabra disponible sin pausa.
- **Given** un turno en curso, **when** el Adivinador presiona "Paso", **then** esa
  palabra se descarta sin sumar puntos, suena el sonido de fallo (reutilizado de
  Trivia), y la pantalla muestra la siguiente palabra disponible sin pausa.
- **Given** un turno en curso, **when** el Adivinador ya pasó 3 palabras, **then** el
  botón "Paso" se deshabilita en su celular y solo puede seguir presionando "Adivinada"
  con la palabra actual hasta que se acabe el tiempo.
- **Given** un turno en curso, **when** otro jugador de la sala (compañero o del equipo
  contrario) mira su propio celular, **then** ve únicamente el equipo en turno, el
  nombre del Adivinador y el marcador — nunca la palabra actual.
- **Given** el temporizador de un turno llega a cero, **when** eso ocurre, **then** la
  pantalla muestra las palabras adivinadas en verde y las pasadas en rojo (incluida la
  palabra que haya quedado mostrada sin resolver en ese momento, que se cuenta como
  pasada), se suman los puntos del turno al marcador de ese equipo (parcial de esta
  partida), y se muestra "Siguiente Jugador {Nombre}"; el celular de ese siguiente
  jugador pasa a mostrar su propio botón "Listo".
- **Given** la pantalla mostrando el resumen de un turno terminado, **when** el
  siguiente Adivinador todavía no presiona "Listo", **then** la pantalla permanece así
  indefinidamente (no hay avance automático) hasta que lo presione.
- **Given** todos los turnos repartidos de la partida ya jugados, **when** eso ocurre,
  **then** la partida pasa a resultados con el puntaje **obtenido en esa partida** por
  cada equipo (no el acumulado entre partidas) y las palabras adivinadas por cada
  equipo, más un sonido distinto para el/los equipo(s) ganador(es).
- **Given** resultados mostrados, **when** pasan 10 segundos, **then** la sala vuelve
  sola al panel de selección de juego, igual que Trivia.
- **Given** una sala donde ya se jugó al menos una partida de "Adivina la palabra",
  **when** se vuelve a elegir este juego en la misma sala, **then** no se repiten
  palabras ya usadas en partidas anteriores de esa sala, salvo que se agote el banco
  disponible (caso límite aceptado).

## Fuera de alcance (ver constitution.md)

Registro de jugador, app nativa, monetización, historial persistente — no se especifican criterios de aceptación para esto en v1.
