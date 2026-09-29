import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module.js';
import { GameEngineModule } from '../game-engine/game-engine.module.js';
import { MemorizaObjetosContentModule } from '../memoriza-objetos-content/memoriza-objetos-content.module.js';
import { MemorizaObjetosGateway } from './memoriza-objetos.gateway.js';
import { MemorizaObjetosService } from './memoriza-objetos.service.js';

@Module({
  imports: [RoomModule, GameEngineModule, MemorizaObjetosContentModule],
  providers: [MemorizaObjetosService, MemorizaObjetosGateway],
})
export class MemorizaObjetosModule {}
