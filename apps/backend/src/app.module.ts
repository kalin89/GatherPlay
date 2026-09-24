import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppGateway } from './websocket/app.gateway.js';
import { RoomModule } from './room/room.module.js';
import { GameEngineModule } from './game-engine/game-engine.module.js';
import { AiContentModule } from './ai-content/ai-content.module.js';
import { TriviaModule } from './trivia/trivia.module.js';

@Module({
  imports: [RoomModule, GameEngineModule, AiContentModule, TriviaModule],
  controllers: [AppController],
  providers: [AppService, AppGateway],
})
export class AppModule {}
