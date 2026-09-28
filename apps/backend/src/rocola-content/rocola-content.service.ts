import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { SONG_PREVIEW_PROVIDER, type SongPreviewProvider } from './song-preview-provider.js';
import { SONG_BANK } from './song-bank.js';
import { SONG_FALLBACK_BANK } from './song-fallback-bank.js';
import {
  MAX_SAME_GENERO_PER_MATCH,
  type RocolaBankEntry,
  type RocolaFiltro,
  type RocolaSong,
} from './rocola-content.types.js';

export class InvalidSongCountError extends Error {
  constructor(cantidad: number) {
    super(`Cantidad de canciones inválida: ${cantidad}`);
    this.name = 'InvalidSongCountError';
  }
}

const MAX_LOOKUP_ATTEMPTS = 3;

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// Minúsculas + sin tildes — helper mínimo local, no se importa
// `answer-matcher.ts` de `la-rocola` para esto (sería una dependencia
// cruzada al revés, constitution.md principio 4).
function normalizeArtista(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matchesFiltro(entry: RocolaBankEntry, filtro: RocolaFiltro | undefined): boolean {
  if (!filtro) return true;
  if (filtro.tipo === 'genero') return entry.genero === filtro.genero;
  return normalizeArtista(entry.artista) === normalizeArtista(filtro.artista);
}

// Elige candidatas del banco respetando `excluir` y (si no hay `filtro`) el
// tope de MAX_SAME_GENERO_PER_MATCH por género, con un margen extra para
// poder reemplazar las que no tengan preview disponible. Con `filtro` activo
// el tope de género no aplica — o ya coincide con lo pedido (género) o es
// irrelevante (artista).
function pickCandidates(
  bank: readonly RocolaBankEntry[],
  cantidad: number,
  excluir: Set<string>,
  yaElegidas: Set<string>,
  random: () => number,
  filtro: RocolaFiltro | undefined,
): RocolaBankEntry[] {
  const margen = Math.max(4, Math.ceil(cantidad * 0.5));
  const shuffled = shuffle(bank, random);
  const generoCount = new Map<string, number>();
  const candidatas: RocolaBankEntry[] = [];

  for (const entry of shuffled) {
    if (candidatas.length >= cantidad + margen) break;
    if (excluir.has(entry.id) || yaElegidas.has(entry.id)) continue;
    if (!matchesFiltro(entry, filtro)) continue;
    if (!filtro) {
      const count = generoCount.get(entry.genero) ?? 0;
      if (count >= MAX_SAME_GENERO_PER_MATCH) continue;
      generoCount.set(entry.genero, count + 1);
    }
    candidatas.push(entry);
  }

  return candidatas;
}

// Resuelve las canciones de "La Rocola" (spec.md → "Contenido — La Rocola
// (canciones)"): banco curado a mano + iTunes para preview/portada. A
// diferencia de Trivia/Gestos/Adivina la palabra, no hay generación por IA
// acá — ver rocola-content/analysis.md.
@Injectable()
export class RocolaContentService {
  private readonly logger = new Logger(RocolaContentService.name);

  constructor(
    @Inject(SONG_PREVIEW_PROVIDER) private readonly provider: SongPreviewProvider,
    @Optional() private readonly random: () => number = Math.random,
    @Optional() private readonly bank: readonly RocolaBankEntry[] = SONG_BANK,
    @Optional() private readonly fallbackBank: readonly RocolaBankEntry[] = SONG_FALLBACK_BANK,
  ) {}

  async selectSongs(
    cantidad: number,
    excluir: string[] = [],
    filtro?: RocolaFiltro,
  ): Promise<RocolaSong[]> {
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new InvalidSongCountError(cantidad);
    }

    let excludeSet = new Set(excluir);
    if (this.countUnexcluded(excludeSet, filtro) < cantidad) {
      this.logger.warn(
        'El banco de canciones no tiene suficientes nuevas para esta sala; se reinicia la exclusión.',
      );
      excludeSet = new Set();
    }

    const songs: RocolaSong[] = [];
    const chosenIds = new Set<string>();
    let usedFallback = false;

    for (let attempt = 0; attempt < MAX_LOOKUP_ATTEMPTS && songs.length < cantidad; attempt++) {
      const remaining = cantidad - songs.length;
      const candidatas = pickCandidates(
        this.bank,
        remaining,
        excludeSet,
        chosenIds,
        this.random,
        filtro,
      );
      if (candidatas.length === 0) break;

      let resolved: Map<number, { previewUrl: string; portadaUrl: string }>;
      try {
        resolved = await this.provider.lookup(candidatas.map((c) => c.itunesTrackId));
      } catch (error) {
        this.logger.warn(
          `Falló el lookup de previews en iTunes: ${(error as Error).message}`,
        );
        usedFallback = true;
        break;
      }

      for (const candidate of candidatas) {
        if (songs.length >= cantidad) break;
        const preview = resolved.get(candidate.itunesTrackId);
        if (!preview) continue;
        chosenIds.add(candidate.id);
        songs.push({
          id: candidate.id,
          titulo: candidate.titulo,
          artista: candidate.artista,
          genero: candidate.genero,
          previewUrl: preview.previewUrl,
          portadaUrl: preview.portadaUrl,
        });
      }
    }

    if (songs.length < cantidad) {
      if (!usedFallback) {
        this.logger.warn(
          'No se consiguieron suficientes previews en vivo; se completa con el banco de respaldo.',
        );
      }
      this.fillFromFallback(songs, chosenIds, cantidad, excludeSet, filtro);
    }

    return songs;
  }

  // Cuántas canciones del banco principal matchean el filtro (o el banco
  // completo si no hay filtro) — sin mirar `excluir`, síncrono, sin red.
  // Usado por LaRocolaService para validar "alcanza para arrancar" antes de
  // crear la partida (ver la-rocola-module/analysis.md).
  countAvailable(filtro?: RocolaFiltro): number {
    return this.bank.filter((entry) => matchesFiltro(entry, filtro)).length;
  }

  // Nombres de artista distintos del banco principal, ordenados
  // alfabéticamente — usado para poblar el selector del host (nunca texto
  // libre). Sin red, síncrono.
  getAvailableArtists(): string[] {
    const nombres = new Set(this.bank.map((entry) => entry.artista));
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  }

  private countUnexcluded(excludeSet: Set<string>, filtro: RocolaFiltro | undefined): number {
    return this.bank.filter(
      (entry) => !excludeSet.has(entry.id) && matchesFiltro(entry, filtro),
    ).length;
  }

  private fillFromFallback(
    songs: RocolaSong[],
    chosenIds: Set<string>,
    cantidad: number,
    excludeSet: Set<string>,
    filtro: RocolaFiltro | undefined,
  ): void {
    const generoCount = new Map<string, number>();
    for (const song of songs) {
      generoCount.set(song.genero, (generoCount.get(song.genero) ?? 0) + 1);
    }

    const shuffled = shuffle(this.fallbackBank, this.random);
    for (const entry of shuffled) {
      if (songs.length >= cantidad) break;
      if (excludeSet.has(entry.id) || chosenIds.has(entry.id)) continue;
      if (!matchesFiltro(entry, filtro)) continue;
      if (!filtro) {
        const count = generoCount.get(entry.genero) ?? 0;
        if (count >= MAX_SAME_GENERO_PER_MATCH) continue;
        generoCount.set(entry.genero, count + 1);
      }
      const fallbackEntry = entry as RocolaBankEntry & {
        previewUrl: string;
        portadaUrl: string;
      };
      chosenIds.add(entry.id);
      songs.push({
        id: entry.id,
        titulo: entry.titulo,
        artista: entry.artista,
        genero: entry.genero,
        previewUrl: fallbackEntry.previewUrl,
        portadaUrl: fallbackEntry.portadaUrl,
      });
    }
  }
}
