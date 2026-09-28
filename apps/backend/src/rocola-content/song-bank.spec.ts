import { SONG_BANK } from './song-bank.js';
import { ROCOLA_GENEROS } from './rocola-content.types.js';

describe('SONG_BANK', () => {
  it('tiene al menos 60 entradas', () => {
    expect(SONG_BANK.length).toBeGreaterThanOrEqual(60);
  });

  it('todos los ids son únicos', () => {
    const ids = SONG_BANK.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todos los itunesTrackId son enteros positivos únicos', () => {
    const ids = SONG_BANK.map((s) => s.itunesTrackId);
    expect(ids.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hay variedad real de género: cada género tiene al menos 5 canciones', () => {
    for (const genero of ROCOLA_GENEROS) {
      const count = SONG_BANK.filter((s) => s.genero === genero).length;
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it('ningún título o artista está vacío', () => {
    expect(SONG_BANK.every((s) => s.titulo.trim() && s.artista.trim())).toBe(true);
  });
});
