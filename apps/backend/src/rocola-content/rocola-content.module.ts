import { Module } from '@nestjs/common';
import { RocolaContentService } from './rocola-content.service.js';
import { ItunesPreviewProvider } from './itunes-preview-provider.js';
import { SONG_PREVIEW_PROVIDER } from './song-preview-provider.js';

@Module({
  providers: [
    { provide: SONG_PREVIEW_PROVIDER, useClass: ItunesPreviewProvider },
    RocolaContentService,
  ],
  exports: [RocolaContentService],
})
export class RocolaContentModule {}
