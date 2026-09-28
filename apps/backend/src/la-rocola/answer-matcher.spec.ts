import { isFuzzyMatch } from './answer-matcher.js';

describe('isFuzzyMatch', () => {
  const TITULO = 'Rayando el Sol';

  it('acepta la respuesta exacta', () => {
    expect(isFuzzyMatch('Rayando el Sol', TITULO)).toBe(true);
  });

  it('acepta variantes con errores de tipeo (ejemplos de Kalin)', () => {
    expect(isFuzzyMatch('Rallando el sol', TITULO)).toBe(true);
    expect(isFuzzyMatch('rayando sol', TITULO)).toBe(true);
    expect(isFuzzyMatch('rayndo el sol', TITULO)).toBe(true);
  });

  it('acepta sin tildes ni mayúsculas', () => {
    expect(isFuzzyMatch('bidi bidi bom bom', 'Bidi Bidi Bom Bom')).toBe(true);
    expect(isFuzzyMatch('como te voy a olvidar', 'Cómo Te Voy a Olvidar')).toBe(true);
  });

  it('rechaza una respuesta sin ninguna relación', () => {
    expect(isFuzzyMatch('despacito', TITULO)).toBe(false);
    expect(isFuzzyMatch('la bamba', TITULO)).toBe(false);
  });

  it('rechaza una cadena vacía', () => {
    expect(isFuzzyMatch('', TITULO)).toBe(false);
    expect(isFuzzyMatch('   ', TITULO)).toBe(false);
  });

  it('ignora el subtítulo entre paréntesis al comparar', () => {
    expect(isFuzzyMatch('waka waka', 'Waka Waka (Esto Es África)')).toBe(true);
    expect(isFuzzyMatch('waka waka esto es africa', 'Waka Waka (Esto Es África)')).toBe(true);
  });

  it('tolera una palabra clave de más o de menos en títulos largos', () => {
    expect(isFuzzyMatch('copa de la vida', 'La Copa de la Vida')).toBe(true);
  });

  it('con título de una sola palabra clave, exige que esa palabra matchee', () => {
    expect(isFuzzyMatch('despasito', 'Despacito')).toBe(true); // 1 typo, tolerado
    expect(isFuzzyMatch('otra cosa', 'Despacito')).toBe(false);
  });

  it('no acepta un título completamente distinto aunque comparta alguna palabra suelta', () => {
    expect(isFuzzyMatch('el rey', 'El Cantante')).toBe(false);
  });
});
