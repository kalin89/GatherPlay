import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { GestureGenerator } from './gesture-generator.js';
import type { GestureWord } from './gestos.types.js';

const SYSTEM_PROMPT = `Generás palabras o frases cortas (máximo 2-3 palabras) en español para
jugar a la mímica (Caras y Gestos) en familia, en una reunión presencial. Mezclá distintos
tipos en cada pedido: cosas, verbos, objetos, profesiones, animales, lugares, personajes
célebres, etc. — no repitas siempre el mismo tipo. Evitá nombres propios difíciles de actuar
sin hablar (ej. políticos poco conocidos o nombres que se prestan a deletrear), y evitá
contenido no apto para todas las edades. No repitas ninguna palabra dentro del mismo pedido
ni ninguna de la lista de palabras que ya se usaron antes en esta sala, si se te pasa una.`;

const gestureResponseSchema = z.object({
  palabras: z.array(z.string()),
});

export class GestureGenerationError extends Error {
  constructor(reason: string) {
    super(`No se pudieron generar palabras de Caras y Gestos con IA: ${reason}`);
    this.name = 'GestureGenerationError';
  }
}

export class ClaudeGestureGenerator implements GestureGenerator {
  constructor(private readonly client: Anthropic) {}

  async generate(cantidad: number, excluir: string[] = []): Promise<GestureWord[]> {
    const exclusionText =
      excluir.length > 0
        ? `\n\nNo repitas ninguna de estas palabras que ya se usaron antes en esta sala:\n${excluir
            .map((palabra) => `- ${palabra}`)
            .join('\n')}`
        : '';

    const response = await this.client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generá ${cantidad} palabras o frases cortas para jugar a la mímica.${exclusionText}`,
        },
      ],
      output_config: { format: zodOutputFormat(gestureResponseSchema) },
    });

    if (response.stop_reason === 'refusal') {
      throw new GestureGenerationError('la IA rechazó el pedido');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new GestureGenerationError('la respuesta de la IA quedó incompleta');
    }
    if (!response.parsed_output) {
      throw new GestureGenerationError('la respuesta de la IA no cumplió el formato esperado');
    }

    return response.parsed_output.palabras;
  }
}
