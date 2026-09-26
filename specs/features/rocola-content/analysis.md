# `RocolaContentService.selectSongs(cantidad, excluir)` — Análisis técnico

Tarea de Fase 3 (ver `tasks.md`). `LaRocolaModule` (la tarea siguiente) depende de esto
para tener las 10 canciones de la partida listas **antes** de arrancar la primera
ronda — nunca durante un temporizador (`constitution.md`, principio 5).

**100% backend, sin ningún endpoint ni evento WS nuevo.** `LaRocolaService` va a
consumir `RocolaContentService` directamente como provider de Nest, mismo criterio que
`AdivinaPalabraService` con `AiContentService.getAdivinaPalabraWords`. Por la excepción
de `testing-strategy.md` ("puro backend, sin UI conectada todavía"), no tiene checklist
manual.

## Por qué NO es `AiContentModule`

A diferencia de Trivia/Caras y Gestos/Adivina la palabra, acá no hay generación por
modelo de lenguaje: el contenido es un banco curado a mano (canciones reales, en
español) y lo único que resuelve una API externa es el **preview de audio** y la
**portada** de cada canción — datos que no tiene sentido que una IA "invente". Por eso
vive en un módulo propio, `RocolaContentModule` (`apps/backend/src/rocola-content/`),
no dentro de `AiContentModule` — mismo principio de independencia de módulos que
`constitution.md` pide para cada minijuego, aplicado acá a "contenido", no a "juego".

## Decisión: banco curado + iTunes Search/Lookup API

- **Por qué iTunes y no Spotify/Deezer**: la Web API de Spotify quitó los preview de 30s
  para casi todo el catálogo en 2024; Deezer da preview pero las URLs son de vida corta
  y pensadas para reproducirse desde su propio dominio embebido. La API pública de
  iTunes (`itunes.apple.com/lookup`, `itunes.apple.com/search`) sigue devolviendo
  `previewUrl` (típicamente ~30s, AAC) y `artworkUrl100` de forma gratuita, sin API key
  ni cuota documentada para uso razonable — encaja con "de preferencia sin gastar
  tokens de IA" del requerimiento original.
- **Banco curado, no búsqueda en caliente**: el banco (`song-bank.ts`) tiene, por cada
  canción, su `itunesTrackId` ya resuelto de antemano — nunca se llama a `search` en
  producción. En runtime solo se llama `lookup?id=<ids separados por coma>&country=mx`
  una vez por partida (para refrescar `previewUrl`/`artworkUrl`, que pueden cambiar con
  el tiempo aunque el `trackId` no). Esto evita: (a) llamadas de red repetidas turno a
  turno, (b) falsos positivos de un `search` por texto libre, (c) depender de que la
  IA "elija" canciones — la curaduría real (variedad de género, épocas, aptas para
  familia) la hace Kalin al escribir el banco, no un modelo.
- **Resolución de `itunesTrackId` (una sola vez, fuera de runtime)**: script de
  desarrollo `apps/backend/scripts/resolve-rocola-track-ids.ts` (no se ejecuta en CI ni
  en producción, se corre a mano al armar/ampliar el banco). Toma una lista de
  `{ titulo, artista }` sin `itunesTrackId`, llama
  `search?term=<titulo> <artista>&country=mx&entity=song&limit=5`, elige el resultado
  cuyo `trackName`/`artistName` mejor matchea (comparación normalizada, sin acentos ni
  mayúsculas) y imprime por consola las entradas listas para pegar en `song-bank.ts`
  (`{ id, titulo, artista, genero, itunesTrackId }`). Los matches ambiguos se imprimen
  aparte para revisión manual — no se auto-aceptan.

## Criterios de aceptación

Ver `spec.md` → "Contenido — La Rocola (canciones)".

## Diseño

Carpeta nueva `apps/backend/src/rocola-content/`.

### `rocola-content.types.ts`

