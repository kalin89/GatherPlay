import { vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeGestureGenerator, GestureGenerationError } from './claude-gesture-generator.js';

function fakeClient(parse: (...args: unknown[]) => unknown): Anthropic {
  return { messages: { parse } } as unknown as Anthropic;
}

describe('ClaudeGestureGenerator', () => {
  it('mapea parsed_output.palabras a GestureWord[]', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { palabras: ['Elefante', 'Nadar', 'Bombero'] },
    });
    const generator = new ClaudeGestureGenerator(fakeClient(parse));

    const result = await generator.generate(3, []);

    expect(result).toEqual(['Elefante', 'Nadar', 'Bombero']);
  });

  it('envía el modelo claude-haiku-4-5 y la cantidad pedida', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { palabras: [] },
    });
    const generator = new ClaudeGestureGenerator(fakeClient(parse));

    await generator.generate(7, []);

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

  it('con excluir, el mensaje de usuario incluye las palabras ya usadas', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { palabras: [] },
    });
    const generator = new ClaudeGestureGenerator(fakeClient(parse));

    await generator.generate(3, ['Elefante', 'Nadar']);

    const [{ messages }] = parse.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(messages[0]!.content).toContain('Elefante');
    expect(messages[0]!.content).toContain('Nadar');
  });

  it('sin excluir, el mensaje no menciona ninguna lista de exclusión', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { palabras: [] },
    });
    const generator = new ClaudeGestureGenerator(fakeClient(parse));

    await generator.generate(3, []);

    const [{ messages }] = parse.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(messages[0]!.content).not.toContain('No repitas ninguna de estas');
  });

  it('lanza GestureGenerationError si la IA rechaza el pedido (refusal)', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'refusal', parsed_output: null });
    const generator = new ClaudeGestureGenerator(fakeClient(parse));

    await expect(generator.generate(5, [])).rejects.toThrow(GestureGenerationError);
  });

  it('lanza GestureGenerationError si la respuesta queda incompleta (max_tokens)', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'max_tokens', parsed_output: null });
    const generator = new ClaudeGestureGenerator(fakeClient(parse));

    await expect(generator.generate(5, [])).rejects.toThrow(GestureGenerationError);
  });

  it('lanza GestureGenerationError si parsed_output viene en null sin refusal', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', parsed_output: null });
    const generator = new ClaudeGestureGenerator(fakeClient(parse));

    await expect(generator.generate(5, [])).rejects.toThrow(GestureGenerationError);
  });
});
