// Abstracción de la que depende RocolaContentService (D de SOLID, mismo
// criterio que WordGenerator/TriviaGenerator) — nunca de `fetch` a iTunes
// directamente, así se prueba sin red.
export interface SongPreviewLookupResult {
  previewUrl: string;
  portadaUrl: string;
}

export class SongPreviewLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SongPreviewLookupError';
  }
}

export interface SongPreviewProvider {
  // Devuelve solo las entradas que sí tienen preview disponible — un
  // trackId ausente del Map devuelto significa "sin preview, descartar esta
  // canción". Lanza SongPreviewLookupError ante error de red/timeout/HTTP.
  lookup(trackIds: number[]): Promise<Map<number, SongPreviewLookupResult>>;
}

export const SONG_PREVIEW_PROVIDER = Symbol('SONG_PREVIEW_PROVIDER');
