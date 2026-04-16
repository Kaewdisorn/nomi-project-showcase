import { Inject, Injectable } from '@nestjs/common';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import {
  MODEL_PRICING_TOKEN,
  ModelPricingMap,
} from '@modules/cost/types/pricing.types';
import { ExecutionTrace } from '@common/types/trace.types';
import { CostRecord, TokenUsage } from '@modules/cost/types/cost.types';

@Injectable()
export class CostTrackerService {
  private readonly records: CostRecord[] = [];

  constructor(
    private readonly logger: NomiLoggerService,
    @Inject(MODEL_PRICING_TOKEN)
    private readonly pricing: ModelPricingMap,
  ) {}

  record(params: {
    trace: ExecutionTrace;
    provider: string;
    model: string;
    usage: TokenUsage;
  }): CostRecord {
    const modelPricing = this.pricing[params.model];

    if (!modelPricing) {
      throw new Error(
        `Unknown model "${params.model}" — add it to MODEL_PRICING before use`,
      );
    }

    const inputCost =
      (params.usage.inputTokens / 1_000_000) * modelPricing.input;
    const outputCost =
      (params.usage.outputTokens / 1_000_000) * modelPricing.output;

    const record: CostRecord = {
      trace: params.trace,
      provider: params.provider,
      model: params.model,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      timestamp: new Date().toISOString(),
    };

    this.records.push(record);

    this.logger.info(
      'Cost recorded',
      {
        traceId: params.trace.traceId,
        userId: params.trace.userId,
        featureId: params.trace.featureId,
        service: 'nomi-core',
      },
      {
        model: params.model,
        totalCost: record.totalCost,
      },
    );

    return record;
  }
}
