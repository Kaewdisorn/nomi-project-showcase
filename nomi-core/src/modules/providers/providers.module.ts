import { GeminiAdapter } from '@modules/providers/gemini.adapter';
import { PROVIDER_ADAPTER } from '@modules/providers/types/provider.types';
import { Module } from '@nestjs/common';

@Module({
  providers: [
    GeminiAdapter,
    {
      provide: PROVIDER_ADAPTER,
      useFactory: (gemini: GeminiAdapter) => [gemini],
      inject: [GeminiAdapter],
    },
  ],
  exports: [PROVIDER_ADAPTER],
})
export class ProvidersModule {}
