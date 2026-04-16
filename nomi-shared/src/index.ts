// ── TCP Message Patterns ──
export const CORE_PATTERNS = {
    EXECUTE: 'core.execute',
    EXECUTE_STREAM: 'core.execute.stream',
    COST_BY_USER: 'core.cost.byUser',
    COST_BY_FEATURE: 'core.cost.byFeature',
    HEALTH: 'core.health',
} as const;

// ── Execution Trace ──
export interface ExecutionTrace {
    userId: string;
    featureId: string;
    traceId: string;
}

// ── Execution Policy ──
export interface ExecutionPolicy {
    maxRetries?: number;
    timeoutMs?: number;
    fallbackProvider?: ProviderConfig;
}

// ── Cost Record ──
export interface CostRecord {
    userId: string;
    featureId: string;
    provider: string;
    model: string;
    inputCost: number;
    outputCost: number;
    totalCost: number;
    timestamp: Date;
}

// ── Provider Configuration ──
export interface ProviderConfig {
    name: string;
    model: string;
    temperature?: number;
    maxOutputTokens?: number;
}

// ── Token Usage ──
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// ── Execution Request ──
export interface ExecutionRequest {
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
    provider: ProviderConfig;
    policy?: ExecutionPolicy;
    trace: ExecutionTrace;
}

// ── Execution Response ──
export interface ExecutionResponse<T = unknown> {
    raw: string;
    parsed?: T;
    valid: boolean;
    usage: TokenUsage;
    cost: CostRecord;
    durationMs: number;
    attempt: number;
    traceId: string;
    error?: string;
}

// Logging
export interface LogContext {
    traceId: string;   // ties logs across services for a single request
    userId: string;    // every call originates from a user
    featureId: string; // identifies which feature triggered the call
    service: string;   // name of the calling service, e.g. 'nomi-core'
}