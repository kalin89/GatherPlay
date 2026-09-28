# `MemorizaObjetosContentService.selectObjects(cantidad, excluir)` — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). `MemorizaObjetosModule` (la tarea siguiente) depende
de esto para tener el tablero completo de la partida (20 objetos) listo **antes** de
arrancar cualquier temporizador — nunca durante uno (`constitution.md`, principio 5).

**100% backend, sin ningún endpoint ni evento WS nuevo.** `MemorizaObjetosService` va a
consumir `MemorizaObjetosContentService` directamente como provider de Nest, mismo
criterio que `LaRocolaService` con `RocolaContentService.selectSongs` (ver
`specs/features/rocola-content/analysis.md`). Por la excepción de
`testing-strategy.md` ("puro backend, sin UI conectada todavía"), no tiene checklist
manual.

## Por qué NO es `AiContentModule`

Igual razonamiento que `rocola-content`: acá no hay generación por modelo de lenguaje
ni por modelo de imágenes — el contenido es un banco curado a mano (pares
palabra/imagen, objetos cotidianos en español) resuelto una sola vez, no en runtime.
Decisión confirmada con Kalin en la conversación de diseño: se evaluó generar la(s)
imagen(es) con IA en caliente y se descartó — los modelos de generación de imágenes no
son confiables dibujando muchos objetos reconocibles y separables a la vez, y además
introduciría una dependencia nueva sin garantía de que la palabra declarada coincida
con lo que el modelo realmente dibujó. Por eso vive en su propio módulo,
`MemorizaObjetosContentModule` (`apps/backend/src/memoriza-objetos-content/`), no
dentro de `AiContentModule` — mismo principio de independencia de módulos que
`constitution.md` pide para cada minijuego, aplicado acá a "contenido".

## Decisión: banco curado, imágenes ya resueltas (sin proveedor externo en runtime)

A diferencia de `rocola-content` (que sí necesita un `SongPreviewProvider` porque la
URL de preview de audio puede rotar con el tiempo), acá cada entrada del banco ya trae
su `imagenUrl` final y estable — no hace falta resolver nada en caliente, ni siquiera
una llamada HTTP de "refresco". Esto simplifica el diseño: no hay abstracción de
proveedor, no hay banco de respaldo separado, no hay `Module` con providers
condicionales — es una lista estática y una función de selección al azar con
exclusión, igual de simple que `word-fallback-bank.ts` pero como fuente **primaria**,
no de respaldo.

- **Origen sugerido de las imágenes** (decisión de contenido, no de diseño — se resuelve
  en la sesión de implementación): un set de íconos gratuito y consistente visualmente
  (ej. Openmoji, servido por CDN estático tipo jsdelivr) en vez de fotos sueltas de
  distintas fuentes — para que los 20 objetos de una misma partida se vean parejos en
  estilo y tamaño. Cualquier fuente sirve siempre que la URL sea estable (no rote con
  el tiempo) y no requiera API key para mostrarse en el `<img>` del cliente.
- **`imagenUrl` se sirve directo al cliente** (pantalla), no se descarga ni se cachea
  en el backend — el backend solo conoce la URL, la precarga real la hace el
  navegador de la pantalla (ver `specs/features/memoriza-objetos-ui/analysis.md`).

## Criterios de aceptación

Ver `spec.md` → "Contenido — Memoriza los objetos".

## Diseño

Carpeta nueva `apps/backend/src/memoriza-objetos-content/`.

### `memoriza-objetos-content.types.ts`

```ts
export interface MemorizaObjetosBankEntry {
  id: string; // slug estable, ej. "fruta-manzana"
  palabra: string; // sustantivo común, sin ambigüedad, en español
  imagenUrl: string;
}

export const OBJECTS_PER_MATCH = 20;
export const MAX_OBJECTS_PER_REQUEST = 60; // margen sobre OBJECTS_PER_MATCH, mismo
// criterio de tope defensivo que MAX_WORDS_PER_REQUEST en ai-content-adivina-palabra
```

Sin categorías (igual que `adivina-palabra`) — sustantivos comunes, cortos, sin
ambigüedad, aptos para representarse con un ícono reconocible a simple vista (esto
último es más estricto que el criterio de palabras de Adivina la palabra, porque acá
la palabra tiene que poder dibujarse como un objeto concreto — nada de verbos,
sentimientos ni conceptos abstractos).

### `object-bank.ts`

Lista estática de **120 a 150 `MemorizaObjetosBankEntry`**, escrita a mano por
Kalin/la sesión de implementación (no es una decisión de diseño, es contenido) —
objetos cotidianos variados (frutas, ropa, muebles, animales, vehículos, instrumentos,
etc.) para que 20 partidas seguidas en la misma sala tarden en repetirse. Cada entrada
con su `id` único y su `imagenUrl` ya resuelta.

### `memoriza-objetos-content.service.ts`

```ts
export class InvalidObjectCountError extends Error {}
```

`selectObjects(cantidad: number, excluir: string[] = []): MemorizaObjetosBankEntry[]`:

1. Valida `cantidad` — entero entre 1 y `MAX_OBJECTS_PER_REQUEST`, sin tocar el banco
   si falla (`InvalidObjectCountError`).
2. Filtra `object-bank.ts` descartando los `id` presentes en `excluir`; si el resultado
   tiene menos de `cantidad` entradas, se vuelve a filtrar **sin** `excluir` (se acepta
   repetir objetos ya usados en la sala antes que arrancar la partida con menos de los
   `cantidad` pedidos) — mismo criterio que `RocolaContentService.pickCandidates` ante
   banco agotado.
3. Baraja el resultado (`random` inyectado en el constructor, `Math.random` por
   defecto, mismo criterio que el resto del proyecto para pruebas deterministas) y
   devuelve los primeros `cantidad`.

Sin llamada de red, sin `async` — a diferencia de `RocolaContentService.selectSongs`
(que sí es `Promise` por el `lookup` a iTunes), acá el método es síncrono.

### `memoriza-objetos-content.module.ts`

Provee `MemorizaObjetosContentService`. Se agrega a `AppModule`. Sin dependencias
nuevas.

## Pruebas

- **`memoriza-objetos-content.service.spec.ts`** (instanciación directa, `random`
  inyectado): cantidad válida sin exclusión devuelve esa cantidad, todas distintas
  entre sí; cantidad válida con exclusión no repite ningún `id` excluido; cantidad
  inválida (0, negativa, no entera, o mayor a `MAX_OBJECTS_PER_REQUEST`) → error sin
  tocar el banco; banco sin suficientes objetos nuevos tras `excluir` → se completa
  reutilizando objetos ya usados en vez de devolver menos de los pedidos.
- **`object-bank.spec.ts`**: ≥120 entradas, todas con `id` único, `palabra` no vacía y
  `imagenUrl` no vacía.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción
explícita de `testing-strategy.md`). `MemorizaObjetosModule` es quien la conecta a un
juego real.
