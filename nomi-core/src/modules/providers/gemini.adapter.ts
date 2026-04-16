import { Injectable } from '@nestjs/common';
import { IProviderAdapter, ProviderConfig } from './types/provider.types';
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProvider,
} from '@ai-sdk/google';
import { resolveApiKey } from '@common/resolve-api-key.util';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import { generateText, ModelMessage } from 'ai';
import { TokenUsage } from '../cost/types/cost.types';

@Injectable()
export class GeminiAdapter implements IProviderAdapter {
  readonly name = 'gemini';
  private google: GoogleGenerativeAIProvider | null = null;

  constructor(private readonly logger: NomiLoggerService) {}

  private getClient(): GoogleGenerativeAIProvider {
    if (!this.google) {
      this.google = createGoogleGenerativeAI({
        apiKey: resolveApiKey('GEMINI_API_KEY'),
      });
    }

    return this.google;
  }

  async generate(
    messages: ModelMessage[],
    config: ProviderConfig,
  ): Promise<{ raw: string; usage: TokenUsage }> {
    const client = this.getClient();

    const result = await generateText({
      model: client(config.model),
      messages,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
    });

    const usage: TokenUsage = {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: result.usage?.totalTokens ?? 0,
    };

    this.logger.debug(
      'Gemini generation complete',
      {
        traceId: 'provider',
        userId: 'system',
        featureId: 'generation',
        service: 'nomi-core',
      },
      { model: config.model, totalTokens: usage.totalTokens },
    );

    return { raw: result.text, usage };
  }
}
