import { getFallbackAdivinaWords } from './word-fallback-bank.js';

describe('word-fallback-bank', () => {
  it('tiene al menos 150 palabras válidas y sin repetidas', () => {
    const palabras = getFallbackAdivinaWords();

    expect(palabras.length).toBeGreaterThanOrEqual(150);

    for (const palabra of palabras) {
      expect(palabra.trim().length).toBeGreaterThan(0);
    }

    const normalizadas = palabras.map((p) => p.trim().toLowerCase());
    expect(new Set(normalizadas).size).toBe(palabras.length);
  });
});
