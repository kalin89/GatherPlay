import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module.js';
import { GameEngineModule } from '../game-engine/game-engine.module.js';
import { AiContentModule } from '../ai-content/ai-content.module.js';
import { TriviaGateway } from './trivia.gateway.js';
import { TriviaService } from './trivia.service.js';

@Module({
  imports: [RoomModule, GameEngineModule, AiContentModule],
  providers: [TriviaService, TriviaGateway],
})
export class TriviaModule {}
