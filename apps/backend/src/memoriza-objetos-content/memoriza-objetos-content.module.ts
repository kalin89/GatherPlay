import { Module } from '@nestjs/common';
import { MemorizaObjetosContentService } from './memoriza-objetos-content.service.js';

@Module({
  providers: [MemorizaObjetosContentService],
  exports: [MemorizaObjetosContentService],
})
export class MemorizaObjetosContentModule {}
