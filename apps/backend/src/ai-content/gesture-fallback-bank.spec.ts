import { getFallbackGestureWords } from './gesture-fallback-bank.js';

describe('gesture-fallback-bank', () => {
  it('tiene al menos 80 palabras válidas y sin repetidas', () => {
    const palabras = getFallbackGestureWords();

    expect(palabras.length).toBeGreaterThanOrEqual(80);

    for (const palabra of palabras) {
      expect(palabra.trim().length).toBeGreaterThan(0);
    }

    const normalizadas = palabras.map((p) => p.trim().toLowerCase());
    expect(new Set(normalizadas).size).toBe(palabras.length);
  });
});
