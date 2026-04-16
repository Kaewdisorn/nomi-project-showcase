# GitHub Copilot Instructions — nomi-core

nomi-core is the **AI Execution Engine** for the Nomi platform.
It is a NestJS gRPC microservice that handles every LLM call in the ecosystem.

This file defines coding rules, patterns, and constraints that Copilot must follow
when assisting on this codebase.

---

## What nomi-core Is

- Pure AI execution infrastructure — no business logic, ever
- A gRPC microservice consumed by nomi-biseo (and eventually nomi-company)
- Responsible for: LLM provider abstraction, retry/fallback, Zod validation, cost tracking, structured logging

## What nomi-core Must NEVER Do

- Contain business logic or know about specific features/users
- Call LLM providers outside the `src/providers/` adapter layer
- Skip cost tracking on any execution
- Throw on LLM failure — always return a structured `ExecutionResponse`
- Log without a `LogContext` (traceId, userId, featureId, service)
- Import `nestjs-pino` or `PinoLogger` — use `NomiLoggerService` only

---

## Tech Stack

| Concern           | Technology                                                                              |
| ----------------- | --------------------------------------------------------------------------------------- |
| Framework         | NestJS 11                                                                               |
| Transport         | gRPC (`@nestjs/microservices` + `Transport.GRPC`)                                       |
| Language          | TypeScript 5 (strict mode)                                                              |
| AI SDK            | Vercel AI SDK v6 (`ai`, `@ai-sdk/google`)                                               |
| Schema Validation | Zod v4                                                                                  |
| Logging           | `@nomi-labs/nomi-logger` (`NomiLoggerService`)                                          |
| Testing           | Vitest                                                                                  |
| Contracts         | `@nomi-labs/nomi-shared` (public types), module-level `types/` folders (internal types) |

---

## Project Structure

```
src/
  main.ts                          ← gRPC bootstrap (Transport.GRPC, port 4000)
  app.module.ts                    ← Root module: ConfigModule, NomiLoggerModule, feature modules

  proto/
    core.proto                     ← Protobuf service definition (source of truth for gRPC API)

  common/                          ← Cross-cutting utilities (no business logic)
    resolve-api-key.util.ts        ← Reads API keys from Docker secrets or env vars
    trace.util.ts                  ← traceToLogContext() — builds LogContext from ExecutionTrace
    types/
      trace.types.ts               ← ExecutionTrace interface

  modules/
    execution/                     ← Execution domain module
      execution.controller.ts      ← @GrpcMethod handlers (Execute, ...)
      execution.service.ts         ← Orchestrates: maps gRPC → internal, delegates to engine
      execution.module.ts
      types/
        execution.types.ts         ← ChatRole, ChatMessage, ExecutionPolicy, ExecutionRequest, ExecutionResponse
        execution.internal.types.ts ← InternalExecutionRequest (AI SDK types, never crosses gRPC)

    health/                        ← Health check module
      health.controller.ts         ← @GrpcMethod handler (Health)
      health.module.ts

    providers/                     ← Provider type definitions
      types/
        provider.types.ts          ← IProviderAdapter, ProviderConfig, PROVIDER_ADAPTER token

    cost/                          ← Cost tracking type definitions
      types/
        cost.types.ts              ← TokenUsage, CostRecord

  providers/                       ← Provider adapter implementations
    gemini.adapter.ts              ← IProviderAdapter for Google Gemini via Vercel AI SDK
    providers.module.ts            ← Registers all adapters under PROVIDER_ADAPTER token

  execution/                       ← Core execution engine (retry, fallback, validation)
    execution-engine.service.ts    ← Retry loop, fallback, Zod validation, cost recording

test/
  test-client.ts                   ← Manual gRPC integration test client
```

---

## Architecture Rules

### 1. Execution Flow — Never Bypass

```
gRPC caller
  → ExecutionController (@GrpcMethod)
  → ExecutionService (maps gRPC → InternalExecutionRequest)
  → ExecutionEngineService.execute()
  → IProviderAdapter.generate()     ← only LLM calls happen here
  → CostTrackerService.record()     ← always, even on failure
  → ExecutionResponse               ← always returned, never thrown
```

### 2. Types: Two Layers

| Layer                              | Location                      | Crosses gRPC? |
| ---------------------------------- | ----------------------------- | ------------- |
| Public types (shared with callers) | `@nomi-labs/nomi-shared`      | ✅ Yes        |
| Internal types (nomi-core only)    | Module-level `types/` folders | ❌ Never      |

- `LogContext` → from `@nomi-labs/nomi-shared`
- `ExecutionTrace` → from `src/common/types/trace.types.ts`
- `ProviderConfig`, `IProviderAdapter`, `PROVIDER_ADAPTER` → from `src/modules/providers/types/provider.types.ts`
- `TokenUsage`, `CostRecord` → from `src/modules/cost/types/cost.types.ts`
- `ChatRole`, `ChatMessage`, `ExecutionPolicy`, `ExecutionRequest`, `ExecutionResponse` → from `src/modules/execution/types/execution.types.ts`
- `InternalExecutionRequest` → from `src/modules/execution/types/execution.internal.types.ts`
- Never import from `src/modules/execution/` inside `src/providers/` — use `src/modules/providers/types/` or `src/modules/cost/types/` instead

### 3. gRPC Controller Rules

- Use `@GrpcMethod('CoreService', 'MethodName')` — names must match `core.proto` exactly
- Method names in the controller must match the proto RPC names (PascalCase)
- The controller only maps gRPC data → `InternalExecutionRequest` and delegates; no logic here

### 4. Logging Rules

