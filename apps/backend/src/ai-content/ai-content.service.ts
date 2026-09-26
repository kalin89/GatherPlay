import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TRIVIA_GENERATOR, type TriviaGenerator } from './trivia-generator.js';
import { getFallbackQuestions } from './trivia-fallback-bank.js';
import { GESTURE_GENERATOR, type GestureGenerator } from './gesture-generator.js';
import { getFallbackGestureWords } from './gesture-fallback-bank.js';
import { WORD_GENERATOR, type WordGenerator } from './word-generator.js';
import { getFallbackAdivinaWords } from './word-fallback-bank.js';
import {
  TRIVIA_CATEGORIES,
  type RawTriviaQuestion,
  type TriviaCategory,
  type TriviaQuestion,
} from './trivia.types.js';
import {
  MAX_GESTURE_WORDS_PER_REQUEST,
  MIN_GESTURE_WORDS,
  type GestureWord,
} from './gestos.types.js';
import {
  MAX_ADIVINA_WORDS_PER_REQUEST,
  MIN_ADIVINA_WORDS,
  type AdivinaWord,
} from './adivina-palabra.types.js';

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

export class InvalidWordCountError extends Error {
  constructor(cantidad: number) {
    super(`Cantidad de palabras inválida: ${cantidad}`);
    this.name = 'InvalidWordCountError';
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
    @Optional()
    @Inject(GESTURE_GENERATOR)
    private readonly gestureGenerator: GestureGenerator | null = null,
    @Optional()
    @Inject(WORD_GENERATOR)
    private readonly wordGenerator: WordGenerator | null = null,
  ) {}

  async getTriviaQuestions(
    categoria: string,
    cantidad: number = DEFAULT_QUESTIONS,
    excluir: string[] = [],
  ): Promise<TriviaQuestion[]> {
    if (!(TRIVIA_CATEGORIES as readonly string[]).includes(categoria)) {
      throw new UnknownTriviaCategoryError(categoria);
    }
    if (!Number.isInteger(cantidad) || cantidad < MIN_QUESTIONS || cantidad > MAX_QUESTIONS) {
      throw new InvalidQuestionCountError(cantidad);
    }

    const categoriaValida = categoria as TriviaCategory;
    const raw = await this.generateOrFallback(categoriaValida, cantidad, excluir);
    return raw.map((question) => this.toTriviaQuestion(categoriaValida, question));
  }

  async getGestureWords(
    cantidad: number,
    excluir: string[] = [],
  ): Promise<GestureWord[]> {
    if (
      !Number.isInteger(cantidad) ||
      cantidad < MIN_GESTURE_WORDS ||
      cantidad > MAX_GESTURE_WORDS_PER_REQUEST
    ) {
      throw new InvalidWordCountError(cantidad);
    }

    return this.generateGestureWordsOrFallback(cantidad, excluir);
  }

  async getAdivinaPalabraWords(
    cantidad: number,
    excluir: string[] = [],
  ): Promise<AdivinaWord[]> {
    if (
      !Number.isInteger(cantidad) ||
      cantidad < MIN_ADIVINA_WORDS ||
      cantidad > MAX_ADIVINA_WORDS_PER_REQUEST
    ) {
      throw new InvalidWordCountError(cantidad);
    }

    return this.generateAdivinaWordsOrFallback(cantidad, excluir);
  }

  private async generateAdivinaWordsOrFallback(
    cantidad: number,
    excluir: string[],
  ): Promise<AdivinaWord[]> {
    if (this.wordGenerator) {
      try {
        const generated = await this.wordGenerator.generate(cantidad, excluir);
        if (this.isValidAdivinaBatch(generated, cantidad, excluir)) {
          return generated;
        }
        this.logger.warn(
          'La IA devolvió un lote de palabras de Adivina la palabra inválido; usando el banco de respaldo.',
        );
      } catch (error) {
        this.logger.warn(
          `Falló la generación de palabras de Adivina la palabra por IA: ${(error as Error).message}`,
        );
      }
    }
    return this.pickAdivinaWordsFromFallback(cantidad, excluir);
  }

