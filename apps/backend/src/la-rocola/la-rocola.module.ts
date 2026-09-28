import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module.js';
import { GameEngineModule } from '../game-engine/game-engine.module.js';
import { RocolaContentModule } from '../rocola-content/rocola-content.module.js';
import { LaRocolaGateway } from './la-rocola.gateway.js';
import { LaRocolaService } from './la-rocola.service.js';

@Module({
  imports: [RoomModule, GameEngineModule, RocolaContentModule],
  providers: [LaRocolaService, LaRocolaGateway],
})
export class LaRocolaModule {}
