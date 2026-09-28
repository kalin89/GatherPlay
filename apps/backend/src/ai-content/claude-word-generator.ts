import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { WordGenerator } from './word-generator.js';
import type { AdivinaWord } from './adivina-palabra.types.js';

const SYSTEM_PROMPT = `Generás palabras sueltas en español para jugar a "Adivina la palabra"
en familia: un integrante del equipo debe adivinarlas a partir de pistas verbales de sus
compañeros, sin decir la palabra ni derivados. Usá sustantivos comunes, cortos, sin
ambigüedad y de dificultad pareja (objetos cotidianos, animales, profesiones, lugares,
actividades). Evitá nombres propios y términos que dependan mucho de contexto regional. No
repitas ninguna palabra dentro del mismo pedido ni ninguna de la lista de palabras que ya se
usaron antes en esta sala, si se te pasa una.`;

const wordResponseSchema = z.object({
  palabras: z.array(z.string()),
});

export class WordGenerationError extends Error {
  constructor(reason: string) {
    super(`No se pudieron generar palabras de Adivina la palabra con IA: ${reason}`);
    this.name = 'WordGenerationError';
  }
}

export class ClaudeWordGenerator implements WordGenerator {
  constructor(private readonly client: Anthropic) {}

  async generate(cantidad: number, excluir: string[] = []): Promise<AdivinaWord[]> {
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
          content: `Generá ${cantidad} palabras para jugar a "Adivina la palabra".${exclusionText}`,
        },
      ],
      output_config: { format: zodOutputFormat(wordResponseSchema) },
    });

    if (response.stop_reason === 'refusal') {
      throw new WordGenerationError('la IA rechazó el pedido');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new WordGenerationError('la respuesta de la IA quedó incompleta');
    }
    if (!response.parsed_output) {
      throw new WordGenerationError('la respuesta de la IA no cumplió el formato esperado');
    }

    return response.parsed_output.palabras;
  }
}
