import { TokenUsage } from '@modules/cost/types/cost.types';
import { ModelMessage } from 'ai';

export interface ProviderConfig {
  name: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface IProviderAdapter {
  readonly name: string;
  generate(
    messages: ModelMessage[],
    config: ProviderConfig,
  ): Promise<{ raw: string; usage: TokenUsage }>;
}

export const PROVIDER_ADAPTER = Symbol('PROVIDER_ADAPTER');
