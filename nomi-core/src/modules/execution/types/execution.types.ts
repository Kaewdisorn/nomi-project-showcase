// ── Proto-mirroring types (derived from core.proto — proto is source of truth) ──
// These types cross the gRPC boundary — never import AI SDK or Zod types here.

import { ExecutionTrace } from '@common/types/trace.types';
import { CostRecord, TokenUsage } from '@modules/cost/types/cost.types';
import { ProviderConfig } from '@modules/providers/types/provider.types';

export const ChatRole = {
  UNSPECIFIED: 0,
  USER: 1,
  ASSISTANT: 2,
  SYSTEM: 3,
} as const;
export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ExecutionPolicy {
  maxRetries?: number;
  timeoutMs?: number;
  fallbackProvider?: ProviderConfig;
}

export interface ExecutionRequest {
  messages: ChatMessage[];
  provider: ProviderConfig;
  policy?: ExecutionPolicy;
  trace: ExecutionTrace;
}

export interface ExecutionResponse {
  raw: string;
  parsedJson?: string;
  valid: boolean;
  usage: TokenUsage;
  cost: CostRecord;
  durationMs: number;
  attempt: number;
  traceId: string;
  error?: string;
  provider: string; // which provider actually served the response
  model: string; // which model actually served the response
}
