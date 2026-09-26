import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TRIVIA_GENERATOR, type TriviaGenerator } from './trivia-generator.js';
import { getFallbackQuestions } from './trivia-fallback-bank.js';
import {
  TRIVIA_CATEGORIES,
  type RawTriviaQuestion,
  type TriviaCategory,
  type TriviaQuestion,
} from './trivia.types.js';

export class UnknownTriviaCategoryError extends Error {
  constructor(categoria: string) {
    super(`No existe la categoría de trivia "${categoria}"`);
    this.name = 'UnknownTriviaCategoryError';
  }
}

export class InvalidQuestionCountError extends Error {
  constructor(cantidad: number) {
    super(`Cantidad de preguntas inválida: ${cantidad}`);
    this.name = 'InvalidQuestionCountError';
  }
}

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 50;
const DEFAULT_QUESTIONS = 10;

function isValidRawQuestion(question: RawTriviaQuestion): boolean {
  if (!question.pregunta.trim() || !question.correcta.trim()) return false;
  if (question.incorrectas.length !== 3) return false;
  const opciones = [question.correcta, ...question.incorrectas];
  if (opciones.some((opcion) => !opcion.trim())) return false;
  const normalizadas = opciones.map((opcion) => opcion.trim().toLowerCase());
  return new Set(normalizadas).size === opciones.length;
}

function hasDuplicateQuestions(questions: RawTriviaQuestion[]): boolean {
  const normalizadas = questions.map((q) => q.pregunta.trim().toLowerCase());
  return new Set(normalizadas).size !== normalizadas.length;
}

// Antes de cada ronda de Trivia, nunca durante el temporizador (constitution.md,
// principio 5). La IA es la fuente principal; el banco estático es el respaldo
// para que un fallo de IA nunca tumbe una ronda (testing-strategy.md).
@Injectable()
export class AiContentService {
  private readonly logger = new Logger(AiContentService.name);

  constructor(
    @Inject(TRIVIA_GENERATOR) private readonly generator: TriviaGenerator | null,
    @Optional() private readonly random: () => number = Math.random,
  ) {}

  async getTriviaQuestions(
    categoria: string,
    cantidad: number = DEFAULT_QUESTIONS,
  ): Promise<TriviaQuestion[]> {
    if (!(TRIVIA_CATEGORIES as readonly string[]).includes(categoria)) {
      throw new UnknownTriviaCategoryError(categoria);
    }
    if (!Number.isInteger(cantidad) || cantidad < MIN_QUESTIONS || cantidad > MAX_QUESTIONS) {
      throw new InvalidQuestionCountError(cantidad);
    }

    const categoriaValida = categoria as TriviaCategory;
    const raw = await this.generateOrFallback(categoriaValida, cantidad);
    return raw.map((question) => this.toTriviaQuestion(categoriaValida, question));
  }

  private async generateOrFallback(
    categoria: TriviaCategory,
    cantidad: number,
  ): Promise<RawTriviaQuestion[]> {
    if (this.generator) {
      try {
        const generated = await this.generator.generate(categoria, cantidad);
        if (this.isValidBatch(generated, cantidad)) {
          return generated;
        }
        this.logger.warn(
          `La IA devolvió un lote de trivia inválido para "${categoria}"; usando el banco de respaldo.`,
        );
      } catch (error) {
        this.logger.warn(
          `Falló la generación de trivia por IA para "${categoria}": ${(error as Error).message}`,
        );
      }
    }
    return this.pickFromFallback(categoria, cantidad);
  }

  private isValidBatch(questions: RawTriviaQuestion[], cantidad: number): boolean {
    if (questions.length !== cantidad) return false;
    if (!questions.every(isValidRawQuestion)) return false;
    return !hasDuplicateQuestions(questions);
  }

  private pickFromFallback(categoria: TriviaCategory, cantidad: number): RawTriviaQuestion[] {
    return this.sample(getFallbackQuestions(categoria), cantidad);
  }

  private sample<T>(items: readonly T[], cantidad: number): T[] {
    const pool = [...items];
    const count = Math.min(cantidad, pool.length);
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      const index = Math.floor(this.random() * pool.length);
      result.push(pool.splice(index, 1)[0]!);
    }
    return result;
  }

  private toTriviaQuestion(categoria: TriviaCategory, raw: RawTriviaQuestion): TriviaQuestion {
    const opciones = this.shuffle([raw.correcta, ...raw.incorrectas]);
    return {
      categoria,
      pregunta: raw.pregunta,
      opciones,
      indiceCorrecto: opciones.indexOf(raw.correcta),
    };
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}
