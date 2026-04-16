import { ExecutionTrace } from '@common/types/trace.types';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostRecord {
  trace: ExecutionTrace; // embedded — matches proto CostRecord.trace
  provider: string;
  model: string;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  timestamp: string;
}
