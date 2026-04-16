export interface ModelPricing {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

export type ModelPricingMap = Record<string, ModelPricing>;

export const MODEL_PRICING_TOKEN = Symbol('MODEL_PRICING');