```ts
export type RocolaGenero =
  | 'cumbia'
  | 'merengue'
  | 'salsa'
  | 'balada'
  | 'ranchera'
  | 'pop'
  | 'rock'
  | 'popular';

// Entrada del banco curado — sin preview/portada todavía, se resuelven en runtime.
export interface RocolaBankEntry {
  id: string; // slug estable, ej. "cumbia-la-cumbia-del-rio"
  titulo: string;
  artista: string;
  genero: RocolaGenero;
  itunesTrackId: number;
}

// Entrada del banco de respaldo — preview/portada ya embebidos, sin llamada de red.
export interface RocolaFallbackEntry extends RocolaBankEntry {
  previewUrl: string;
  portadaUrl: string;
}

// Lo que consume LaRocolaService: una canción lista para sonar.
export interface RocolaSong {
  id: string;
  titulo: string;
  artista: string;
  genero: RocolaGenero;
  previewUrl: string;
  portadaUrl: string;
}

export const MAX_ROCOLA_SONGS_PER_REQUEST = 30;
export const MAX_SAME_GENERO_PER_MATCH = 2;
```

### `song-preview-provider.ts`

Abstracción de la que depende `RocolaContentService` (D de SOLID, mismo criterio que
`WordGenerator`/`TriviaGenerator`) — nunca de `fetch` a iTunes directamente, así se
prueba sin red.

```ts
export interface SongPreviewLookupResult {
  previewUrl: string;
  portadaUrl: string;
}

export interface SongPreviewProvider {
  // Devuelve solo las entradas que sí tienen preview disponible — un trackId
  // ausente del Map significa "sin preview, descartar esta canción".
  lookup(trackIds: number[]): Promise<Map<number, SongPreviewLookupResult>>;
}

export const SONG_PREVIEW_PROVIDER = Symbol('SONG_PREVIEW_PROVIDER');
```

### `itunes-preview-provider.ts`

Implementación real con `fetch` global (Node 18+, ya usado por el resto del backend,
sin dependencia nueva):

- `GET https://itunes.apple.com/lookup?id=<ids>&country=mx` (storefront mexicano —
  catálogo amplio de música en español; `country` es el único parámetro que hace falta,
  sin autenticación).
- `AbortController` con `timeout: 8_000` (más corto que el de la IA — es una llamada
  HTTP simple, no un modelo generativo).
- Por cada `results[]`: `previewUrl` tal cual; `portadaUrl` = `artworkUrl100` con
  `100x100` reemplazado por `600x600` en la URL (truco documentado de la API de iTunes
  para pedir portada más grande sin otro endpoint).
- Si `previewUrl` falta en un resultado (pasa con algunas canciones/regiones), esa
  entrada no se agrega al `Map` devuelto — `RocolaContentService` la trata como "sin
  preview, descartar".
- Ante error de red, timeout, o respuesta no-200: `throw SongPreviewLookupError` (una
  sola vez, sin reintento automático — el llamador decide si cae al banco de
  respaldo).

### `song-bank.ts`

Lista estática de **150 a 200 `RocolaBankEntry`**, escrita a mano por Kalin/la sesión de
implementación (no es una decisión de diseño, es contenido) — mezcla deliberada de
género y época pedida en `spec.md` punto 16: cumbia, merengue, salsa, balada, ranchera,
pop, rock, popular, desde clásicos (décadas atrás) hasta canciones actuales, para que
participen todas las edades de una reunión familiar. Cada entrada ya trae su
`itunesTrackId` resuelto con el script de arriba.

### `song-fallback-bank.ts`

Lista estática más chica (**20-30 `RocolaFallbackEntry`**) con `previewUrl`/`portadaUrl`
ya capturados a mano al momento de escribir el banco — se usa únicamente si la llamada a
iTunes falla por completo (sin red, timeout, error del servicio). Mismo aviso que
`word-fallback-bank.ts`: URLs de preview pueden quedar obsoletas con el tiempo (iTunes
las rota); es un respaldo de emergencia para que el juego nunca se caiga por completo,
no una fuente primaria — se revisa/actualiza si deja de andar en alguna sesión.

### `rocola-content.service.ts`

```ts
export class InvalidSongCountError extends Error {}
```

`selectSongs(cantidad: number, excluir: string[] = []): Promise<RocolaSong[]>`:

1. Valida `cantidad` — entero ≥ 1, sin llamar a nada si falla
   (`InvalidSongCountError`).
