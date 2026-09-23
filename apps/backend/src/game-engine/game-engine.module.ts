import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module.js';
import { GameEngineGateway } from './game-engine.gateway.js';
import { GameEngineService } from './game-engine.service.js';

@Module({
  imports: [RoomModule],
  providers: [GameEngineService, GameEngineGateway],
})
export class GameEngineModule {}
