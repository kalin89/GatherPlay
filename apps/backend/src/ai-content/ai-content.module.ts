import { Module } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiContentService } from './ai-content.service.js';
import { ClaudeTriviaGenerator } from './claude-trivia-generator.js';
import { TRIVIA_GENERATOR, type TriviaGenerator } from './trivia-generator.js';

@Module({
  providers: [
    {
      provide: TRIVIA_GENERATOR,
      useFactory: (): TriviaGenerator | null => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return null;
        const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });
        return new ClaudeTriviaGenerator(client);
      },
    },
    AiContentService,
  ],
  exports: [AiContentService],
})
export class AiContentModule {}
