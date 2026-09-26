# Plan técnico — GatherPlay

Traduce spec.md a arquitectura concreta, respetando constitution.md. Este documento se ajusta si algo cambia en el spec; el spec no se dobla para acomodar una decisión técnica.

## Arquitectura general

```
[Host: pantalla/TV]  <—WebSocket—>  [Backend NestJS]  <—WebSocket—>  [Celular jugador 1..n]
                                          |
                                    [Servicio de IA]  (preguntas, canciones, categorías)
                                          |
                                    [Postgres]  (solo lo persistente: bancos de contenido, cuentas de host futuras)
```

- Dos superficies de Next.js sobre la misma app: `/screen/[roomCode]` (vista pantalla/host) y `/play/[roomCode]` (vista jugador/celular). Ambas se conectan al mismo namespace de Socket.io de la sala.
- El backend NestJS es la única fuente de verdad del estado de una partida mientras dura; el frontend nunca calcula reglas de juego, solo refleja el estado que recibe por WebSocket.

## Backend (NestJS)

- **RoomModule**: crea/destruye salas, genera código de 4-6 caracteres, arma equipos, mantiene el estado de sala en memoria (un `Map<roomCode, RoomState>` por instancia — ver "Escalamiento" abajo).
- **GameEngineCore**: maneja lo común a todos los minijuegos — turnos, temporizadores, puntaje, transición de fases (`lobby` → `jugando` → `resultados`).
- **Módulo por minijuego** (`MimicaModule`, `TrivializedModule`, `RocolaModule`, etc.): cada uno implementa una interfaz común (`startRound`, `handlePlayerAction`, `resolveRound`) y se registra en el `GameEngineCore` como un plugin. Nada de un módulo depende de otro — es la regla de constitution.md.
- **AiContentModule**: expone métodos como `getTriviaQuestions(categoria)`, `getWordChainCategory()`. Se llama **antes** de iniciar una ronda (para tener el contenido listo), nunca durante el conteo del temporizador — así una llamada lenta a IA nunca bloquea el juego en vivo.
- **Contenido de "La Rocola" (no es IA)**: `RocolaContentModule` resuelve las canciones desde un banco curado a mano + la API pública de iTunes (preview de audio + portada) — no hay generación por modelo de lenguaje para este juego. Mismo principio igual aplica: se resuelve antes de arrancar la partida, nunca durante un temporizador. Ver `specs/features/rocola-content/analysis.md`.
- **WebSocket Gateway**: eventos tipados por dirección.
  - Cliente → servidor: `join_room`, `create_room`, `assign_team`, `select_game`, `player_action` (payload varía por juego: respuesta de trivia, trazo de dibujo, botón de buzzer, etc.).
  - Servidor → cliente: `room_state`, `round_started`, `round_update` (tick de tiempo, progreso), `round_result`, `error`.

## Frontend (Next.js)

- `/screen/[roomCode]`: solo lectura del estado de sala vía WebSocket + QR de invitación. Renderiza el minijuego activo (componente específico por juego, todos implementando una interfaz común `GameScreenProps`).
- `/play/[roomCode]`: formulario de nombre al entrar, luego controles específicos del juego activo (`GameControlsProps`), un componente por minijuego, montado dinámicamente según `room_state.currentGame`.
- Sin estado global complejo: cada vista se sincroniza reactivamente con los eventos del WebSocket (el servidor manda el estado completo relevante, el cliente no reconstruye lógica).

## Modelo de datos

**En memoria (vive con la sala, no en Postgres):**
```
RoomState {
  code: string
  status: 'lobby' | 'jugando' | 'resultados'
  teams: Team[]
  players: Player[]
  currentGame: GameId | null
  round: RoundState | null
}
```

**Postgres (solo lo persistente, fuera de v1 salvo que se necesite antes):**
- `content_banks` (preguntas de trivia, canciones, categorías — puede poblarse por IA o a mano desde el inicio, aunque no haya cuentas de host todavía).
- `host_accounts` — se agrega cuando conteste constitution.md "fuera de alcance".

## Escalamiento (nota, no bloqueante para v1)

Con un solo proceso backend basta para uso familiar/reuniones (decenas de salas simultáneas como máximo). Si algún día se necesita más de una instancia, el estado de sala en memoria tendría que moverse a Redis — no se construye esa capa ahora, se documenta aquí para no olvidarla.

## Convenciones de código

Siguiendo tus patrones habituales: Clean Architecture en el backend (separar dominio del juego de la infraestructura de WebSocket/Socket.io), JWT reservado para cuando exista auth de host, middlewares de NestJS para validar payloads de eventos antes de que lleguen a la lógica de juego.

Principios SOLID como base de todo el código, backend y frontend, no solo como buena intención:

- **S**: cada módulo de minijuego resuelve un solo juego; `GameEngineCore` resuelve turnos/tiempo/puntaje, nada más — no se mezclan responsabilidades entre ellos.
- **O**: agregar un minijuego nuevo no debe requerir tocar `GameEngineCore` ni los módulos de otros juegos, solo registrar el nuevo módulo.
- **L**: cualquier módulo de minijuego debe poder sustituir a otro donde se espera la interfaz común (`startRound`, `handlePlayerAction`, `resolveRound`) sin romper al `GameEngineCore`.
- **I**: interfaces chicas y específicas (ej. no forzar a un minijuego sin buzzer a implementar métodos de buzzer que no usa).
- **D**: los módulos de minijuego dependen de abstracciones (`AiContentModule`, el contrato del Gateway), nunca de implementaciones concretas de Socket.io o del cliente de IA — así se pueden probar unitariamente sin levantar red real.

### Secretos y variables de entorno

Ningún secreto (contraseña, usuario de base de datos, API key, token) se escribe hardcodeado en un archivo versionado — ni en código, ni en `docker-compose.yml`, ni en configuración. Siempre se expone como variable de entorno:

- Cada paquete/servicio que necesita secretos (raíz para `docker-compose.yml`, `apps/backend` para el backend) tiene su propio `.env` (ignorado por git) y un `.env.example` versionado con valores de ejemplo no sensibles, documentando qué variables existen.
- `docker-compose.yml` y el código solo leen `process.env.X` / `${X}` — nunca un valor literal de secreto.
- Antes de commitear, se revisa que ningún archivo agregado tenga un secreto real pegado directamente (ni siquiera "solo para desarrollo local" — el hábito es lo que se protege, no un valor puntual).
- Si un secreto se filtra igual (se commitea por error), se rota, no alcanza con borrarlo del archivo en un commit nuevo.
