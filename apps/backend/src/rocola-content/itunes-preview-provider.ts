import { Injectable, Logger } from '@nestjs/common';
import {
  SongPreviewLookupError,
  type SongPreviewLookupResult,
  type SongPreviewProvider,
} from './song-preview-provider.js';

const LOOKUP_TIMEOUT_MS = 8_000;

interface ItunesLookupTrack {
  trackId: number;
  previewUrl?: string;
  artworkUrl100?: string;
}

interface ItunesLookupResponse {
  results: ItunesLookupTrack[];
}

// Storefront mexicano: catálogo amplio de música en español, sin necesidad
// de autenticación ni API key (ver rocola-content/analysis.md).
@Injectable()
export class ItunesPreviewProvider implements SongPreviewProvider {
  private readonly logger = new Logger(ItunesPreviewProvider.name);

  async lookup(trackIds: number[]): Promise<Map<number, SongPreviewLookupResult>> {
    if (trackIds.length === 0) {
      return new Map();
    }

    const url = `https://itunes.apple.com/lookup?id=${trackIds.join(',')}&country=mx`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      throw new SongPreviewLookupError(
        `Falló la llamada a iTunes lookup: ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new SongPreviewLookupError(`iTunes lookup devolvió HTTP ${response.status}`);
    }

    const data = (await response.json()) as ItunesLookupResponse;
    const result = new Map<number, SongPreviewLookupResult>();
    for (const track of data.results ?? []) {
      if (!track.previewUrl) {
        this.logger.warn(`Track ${track.trackId} sin previewUrl disponible en iTunes`);
        continue;
      }
      result.set(track.trackId, {
        previewUrl: track.previewUrl,
        // Truco documentado de la API de iTunes: pedir el mismo asset en
        // mayor resolución reemplazando el tamaño en la URL.
        portadaUrl: (track.artworkUrl100 ?? '').replace('100x100bb', '600x600bb'),
      });
    }
    return result;
  }
}
