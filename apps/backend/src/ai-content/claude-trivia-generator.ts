import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { TriviaGenerator } from './trivia-generator.js';
import type { RawTriviaQuestion, TriviaCategory } from './trivia.types.js';

const CATEGORY_LABELS: Record<TriviaCategory, string> = {
  general: 'cultura general',
  historia: 'historia',
  geografia: 'geografía',
  ciencia: 'ciencia',
  deportes: 'deportes',
  entretenimiento: 'entretenimiento (cine, música, TV)',
};

const SYSTEM_PROMPT = `Generás preguntas de trivia en español para jugar en familia, en una
reunión presencial. Cada pregunta debe tener una única respuesta correcta, verificable y
sin ambigüedad, y tres opciones incorrectas plausibles pero claramente falsas para quien
sabe el tema. No repitas preguntas dentro del mismo pedido ni reutilices la misma opción
incorrecta como si fuera la correcta. El campo "correcta" siempre lleva la respuesta
correcta; "incorrectas" solo lleva las tres opciones falsas, en cualquier orden.`;

const triviaResponseSchema = z.object({
  preguntas: z.array(
    z.object({
      pregunta: z.string(),
      correcta: z.string(),
      incorrectas: z.array(z.string()),
    }),
  ),
});

export class TriviaGenerationError extends Error {
  constructor(reason: string) {
    super(`No se pudieron generar preguntas de trivia con IA: ${reason}`);
    this.name = 'TriviaGenerationError';
  }
}

export class ClaudeTriviaGenerator implements TriviaGenerator {
  constructor(private readonly client: Anthropic) {}

  async generate(categoria: TriviaCategory, cantidad: number): Promise<RawTriviaQuestion[]> {
    const response = await this.client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generá ${cantidad} preguntas de trivia de ${CATEGORY_LABELS[categoria]}.`,
        },
      ],
      output_config: { format: zodOutputFormat(triviaResponseSchema) },
    });

    if (response.stop_reason === 'refusal') {
      throw new TriviaGenerationError('la IA rechazó el pedido');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new TriviaGenerationError('la respuesta de la IA quedó incompleta');
    }
    if (!response.parsed_output) {
      throw new TriviaGenerationError('la respuesta de la IA no cumplió el formato esperado');
    }

    return response.parsed_output.preguntas.map((pregunta) => ({
      pregunta: pregunta.pregunta,
      correcta: pregunta.correcta,
      incorrectas: pregunta.incorrectas,
    }));
  }
}
