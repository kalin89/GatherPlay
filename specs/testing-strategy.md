# Estrategia de pruebas — Family Game App

Aplica la pirámide de pruebas acordada: muchas unitarias, algunas de integración, pocas e2e. Cada criterio Given/When/Then de spec.md debe trazar a al menos una prueba (unitaria o e2e, según corresponda).

## Unitarias (Jest) — la base

Cubren toda la lógica de juego pura, sin red ni WebSocket real:
- `GameEngineCore`: transición de fases, manejo de temporizador, cálculo de puntaje.
- Cada módulo de minijuego: reglas específicas (ej. Impostor — reparto de roles, condición de victoria; Cadena de palabras — validación de palabra repetida, cambio de temporizador entre equipos).
- Se escriben primero contra los criterios Given/When/Then de spec.md — cada "Given/When/Then" es candidato directo a un `it(...)`.

## Integración

Backend levantado contra una base de datos de prueba real (o contenedor efímero):
- `AiContentModule` devolviendo contenido válido y con manejo de error si la IA falla o tarda (no debe tumbar una ronda).
- Persistencia de `content_banks` en Postgres.

No se prueban por integración las partes que solo viven en memoria de una sala activa — esas se cubren con unitarias + e2e.

## E2E (Playwright) — solo flujos críticos

Un navegador real abre `/screen/[roomCode]` y `/play/[roomCode]` en paralelo (dos contextos), simulando host + jugador(es), haciendo clic y verificando lo que aparece en pantalla. Cobertura mínima por minijuego (no exhaustiva):

1. Camino feliz: crear sala → unirse con código → armar equipos → jugar una ronda completa → ver resultado.
2. Un caso límite relevante por juego (ej. Tararea y Adivina: decir el nombre en voz alta invalida la ronda; Rosco: "paso" reinserta la letra; Cadena de palabras: palabra repetida no se acepta).

Se escribe un archivo e2e por minijuego, no uno gigante — así una prueba frágil no bloquea a las demás.

## Qué NO se prueba en v1

- Carga/concurrencia con muchas salas simultáneas (fuera de alcance mientras el escalamiento a Redis no exista — ver plan.md).
- Compatibilidad exhaustiva entre navegadores/dispositivos — se prueba manualmente en la reunión real como parte de la validación del hobby project.

## CI

Todo lo anterior corre en cada push/PR. Una prueba e2e que empiece a fallar de forma intermitente (flaky) se marca y se revisa antes de silenciarla — no se borra sin entender por qué falla.