  private isValidAdivinaBatch(
    palabras: AdivinaWord[],
    cantidad: number,
    excluir: string[],
  ): boolean {
    if (palabras.length !== cantidad) return false;
    if (palabras.some((palabra) => !palabra.trim())) return false;
    const normalizadas = palabras.map((palabra) => palabra.trim().toLowerCase());
    if (new Set(normalizadas).size !== normalizadas.length) return false;
    const yaUsadas = new Set(excluir.map((palabra) => palabra.trim().toLowerCase()));
    return normalizadas.every((palabra) => !yaUsadas.has(palabra));
  }

  private pickAdivinaWordsFromFallback(cantidad: number, excluir: string[]): AdivinaWord[] {
    const yaUsadas = new Set(excluir.map((palabra) => palabra.trim().toLowerCase()));
    const disponibles = getFallbackAdivinaWords().filter(
      (palabra) => !yaUsadas.has(palabra.trim().toLowerCase()),
    );
    return this.sample(disponibles, cantidad);
  }

  private async generateGestureWordsOrFallback(
    cantidad: number,
    excluir: string[],
  ): Promise<GestureWord[]> {
    if (this.gestureGenerator) {
      try {
        const generated = await this.gestureGenerator.generate(cantidad, excluir);
        if (this.isValidGestureBatch(generated, cantidad, excluir)) {
          return generated;
        }
        this.logger.warn(
          'La IA devolvió un lote de palabras de Caras y Gestos inválido; usando el banco de respaldo.',
        );
      } catch (error) {
        this.logger.warn(
          `Falló la generación de palabras de Caras y Gestos por IA: ${(error as Error).message}`,
        );
      }
    }
    return this.pickGestureWordsFromFallback(cantidad, excluir);
  }

  private isValidGestureBatch(
    palabras: GestureWord[],
    cantidad: number,
    excluir: string[],
  ): boolean {
    if (palabras.length !== cantidad) return false;
    if (palabras.some((palabra) => !palabra.trim())) return false;
    const normalizadas = palabras.map((palabra) => palabra.trim().toLowerCase());
    if (new Set(normalizadas).size !== normalizadas.length) return false;
    const yaUsadas = new Set(excluir.map((palabra) => palabra.trim().toLowerCase()));
    return normalizadas.every((palabra) => !yaUsadas.has(palabra));
  }

  private pickGestureWordsFromFallback(cantidad: number, excluir: string[]): GestureWord[] {
    const yaUsadas = new Set(excluir.map((palabra) => palabra.trim().toLowerCase()));
    const disponibles = getFallbackGestureWords().filter(
      (palabra) => !yaUsadas.has(palabra.trim().toLowerCase()),
    );
    return this.sample(disponibles, cantidad);
  }

  private async generateOrFallback(
    categoria: TriviaCategory,
    cantidad: number,
    excluir: string[],
  ): Promise<RawTriviaQuestion[]> {
    if (this.generator) {
      try {
        const generated = await this.generator.generate(categoria, cantidad, excluir);
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
    return this.pickFromFallback(categoria, cantidad, excluir);
  }

  private isValidBatch(questions: RawTriviaQuestion[], cantidad: number): boolean {
    if (questions.length !== cantidad) return false;
    if (!questions.every(isValidRawQuestion)) return false;
    return !hasDuplicateQuestions(questions);
  }

  private pickFromFallback(
    categoria: TriviaCategory,
    cantidad: number,
    excluir: string[],
  ): RawTriviaQuestion[] {
    const yaUsadas = new Set(excluir.map((pregunta) => pregunta.trim().toLowerCase()));
    const disponibles = getFallbackQuestions(categoria).filter(
      (q) => !yaUsadas.has(q.pregunta.trim().toLowerCase()),
    );
    return this.sample(disponibles, cantidad);
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