- **Always** inject `NomiLoggerService` via standard NestJS DI (no decorator needed)
- **Always** call `traceToLogContext(trace)` to build the `LogContext` from an `ExecutionTrace`
- **Always** pass `LogContext` as the second argument
- Use `meta` (third argument) for structured data: `{ model, attempt, totalCost, ... }`
- Never use `console.log` anywhere

```typescript
// ✅ Correct
this.logger.warn('Attempt failed', ctx, { attempt, message });
this.logger.info('Cost recorded', ctx, { model, totalCost });

// ❌ Wrong — no LogContext
this.logger.warn({ traceId, msg: 'Attempt failed' });
console.log('Cost:', totalCost);
```

### 5. Error Handling Rules

- `ExecutionEngineService` **never throws** — always returns `ExecutionResponse`
- LLM errors are caught, logged, and retried — final failure returns `{ valid: false, error: '...' }`
- Zod validation failure sets `valid: false` — never throws, never retries
- Unknown model in pricing → throw immediately (fail-fast at startup, not silently at runtime)
- Provider adapter not found → log error, return `null` from `tryWithRetries`

### 6. Retry & Fallback

```
Primary provider:
  attempt 1 → fail → wait 1s
  attempt 2 → fail → wait 2s
  attempt 3 → fail → exhausted

  ↓ if fallbackProvider configured

Fallback provider:
  attempt 1–3 (same backoff)

  ↓ if all exhausted

return errorResponse(...)
```

- Backoff: `1000ms * 2^(attempt-1)` — 1s, 2s, 4s
- Timeout enforced per-attempt via `Promise.race()`
- Default: maxRetries=3, timeoutMs=30_000

### 7. Adding a New LLM Provider

1. Create `src/providers/<name>.adapter.ts` implementing `IProviderAdapter` from `src/modules/providers/types/provider.types.ts`
2. Set `readonly name = '<name>'` — must match `ProviderConfig.name` from the caller
3. Register in `src/providers/providers.module.ts` under `PROVIDER_ADAPTER` token (add to `inject` + `useFactory` array)
4. Add model pricing entry to `MODEL_PRICING` env var
5. No changes to the execution engine or controller needed

```typescript
// Template — imports from module-level type files
import {
  IProviderAdapter,
  ProviderConfig,
} from 'src/modules/providers/types/provider.types';
import { TokenUsage } from 'src/modules/cost/types/cost.types';

@Injectable()
export class MyAdapter implements IProviderAdapter {
  readonly name = 'my-provider';

  constructor(private readonly logger: NomiLoggerService) {}

  async generate(
    messages: ModelMessage[],
    config: ProviderConfig,
  ): Promise<{ raw: string; usage: TokenUsage }> {
    // call the SDK, map to { raw, usage }
    this.logger.info(
      'Generation complete',
      {
        traceId: 'provider',
        userId: 'system',
        featureId: 'generation',
        service: 'nomi-core',
      },
      { model: config.model, totalTokens: usage.totalTokens },
    );
    return { raw, usage };
  }
}
```

---

## Testing Rules

- Test framework: **Vitest** — use `vi.fn()`, `vi.mock()`, `vi.useFakeTimers()`
- **No real API calls** — always mock `ai` and `@ai-sdk/google`
- **No NestJS TestingModule** in unit tests — instantiate services directly in `beforeEach`
- Mock `NomiLoggerService` as a plain object: `{ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }`
- Use factory functions (`makeAdapter()`, `makeRequest()`) for test data builders
- `vi.useFakeTimers()` for retry/backoff tests — always call `vi.useRealTimers()` in `afterEach`

```typescript
// ✅ Correct mock pattern
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as NomiLoggerService;

service = new CostTrackerService(mockLogger, TEST_PRICING);
```

---

## Environment Variables

| Variable         | Required | Description                                            |
| ---------------- | -------- | ------------------------------------------------------ |
| `GEMINI_API_KEY` | Yes      | Google Gemini API key (or Docker secret)               |
| `MODEL_PRICING`  | Yes      | JSON map: `{"model":{"input":USD/1M,"output":USD/1M}}` |
| `CORE_GRPC_PORT` | No       | gRPC port (default: `4000`)                            |
| `LOG_LEVEL`      | No       | `debug` / `info` / `warn` / `error` (default: `info`)  |
| `NODE_ENV`       | No       | `production` → JSON logs; otherwise pretty-printed     |
| `DATABASE_URL`   | Post-MVP | PostgreSQL connection string for Prisma                |

---

## gRPC API — `nomi.core.CoreService`

Defined in `src/proto/core.proto`. All callers must use the proto definition.

| RPC                | Request                | Response                | Status   |
| ------------------ | ---------------------- | ----------------------- | -------- |
| `Execute`          | `ExecutionRequest`     | `ExecutionResponse`     | ✅ Live  |
| `GetCostByUser`    | `CostByUserRequest`    | `CostSummary`           | ✅ Live  |
| `GetCostByFeature` | `CostByFeatureRequest` | `CostSummary`           | ✅ Live  |
| `Health`           | `Empty`                | `HealthResponse`        | ✅ Live  |
| `ExecuteStream`    | `ExecutionRequest`     | `stream ExecutionChunk` | Post-MVP |

---

## What Copilot Should NOT Suggest

- `console.log` — use `NomiLoggerService`
- `@InjectPinoLogger` or `PinoLogger` — removed, replaced by `NomiLoggerService`
- `@MessagePattern` — replaced by `@GrpcMethod`
- `Transport.TCP` — replaced by `Transport.GRPC`
- `CORE_PATTERNS` — removed, gRPC uses proto service definitions
- Imports from `src/contracts/` — deleted; use module-level `types/` folders instead
- Any business logic in this service
- Throwing errors from `ExecutionEngineService` — always return `ExecutionResponse`
- Logging without a `LogContext`
