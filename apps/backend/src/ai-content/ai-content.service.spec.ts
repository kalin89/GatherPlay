import { vi } from 'vitest';
import {
  AiContentService,
  InvalidQuestionCountError,
  UnknownTriviaCategoryError,
} from './ai-content.service.js';
import type { TriviaGenerator } from './trivia-generator.js';
import type { RawTriviaQuestion } from './trivia.types.js';

function fakeGenerator(generate: TriviaGenerator['generate']): TriviaGenerator {
  return { generate };
}

// Random determinista: siempre devuelve el primero de la secuencia dada y
// repite el último valor si se pide más de los que hay — alcanza para que
// `sample`/`shuffle` sean predecibles en las pruebas.
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe('AiContentService', () => {
  it('devuelve N preguntas con 4 opciones distintas y una sola correcta cuando la IA responde bien', async () => {
    const raw: RawTriviaQuestion[] = [
      { pregunta: '¿Capital de Francia?', correcta: 'París', incorrectas: ['Roma', 'Berlín', 'Madrid'] },
      { pregunta: '¿Capital de Italia?', correcta: 'Roma', incorrectas: ['París', 'Berlín', 'Madrid'] },
    ];
    const generate = vi.fn().mockResolvedValue(raw);
    const service = new AiContentService(fakeGenerator(generate), sequence(0));

    const questions = await service.getTriviaQuestions('geografia', 2);

    expect(questions).toHaveLength(2);
    for (const q of questions) {
      expect(new Set(q.opciones).size).toBe(4);
      expect(q.opciones[q.indiceCorrecto]).toBeDefined();
    }
    expect(generate).toHaveBeenCalledWith('geografia', 2);
  });

  it('la posición de la opción correcta varía entre preguntas — no la elige la IA', async () => {
    const raw: RawTriviaQuestion[] = [
      { pregunta: 'Q1', correcta: 'A', incorrectas: ['B', 'C', 'D'] },
      { pregunta: 'Q2', correcta: 'A', incorrectas: ['B', 'C', 'D'] },
    ];
    const generate = vi.fn().mockResolvedValue(raw);
    // Primer shuffle: sin swaps (queda como llegó). Segundo shuffle: fuerza swaps.
    const service = new AiContentService(fakeGenerator(generate), sequence(0, 0, 0, 0.99, 0.99, 0.99));

    const questions = await service.getTriviaQuestions('general', 2);

    expect(questions[0]!.indiceCorrecto).not.toBe(questions[1]!.indiceCorrecto);
  });

  it('cae al banco de respaldo si la IA lanza un error, sin propagarlo', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('timeout'));
    const service = new AiContentService(fakeGenerator(generate), sequence(0));

    const questions = await service.getTriviaQuestions('ciencia', 5);

    expect(questions).toHaveLength(5);
  });

  it('usa el banco directo, sin llamar a la IA, cuando no hay generador configurado', async () => {
    const service = new AiContentService(null, sequence(0));

    const questions = await service.getTriviaQuestions('deportes', 3);

    expect(questions).toHaveLength(3);
  });

  it('categoría desconocida: lanza error y no llama a la IA', async () => {
    const generate = vi.fn();
    const service = new AiContentService(fakeGenerator(generate));

    await expect(service.getTriviaQuestions('inventada', 5)).rejects.toThrow(
      UnknownTriviaCategoryError,
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 21])('cantidad inválida (%s): lanza error y no llama a la IA', async (cantidad) => {
    const generate = vi.fn();
    const service = new AiContentService(fakeGenerator(generate));

    await expect(service.getTriviaQuestions('general', cantidad)).rejects.toThrow(
      InvalidQuestionCountError,
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('cae al banco si la IA devuelve menos preguntas de las pedidas', async () => {
    const generate = vi.fn().mockResolvedValue([
      { pregunta: 'Única', correcta: 'A', incorrectas: ['B', 'C', 'D'] },
    ]);
    const service = new AiContentService(fakeGenerator(generate), sequence(0));

    const questions = await service.getTriviaQuestions('historia', 5);

    expect(questions).toHaveLength(5);
  });

  it('cae al banco si la IA repite una opción dentro de una pregunta', async () => {
    const generate = vi.fn().mockResolvedValue([
      { pregunta: 'Q1', correcta: 'A', incorrectas: ['A', 'C', 'D'] },
    ]);
    const service = new AiContentService(fakeGenerator(generate), sequence(0));

    const questions = await service.getTriviaQuestions('entretenimiento', 1);

    expect(questions).toHaveLength(1);
    expect(questions[0]!.pregunta).not.toBe('Q1');
  });

  it('cae al banco si la IA repite la misma pregunta en el lote', async () => {
    const generate = vi.fn().mockResolvedValue([
      { pregunta: 'Misma pregunta', correcta: 'A', incorrectas: ['B', 'C', 'D'] },
      { pregunta: 'misma pregunta', correcta: 'E', incorrectas: ['F', 'G', 'H'] },
    ]);
    const service = new AiContentService(fakeGenerator(generate), sequence(0));

    const questions = await service.getTriviaQuestions('general', 2);

    expect(questions).toHaveLength(2);
    expect(questions.some((q) => q.pregunta === 'Misma pregunta')).toBe(false);
  });
});
