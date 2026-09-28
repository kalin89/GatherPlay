import { vi } from 'vitest';
import { InvalidSongCountError, RocolaContentService } from './rocola-content.service.js';
import type { SongPreviewProvider } from './song-preview-provider.js';
import { SongPreviewLookupError } from './song-preview-provider.js';
import type { RocolaBankEntry } from './rocola-content.types.js';

function makeBank(count: number, genero = 'cumbia'): RocolaBankEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${genero}-song-${i}`,
    titulo: `Canción ${i}`,
    artista: `Artista ${i}`,
    genero: genero as RocolaBankEntry['genero'],
    itunesTrackId: 1000 + i,
  }));
}

function makeVariedBank(perGenero: number): RocolaBankEntry[] {
  const generos: RocolaBankEntry['genero'][] = [
    'cumbia',
    'merengue',
    'salsa',
    'balada',
    'ranchera',
    'pop',
    'rock',
    'popular',
  ];
  return generos.flatMap((genero) => makeBank(perGenero, genero));
}

function alwaysAvailableProvider(): SongPreviewProvider {
  return {
    lookup: vi.fn(async (trackIds: number[]) => {
      const map = new Map<number, { previewUrl: string; portadaUrl: string }>();
      for (const id of trackIds) {
        map.set(id, { previewUrl: `https://preview/${id}`, portadaUrl: `https://art/${id}` });
      }
      return map;
    }),
  };
}

