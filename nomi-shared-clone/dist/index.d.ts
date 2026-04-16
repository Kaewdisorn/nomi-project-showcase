export declare const CORE_PATTERNS: {
    readonly EXECUTE: "core.execute";
    readonly EXECUTE_STREAM: "core.execute.stream";
    readonly COST_BY_USER: "core.cost.byUser";
    readonly COST_BY_FEATURE: "core.cost.byFeature";
    readonly HEALTH: "core.health";
};
export interface ExecutionTrace {
    userId: string;
    featureId: string;
    traceId: string;
}
export interface ExecutionPolicy {
    maxRetries?: number;
    timeoutMs?: number;
    fallbackProvider?: ProviderConfig;
}
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
export interface ProviderConfig {
    name: string;
    model: string;
    temperature?: number;
    maxOutputTokens?: number;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
export interface ExecutionRequest {
    messages: {
        role: 'user' | 'assistant' | 'system';
        content: string;
    }[];
    provider: ProviderConfig;
    policy?: ExecutionPolicy;
    trace: ExecutionTrace;
}
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
export interface LogContext {
    traceId: string;
    userId: string;
    featureId: string;
    service: string;
}
