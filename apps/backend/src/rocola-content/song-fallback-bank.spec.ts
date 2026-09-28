import { SONG_FALLBACK_BANK } from './song-fallback-bank.js';
import { SONG_BANK } from './song-bank.js';

describe('SONG_FALLBACK_BANK', () => {
  it('tiene al menos 15 entradas', () => {
    expect(SONG_FALLBACK_BANK.length).toBeGreaterThanOrEqual(15);
  });

  it('todas tienen previewUrl y portadaUrl no vacíos', () => {
    expect(
      SONG_FALLBACK_BANK.every((s) => s.previewUrl.trim() && s.portadaUrl.trim()),
    ).toBe(true);
  });

  it('todos los ids son únicos', () => {
    const ids = SONG_FALLBACK_BANK.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada entrada de respaldo existe también en el banco principal (mismo id)', () => {
    const bankIds = new Set(SONG_BANK.map((s) => s.id));
    expect(SONG_FALLBACK_BANK.every((s) => bankIds.has(s.id))).toBe(true);
  });
});
