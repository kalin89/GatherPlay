import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppGateway } from './websocket/app.gateway.js';
import { RoomModule } from './room/room.module.js';

@Module({
  imports: [RoomModule],
  controllers: [AppController],
  providers: [AppService, AppGateway],
})
export class AppModule {}
