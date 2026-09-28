import { vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeWordGenerator, WordGenerationError } from './claude-word-generator.js';

function fakeClient(parse: (...args: unknown[]) => unknown): Anthropic {
  return { messages: { parse } } as unknown as Anthropic;
}

describe('ClaudeWordGenerator', () => {
  it('mapea parsed_output.palabras a AdivinaWord[]', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { palabras: ['Mesa', 'Elefante', 'Médico'] },
    });
    const generator = new ClaudeWordGenerator(fakeClient(parse));

    const result = await generator.generate(3, []);

    expect(result).toEqual(['Mesa', 'Elefante', 'Médico']);
  });

  it('envía el modelo claude-haiku-4-5 y la cantidad pedida', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { palabras: [] },
    });
    const generator = new ClaudeWordGenerator(fakeClient(parse));

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
    const generator = new ClaudeWordGenerator(fakeClient(parse));

    await generator.generate(3, ['Mesa', 'Elefante']);

    const [{ messages }] = parse.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(messages[0]!.content).toContain('Mesa');
    expect(messages[0]!.content).toContain('Elefante');
  });

  it('sin excluir, el mensaje no menciona ninguna lista de exclusión', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { palabras: [] },
    });
    const generator = new ClaudeWordGenerator(fakeClient(parse));

    await generator.generate(3, []);

    const [{ messages }] = parse.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(messages[0]!.content).not.toContain('No repitas ninguna de estas');
  });

  it('lanza WordGenerationError si la IA rechaza el pedido (refusal)', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'refusal', parsed_output: null });
    const generator = new ClaudeWordGenerator(fakeClient(parse));

    await expect(generator.generate(5, [])).rejects.toThrow(WordGenerationError);
  });

  it('lanza WordGenerationError si la respuesta queda incompleta (max_tokens)', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'max_tokens', parsed_output: null });
    const generator = new ClaudeWordGenerator(fakeClient(parse));

    await expect(generator.generate(5, [])).rejects.toThrow(WordGenerationError);
  });

  it('lanza WordGenerationError si parsed_output viene en null sin refusal', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', parsed_output: null });
    const generator = new ClaudeWordGenerator(fakeClient(parse));

    await expect(generator.generate(5, [])).rejects.toThrow(WordGenerationError);
  });
});
