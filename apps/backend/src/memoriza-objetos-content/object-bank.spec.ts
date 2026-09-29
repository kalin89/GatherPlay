import { OBJECT_BANK } from './object-bank.js';
import { isFuzzyMatch } from '../la-rocola/answer-matcher.js';

describe('OBJECT_BANK', () => {
  it('tiene al menos 300 entradas', () => {
    expect(OBJECT_BANK.length).toBeGreaterThanOrEqual(300);
  });

  it('todas las entradas tienen id, palabra e imagenUrl no vacíos', () => {
    for (const entry of OBJECT_BANK) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.palabra.length).toBeGreaterThan(0);
      expect(entry.imagenUrl.length).toBeGreaterThan(0);
    }
  });

  it('los id son únicos', () => {
    const ids = OBJECT_BANK.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('las imagenUrl son únicas (cada objeto tiene su propio ícono)', () => {
    const urls = OBJECT_BANK.map((entry) => entry.imagenUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  // El comparador tolerante a errores de tipeo (isFuzzyMatch, reusado de La
  // Rocola) puede confundir dos objetos distintos si sus palabras comparten
  // demasiado (ej. una frase que contiene la palabra de otro objeto) — esta
  // prueba usa el comparador real para garantizar que ninguna palabra del
  // banco puede adivinarse "por accidente" escribiendo otra.
  it('ninguna palabra del banco hace fuzzy-match con la palabra de otro objeto distinto', () => {
    const confusiones: string[] = [];
    for (const a of OBJECT_BANK) {
      for (const b of OBJECT_BANK) {
        if (a.id === b.id) continue;
        if (isFuzzyMatch(a.palabra, b.palabra)) {
          confusiones.push(`"${a.palabra}" (${a.id}) vs "${b.palabra}" (${b.id})`);
        }
      }
    }
    expect(confusiones).toEqual([]);
  });
});
