import { vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeTriviaGenerator, TriviaGenerationError } from './claude-trivia-generator.js';

function fakeClient(parse: (...args: unknown[]) => unknown): Anthropic {
  return { messages: { parse } } as unknown as Anthropic;
}

describe('ClaudeTriviaGenerator', () => {
  it('mapea parsed_output.preguntas a RawTriviaQuestion[]', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        preguntas: [
          { pregunta: '¿Capital de Perú?', correcta: 'Lima', incorrectas: ['Cusco', 'Arequipa', 'Trujillo'] },
        ],
      },
    });
    const generator = new ClaudeTriviaGenerator(fakeClient(parse));

    const result = await generator.generate('geografia', 1);

    expect(result).toEqual([
      { pregunta: '¿Capital de Perú?', correcta: 'Lima', incorrectas: ['Cusco', 'Arequipa', 'Trujillo'] },
    ]);
  });

  it('envía el modelo claude-haiku-4-5 y la categoría/cantidad pedida', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { preguntas: [] },
    });
    const generator = new ClaudeTriviaGenerator(fakeClient(parse));

    await generator.generate('deportes', 7);

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('7'),
          }),
        ],
      }),
    );
  });

  it('lanza TriviaGenerationError si la IA rechaza el pedido (refusal)', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'refusal', parsed_output: null });
    const generator = new ClaudeTriviaGenerator(fakeClient(parse));

    await expect(generator.generate('general', 5)).rejects.toThrow(TriviaGenerationError);
  });

  it('lanza TriviaGenerationError si la respuesta queda incompleta (max_tokens)', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'max_tokens', parsed_output: null });
    const generator = new ClaudeTriviaGenerator(fakeClient(parse));

    await expect(generator.generate('general', 5)).rejects.toThrow(TriviaGenerationError);
  });

  it('lanza TriviaGenerationError si parsed_output viene en null sin refusal', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', parsed_output: null });
    const generator = new ClaudeTriviaGenerator(fakeClient(parse));

    await expect(generator.generate('general', 5)).rejects.toThrow(TriviaGenerationError);
  });
});
