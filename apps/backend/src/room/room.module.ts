import { Module } from '@nestjs/common';
import { RoomGateway } from './room.gateway.js';
import { RoomService } from './room.service.js';

@Module({
  providers: [RoomService, RoomGateway],
  exports: [RoomService],
})
export class RoomModule {}
