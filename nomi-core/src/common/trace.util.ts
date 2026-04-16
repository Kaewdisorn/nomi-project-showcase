import { LogContext } from '@nomi-labs/nomi-shared';
import { ExecutionTrace } from '@common/types/trace.types';

export function traceToLogContext(trace: ExecutionTrace): LogContext {
  return {
    traceId: trace.traceId,
    userId: trace.userId,
    featureId: trace.featureId,
    service: 'nomi-core',
  };
}
