import { Module } from '@nestjs/common';
import { RoomGateway } from './room.gateway.js';
import { RoomService } from './room.service.js';

@Module({
  providers: [RoomService, RoomGateway],
})
export class RoomModule {}
