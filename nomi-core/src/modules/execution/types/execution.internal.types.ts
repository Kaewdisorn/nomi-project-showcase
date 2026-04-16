// ── Internal-only types — never cross gRPC boundary ──

import { ModelMessage } from 'ai';
import { ZodType } from 'zod';
import { ExecutionPolicy } from './execution.types';
import { ProviderConfig } from '@modules/providers/types/provider.types';
import { ExecutionTrace } from '@common/types/trace.types';

export interface InternalExecutionRequest {
  messages: ModelMessage[]; // AI SDK type — converted from ChatMessage in controller
  provider: ProviderConfig;
  policy?: ExecutionPolicy;
  trace: ExecutionTrace;
  outputSchema?: ZodType;
}
