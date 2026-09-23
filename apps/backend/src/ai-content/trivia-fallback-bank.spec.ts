import { getFallbackQuestions } from './trivia-fallback-bank.js';
import { TRIVIA_CATEGORIES } from './trivia.types.js';

describe('trivia-fallback-bank', () => {
  it.each(TRIVIA_CATEGORIES)('la categoría "%s" tiene al menos 20 preguntas válidas', (categoria) => {
    const questions = getFallbackQuestions(categoria);

    expect(questions.length).toBeGreaterThanOrEqual(20);

    for (const question of questions) {
      expect(question.pregunta.trim().length).toBeGreaterThan(0);
      expect(question.correcta.trim().length).toBeGreaterThan(0);
      expect(question.incorrectas).toHaveLength(3);

      const opciones = [question.correcta, ...question.incorrectas];
      const normalizadas = opciones.map((o) => o.trim().toLowerCase());
      expect(new Set(normalizadas).size).toBe(4);
    }

    const preguntasNormalizadas = questions.map((q) => q.pregunta.trim().toLowerCase());
    expect(new Set(preguntasNormalizadas).size).toBe(questions.length);
  });
});
