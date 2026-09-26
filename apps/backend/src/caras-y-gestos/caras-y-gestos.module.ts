import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module.js';
import { GameEngineModule } from '../game-engine/game-engine.module.js';
import { AiContentModule } from '../ai-content/ai-content.module.js';
import { CarasYGestosGateway } from './caras-y-gestos.gateway.js';
import { CarasYGestosService } from './caras-y-gestos.service.js';

@Module({
  imports: [RoomModule, GameEngineModule, AiContentModule],
  providers: [CarasYGestosService, CarasYGestosGateway],
})
export class CarasYGestosModule {}
