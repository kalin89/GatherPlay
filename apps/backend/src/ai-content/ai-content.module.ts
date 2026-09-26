import { Module } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiContentService } from './ai-content.service.js';
import { ClaudeTriviaGenerator } from './claude-trivia-generator.js';
import { TRIVIA_GENERATOR, type TriviaGenerator } from './trivia-generator.js';
import { ClaudeGestureGenerator } from './claude-gesture-generator.js';
import { GESTURE_GENERATOR, type GestureGenerator } from './gesture-generator.js';
import { ClaudeWordGenerator } from './claude-word-generator.js';
import { WORD_GENERATOR, type WordGenerator } from './word-generator.js';

const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

@Module({
  providers: [
    {
      provide: ANTHROPIC_CLIENT,
      useFactory: (): Anthropic | null => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return null;
        return new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });
      },
    },
    {
      provide: TRIVIA_GENERATOR,
      inject: [ANTHROPIC_CLIENT],
      useFactory: (client: Anthropic | null): TriviaGenerator | null =>
        client ? new ClaudeTriviaGenerator(client) : null,
    },
    {
      provide: GESTURE_GENERATOR,
      inject: [ANTHROPIC_CLIENT],
      useFactory: (client: Anthropic | null): GestureGenerator | null =>
        client ? new ClaudeGestureGenerator(client) : null,
    },
    {
      provide: WORD_GENERATOR,
      inject: [ANTHROPIC_CLIENT],
      useFactory: (client: Anthropic | null): WordGenerator | null =>
        client ? new ClaudeWordGenerator(client) : null,
    },
    AiContentService,
  ],
  exports: [AiContentService],
})
export class AiContentModule {}
