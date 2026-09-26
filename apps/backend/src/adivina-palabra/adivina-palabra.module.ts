import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module.js';
import { GameEngineModule } from '../game-engine/game-engine.module.js';
import { AiContentModule } from '../ai-content/ai-content.module.js';
import { AdivinaPalabraGateway } from './adivina-palabra.gateway.js';
import { AdivinaPalabraService } from './adivina-palabra.service.js';

@Module({
  imports: [RoomModule, GameEngineModule, AiContentModule],
  providers: [AdivinaPalabraService, AdivinaPalabraGateway],
})
export class AdivinaPalabraModule {}
