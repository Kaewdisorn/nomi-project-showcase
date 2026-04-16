import { Inject, Injectable } from '@nestjs/common';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import {
  ChatRole,
  ExecutionRequest,
  ExecutionResponse,
} from './types/execution.types';
import { InternalExecutionRequest } from './types/execution.internal.types';
import {
  IProviderAdapter,
  PROVIDER_ADAPTER,
  ProviderConfig,
} from '../providers/types/provider.types';
import { LogContext } from '@nomi-labs/nomi-shared';
import { traceToLogContext } from '@common/trace.util';
import { TokenUsage } from '@modules/cost/types/cost.types';
import { CostTrackerService } from '@modules/cost/cost-tracker.service';

const ROLE_MAP: Record<number, 'user' | 'assistant' | 'system'> = {
  [ChatRole.USER]: 'user',
  [ChatRole.ASSISTANT]: 'assistant',
  [ChatRole.SYSTEM]: 'system',
};

@Injectable()
export class ExecutionService {
  constructor(
    private readonly logger: NomiLoggerService,
    @Inject(PROVIDER_ADAPTER) private readonly adapters: IProviderAdapter[],
    private readonly costTracker: CostTrackerService,
  ) {}

  async execute(data: ExecutionRequest): Promise<ExecutionResponse> {
    const ctx = traceToLogContext(data.trace);
    const maxRetries = data.policy?.maxRetries ?? 3;
    const timeoutMs = data.policy?.timeoutMs ?? 30_000;
    const start = Date.now();

    const internal: InternalExecutionRequest = {
      ...data,
      messages: data.messages.map((m) => ({
        role: ROLE_MAP[m.role] ?? 'user',
        content: m.content,
      })),
    };

    this.logger.info('Received execution request', ctx, {
      provider: data.provider?.name,
      model: data.provider?.model,
      messageCount: data.messages?.length,
    });

    const primaryResult = await this.tryWithRetries(
      internal,
      internal.provider,
      maxRetries,
      timeoutMs,
      ctx,
      start,
    );

    if (primaryResult) return primaryResult;

    if (internal.policy?.fallbackProvider) {
      this.logger.warn('Primary provider exhausted, trying fallback', ctx);

      const fallbackResult = await this.tryWithRetries(
        internal,
        internal.policy.fallbackProvider,
        maxRetries,
        timeoutMs,
        ctx,
        start,
      );

      if (fallbackResult) return fallbackResult;
    }

    return this.buildErrorResponse(
      'All retries exhausted across all providers',
      ctx.traceId,
      maxRetries,
      start,
    );
  }

  // ─── Private: Retry Loop ────────────────────────────────────────────────────
  private async tryWithRetries(
    request: InternalExecutionRequest,
    providerConfig: ProviderConfig,
    maxRetries: number,
    timeoutMs: number,
    ctx: LogContext,
    start: number,
  ): Promise<ExecutionResponse | null> {
    const adapter = this.findAdapter(providerConfig.name);

    if (!adapter) {
      this.logger.error(
        'Provider adapter not found',
        ctx,
        new Error(`No adapter registered for provider: ${providerConfig.name}`),
        { provider: providerConfig.name },
      );
      return null;
    }

    // Process the request with retries and timeout
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { raw, usage } = await this.generateWithTimeout(
          adapter,
          request,
          providerConfig,
          timeoutMs,
        );

        const { valid, parsedJson } = this.validateOutput(raw, request);
        const durationMs = Date.now() - start;

        this.logSuccess(providerConfig, attempt, durationMs, usage, ctx);

        return this.buildResponse({
          raw,
          usage,
          valid,
          parsedJson,
          durationMs,
          attempt,
          request,
          providerConfig,
        });
      } catch (err) {
        const error = this.toError(err);
        this.logFailure(providerConfig, attempt, error, ctx);

        const hasMoreAttempts = attempt < maxRetries;
        if (hasMoreAttempts) {
          await this.exponentialBackoff(attempt);
        }
      }
    }

    return null;
  }

  // ─── Private: Generation ────────────────────────────────────────────────────
  private findAdapter(providerName: string): IProviderAdapter | undefined {
    return this.adapters.find((a) => a.name === providerName);
  }

  private async generateWithTimeout(
    adapter: IProviderAdapter,
    request: InternalExecutionRequest,
    providerConfig: ProviderConfig,
    timeoutMs: number,
  ): Promise<{ raw: string; usage: TokenUsage }> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    );

    return Promise.race([
      adapter.generate(request.messages, providerConfig),
      timeout,
    ]);
  }

  // ─── Private: Validation ────────────────────────────────────────────────────
  private validateOutput(
    raw: string,
    request: InternalExecutionRequest,
  ): { valid: boolean; parsedJson: string | undefined } {
    if (!request.outputSchema) {
      return { valid: true, parsedJson: undefined };
    }

    const result = request.outputSchema.safeParse(JSON.parse(raw));

    if (result.success) {
      return { valid: true, parsedJson: JSON.stringify(result.data) };
    } else {
      return { valid: false, parsedJson: undefined };
    }
  }

  // ─── Private: Response Builders ─────────────────────────────────────────────
  private buildResponse({
    raw,
    usage,
    valid,
    parsedJson,
    durationMs,
    attempt,
    request,
    providerConfig,
  }: {
    raw: string;
    usage: TokenUsage;
    valid: boolean;
    parsedJson: string | undefined;
    durationMs: number;
    attempt: number;
    request: InternalExecutionRequest;
    providerConfig: ProviderConfig;
  }): ExecutionResponse {
    const cost = this.costTracker.record({
      trace: request.trace,
      provider: providerConfig.name,
      model: providerConfig.model,
      usage,
    });

    return {
      raw,
      parsedJson,
      valid,
      usage,
      cost,
      durationMs,
      attempt,
      traceId: request.trace.traceId,
      provider: providerConfig.name,
      model: providerConfig.model,
    };
  }

  private buildErrorResponse(
    message: string,
    traceId: string,
    attempt: number,
    start: number,
  ): ExecutionResponse {
    const emptyUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    const emptyProvider = 'none';

    return {
      raw: '',
      valid: false,
      error: message,
      usage: emptyUsage,
      cost: {
        trace: { traceId, userId: '', featureId: '' },
        provider: emptyProvider,
        model: emptyProvider,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        timestamp: new Date().toISOString(),
      },
      durationMs: Date.now() - start,
      attempt,
      traceId,
      provider: emptyProvider,
      model: emptyProvider,
    };
  }

  // ─── Private: Logging ───────────────────────────────────────────────────────
  private logSuccess(
    providerConfig: ProviderConfig,
    attempt: number,
    durationMs: number,
    usage: TokenUsage,
    ctx: LogContext,
  ): void {
    this.logger.info('Generation succeeded', ctx, {
      provider: providerConfig.name,
      model: providerConfig.model,
      attempt,
      durationMs,
      totalTokens: usage.totalTokens,
    });
  }

  private logFailure(
    providerConfig: ProviderConfig,
    attempt: number,
    error: Error,
    ctx: LogContext,
  ): void {
    this.logger.warn('Attempt failed', ctx, {
      provider: providerConfig.name,
      model: providerConfig.model,
      attempt,
      message: error.message,
    });
  }

  // ─── Private: Utilities ─────────────────────────────────────────────────────
  private async exponentialBackoff(attempt: number): Promise<void> {
    const backoffMs = 1000 * Math.pow(2, attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  private toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
  }
}
