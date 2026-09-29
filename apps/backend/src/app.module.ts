import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppGateway } from './websocket/app.gateway.js';
import { RoomModule } from './room/room.module.js';
import { GameEngineModule } from './game-engine/game-engine.module.js';
import { AiContentModule } from './ai-content/ai-content.module.js';
import { TriviaModule } from './trivia/trivia.module.js';
import { CarasYGestosModule } from './caras-y-gestos/caras-y-gestos.module.js';
import { AdivinaPalabraModule } from './adivina-palabra/adivina-palabra.module.js';
import { RocolaContentModule } from './rocola-content/rocola-content.module.js';
import { LaRocolaModule } from './la-rocola/la-rocola.module.js';
import { MemorizaObjetosContentModule } from './memoriza-objetos-content/memoriza-objetos-content.module.js';
import { MemorizaObjetosModule } from './memoriza-objetos/memoriza-objetos.module.js';

@Module({
  imports: [
    RoomModule,
    GameEngineModule,
    AiContentModule,
    TriviaModule,
    CarasYGestosModule,
    AdivinaPalabraModule,
    RocolaContentModule,
    LaRocolaModule,
    MemorizaObjetosContentModule,
    MemorizaObjetosModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppGateway],
})
export class AppModule {}
