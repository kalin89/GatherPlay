import { Module } from '@nestjs/common';
import {
  loadRoomLifecycleConfig,
  ROOM_LIFECYCLE_CONFIG,
  type RoomLifecycleConfig,
} from './room-lifecycle.config.js';
import { RoomGateway } from './room.gateway.js';
import { RoomService } from './room.service.js';

@Module({
  providers: [
    {
      provide: ROOM_LIFECYCLE_CONFIG,
      useFactory: (): RoomLifecycleConfig =>
        loadRoomLifecycleConfig(process.env),
    },
    RoomService,
    RoomGateway,
  ],
  exports: [RoomService],
})
export class RoomModule {}