2. `pickCandidates(excluir)` (privado): baraja `song-bank.ts` (`random` inyectado,
   `Math.random` por defecto, mismo criterio que el resto del proyecto para pruebas
   deterministas), filtra las que están en `excluir`, y arma una lista de candidatas
   respetando `MAX_SAME_GENERO_PER_MATCH = 2` por género (cuenta por género mientras
   recorre el barajado, salta la entrada si ese género ya llegó al tope) hasta juntar
   `cantidad + margen` candidatas (margen = `Math.ceil(cantidad * 0.5)`, para tener con
   qué reemplazar las que no tengan preview).
   - Si tras filtrar `excluir` no hay `cantidad` canciones distintas disponibles en
     absoluto (banco agotado para esta sala) → se reintenta `pickCandidates([])` (sin
     exclusión) una sola vez — decisión de `spec.md`: se prefiere repetir canciones muy
     viejas de la sala antes que bloquear la partida.
3. Si hay `SONG_PREVIEW_PROVIDER` configurado: `provider.lookup(candidatas.map(c =>
   c.itunesTrackId))`.
   - Éxito: arma `RocolaSong[]` con las candidatas que sí aparecen en el `Map`
     devuelto, en el orden barajado, hasta `cantidad`. Si no alcanzan (algunas sin
     preview), repite el paso 2-3 con un lote nuevo de candidatas (excluyendo las ya
     descartadas), hasta `MAX_LOOKUP_ATTEMPTS = 3` intentos.
   - Si tras los reintentos sigue faltando, o el `lookup` mismo lanza error (red caída):
     completa el resto desde `song-fallback-bank.ts` (mismas reglas de `excluir` y tope
     de género, sin llamada de red — ya trae preview/portada), con `Logger.warn`.
4. Nunca propaga un error del proveedor externo hacia quien llama — mismo principio que
   `AiContentService` con la IA (constitution.md, resiliencia ante servicios externos
   en el camino crítico).
5. `random` es parámetro del constructor, igual que en el resto del proyecto.

### `rocola-content.module.ts`

Provee `SONG_PREVIEW_PROVIDER` (factory sin condicional de credencial — iTunes no
necesita API key, a diferencia de `AiContentModule` con Anthropic) y
`RocolaContentService`. Se agrega a `AppModule`. Sin dependencias nuevas (usa `fetch`
global).

## Pruebas

- **`rocola-content.service.spec.ts`** (instanciación directa, proveedor falso
  inyectado, `random` inyectado): cantidad válida sin exclusión; cantidad válida con
  exclusión (ninguna devuelta coincide); tope de 2 por género se respeta cuando el
  banco barajado ofrece más candidatas de un género que ese tope; el proveedor devuelve
  un `Map` incompleto (algunas sin preview) → se completan con más candidatas del
  banco; el proveedor lanza error → se completa todo desde
  `song-fallback-bank.ts`; cantidad inválida (0, negativa, no entera) → error sin
  llamar al proveedor; banco sin suficientes canciones nuevas tras `excluir` → se
  reintenta sin exclusión en vez de fallar.
- **`itunes-preview-provider.spec.ts`**: doble de `fetch` global (sin red real);
  mapea `previewUrl`/`artworkUrl100`→`portadaUrl` (600x600) correctamente; una entrada
  sin `previewUrl` en la respuesta queda fuera del `Map`; timeout → `SongPreviewLookupError`;
  respuesta no-200 → mismo error.
- **`song-bank.spec.ts`**: ≥150 entradas, todas con `id` único, `itunesTrackId` entero
  positivo único, y variedad real de género (cada `RocolaGenero` tiene al menos algunas
  entradas).
- **`song-fallback-bank.spec.ts`**: ≥20 entradas válidas, todas con `previewUrl` y
  `portadaUrl` no vacíos, `id` únicos y distintos de los de `song-bank.ts`.
- **Smoke opcional contra la API real** (`test/rocola-content.e2e-spec.ts`,
  `describe.skipIf(process.env.CI)`): hace un `lookup` real de 3-5 `itunesTrackId` del
  banco y verifica a mano que devuelven `previewUrl` — sirve también para detectar
  entradas del banco cuyo `itunesTrackId` haya quedado inválido con el tiempo.

## Checklist manual

No aplica — tarea de puro backend sin ninguna UI conectada todavía (excepción explícita
de `testing-strategy.md`). `LaRocolaModule` es quien la conecta a un juego real.