describe('RocolaContentService', () => {
  it('lanza InvalidSongCountError con cantidad inválida, sin llamar al proveedor', async () => {
    const provider = alwaysAvailableProvider();
    const service = new RocolaContentService(provider, Math.random, makeVariedBank(3), []);

    await expect(service.selectSongs(0)).rejects.toThrow(InvalidSongCountError);
    await expect(service.selectSongs(-1)).rejects.toThrow(InvalidSongCountError);
    await expect(service.selectSongs(1.5)).rejects.toThrow(InvalidSongCountError);
    expect(provider.lookup).not.toHaveBeenCalled();
  });

  it('devuelve `cantidad` canciones distintas sin exclusión', async () => {
    const provider = alwaysAvailableProvider();
    const service = new RocolaContentService(provider, Math.random, makeVariedBank(3), []);

    const songs = await service.selectSongs(10);

    expect(songs).toHaveLength(10);
    expect(new Set(songs.map((s) => s.id)).size).toBe(10);
    expect(songs.every((s) => s.previewUrl && s.portadaUrl)).toBe(true);
  });

  it('ninguna canción devuelta coincide con la exclusión', async () => {
    const provider = alwaysAvailableProvider();
    const bank = makeVariedBank(3);
    const service = new RocolaContentService(provider, Math.random, bank, []);
    const excluir = bank.slice(0, 5).map((e) => e.id);

    const songs = await service.selectSongs(10, excluir);

    expect(songs.some((s) => excluir.includes(s.id))).toBe(false);
  });

  it('respeta el tope de 2 canciones por género', async () => {
    const provider = alwaysAvailableProvider();
    // 8 géneros x 3 = 24 entradas, pidiendo 16 (2 por género exacto).
    const service = new RocolaContentService(provider, Math.random, makeVariedBank(3), []);

    const songs = await service.selectSongs(16);

    const porGenero = new Map<string, number>();
    for (const song of songs) {
      porGenero.set(song.genero, (porGenero.get(song.genero) ?? 0) + 1);
    }
    for (const count of porGenero.values()) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('completa con más candidatas cuando el proveedor no tiene preview para algunas', async () => {
    const bank = makeVariedBank(5);
    // Solo la mitad de los géneros ("buenos") tienen preview en el primer
    // intento. El tope de 2 por género limita esos "buenos" a un máximo de 8
    // candidatas válidas en la primera llamada — siempre por debajo de los
    // 10 pedidos, sin importar el orden que traiga el shuffle interno — así
    // que un segundo intento es indefectible, no una casualidad del azar.
    const goodGeneros = new Set(['cumbia', 'merengue', 'salsa', 'balada']);
    const idToGenero = new Map(bank.map((entry) => [entry.itunesTrackId, entry.genero]));
    let call = 0;
    const provider: SongPreviewProvider = {
      lookup: vi.fn(async (trackIds: number[]) => {
        call++;
        const map = new Map<number, { previewUrl: string; portadaUrl: string }>();
        for (const id of trackIds) {
          if (call > 1 || goodGeneros.has(idToGenero.get(id)!)) {
            map.set(id, { previewUrl: `https://preview/${id}`, portadaUrl: `https://art/${id}` });
          }
        }
        return map;
      }),
    };
    const service = new RocolaContentService(provider, Math.random, bank, []);

    const songs = await service.selectSongs(10);

    expect(songs).toHaveLength(10);
    expect((provider.lookup as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('el proveedor lanza error: se completa todo desde el banco de respaldo', async () => {
    const bank = makeVariedBank(5);
    const fallback = makeVariedBank(5).map((e) => ({
      ...e,
      id: `fallback-${e.id}`,
      previewUrl: `https://preview/${e.id}`,
      portadaUrl: `https://art/${e.id}`,
    }));
    const provider: SongPreviewProvider = {
      lookup: vi.fn(async () => {
        throw new SongPreviewLookupError('sin red');
      }),
    };
    const service = new RocolaContentService(provider, Math.random, bank, fallback);

    const songs = await service.selectSongs(10);

    expect(songs).toHaveLength(10);
    expect(songs.every((s) => s.id.startsWith('fallback-'))).toBe(true);
  });

  it('banco sin suficientes canciones nuevas tras excluir: reinicia la exclusión en vez de fallar', async () => {
    const provider = alwaysAvailableProvider();
    const bank = makeVariedBank(2); // 16 canciones en total
    const service = new RocolaContentService(provider, Math.random, bank, []);
    // Excluye 12 de las 16 — quedan 4 disponibles, se piden 10.
    const excluir = bank.slice(0, 12).map((e) => e.id);

    const songs = await service.selectSongs(10, excluir);

    expect(songs).toHaveLength(10);
    // Al reiniciar la exclusión, puede repetir alguna de las excluidas.
    expect(songs.some((s) => excluir.includes(s.id))).toBe(true);
  });

  describe('filtro por género/artista', () => {
    it('con filtro por género, las 10 son de ese género, sin tope de 2', async () => {
      const provider = alwaysAvailableProvider();
      const bank = makeVariedBank(20); // 20 de cada género, sobra para 10
      const service = new RocolaContentService(provider, Math.random, bank, []);

      const songs = await service.selectSongs(10, [], { tipo: 'genero', genero: 'salsa' });

      expect(songs).toHaveLength(10);
      expect(songs.every((s) => s.genero === 'salsa')).toBe(true);
    });

    it('con filtro por artista, las 10 son de ese artista (insensible a tildes/mayúsculas)', async () => {
      const provider = alwaysAvailableProvider();
      const bank = [
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `artista-song-${i}`,
          titulo: `Canción ${i}`,
          artista: 'José José',
          genero: (i % 2 === 0 ? 'balada' : 'pop') as RocolaBankEntry['genero'],
          itunesTrackId: 2000 + i,
        })),
        ...makeVariedBank(3), // distractores de otros artistas
      ];
      const service = new RocolaContentService(provider, Math.random, bank, []);

      const songs = await service.selectSongs(10, [], {
        tipo: 'artista',
        artista: 'jose jose', // sin tildes, minúscula — el host lo elige de un <select>, pero el match no depende de eso
      });

      expect(songs).toHaveLength(10);
      expect(songs.every((s) => s.artista === 'José José')).toBe(true);
    });

    it('el banco de respaldo también respeta el filtro al completar', async () => {
      const bank = makeVariedBank(5);
      const fallback = [
        ...makeBank(10, 'salsa').map((e) => ({
          ...e,
          id: `fallback-salsa-${e.id}`,
          previewUrl: `https://preview/${e.id}`,
          portadaUrl: `https://art/${e.id}`,
        })),
        ...makeBank(10, 'cumbia').map((e) => ({
          ...e,
          id: `fallback-cumbia-${e.id}`,
          previewUrl: `https://preview/${e.id}`,
          portadaUrl: `https://art/${e.id}`,
        })),
      ];
      const provider: SongPreviewProvider = {
        lookup: vi.fn(async () => {
          throw new SongPreviewLookupError('sin red');
        }),
      };
      const service = new RocolaContentService(provider, Math.random, bank, fallback);

      const songs = await service.selectSongs(10, [], { tipo: 'genero', genero: 'salsa' });

      expect(songs).toHaveLength(10);
      expect(songs.every((s) => s.genero === 'salsa')).toBe(true);
    });

    it('countAvailable cuenta bien para género, artista, y sin filtro', () => {
      const provider = alwaysAvailableProvider();
      const bank = makeVariedBank(4); // 4 por género x 8 géneros = 32
      const service = new RocolaContentService(provider, Math.random, bank, []);

      expect(service.countAvailable()).toBe(32);
      expect(service.countAvailable({ tipo: 'genero', genero: 'rock' })).toBe(4);
      expect(
        service.countAvailable({ tipo: 'artista', artista: 'no existe nadie así' }),
      ).toBe(0);
    });

    it('getAvailableArtists devuelve nombres únicos y ordenados', () => {
      const provider = alwaysAvailableProvider();
      const bank: RocolaBankEntry[] = [
        { id: '1', titulo: 'A', artista: 'Zulema', genero: 'pop', itunesTrackId: 1 },
        { id: '2', titulo: 'B', artista: 'Ana', genero: 'pop', itunesTrackId: 2 },
        { id: '3', titulo: 'C', artista: 'Ana', genero: 'rock', itunesTrackId: 3 },
      ];
      const service = new RocolaContentService(provider, Math.random, bank, []);

      expect(service.getAvailableArtists()).toEqual(['Ana', 'Zulema']);
    });
  });
});
