# nomi-core — Build Checklist (From Scratch)

Step-by-step guide to build nomi-core from a fresh `nest new` scaffold.
Every step includes the exact code to write and a checklist to verify before moving on.

Updated 2026-03-31.

---

## ⚠ Code Review — Current Issues (2026-04-08)

### Critical Blockers (Must Fix Before MVP)

| #   | Issue                                                                                                                                                            | Location             | Severity    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------- |
| 4   | **Cost module not implemented** — `CostTrackerService`, `model-pricing.config.ts`, `cost.module.ts` all missing; cost is hardcoded to zeros in `buildResponse()` | `src/modules/cost/`  | 🔴 Critical |
| 6   | **No unit tests** — zero spec files exist; no test coverage                                                                                                      | `src/**/\__tests__/` | 🔴 Critical |

### Architecture Debt

| #   | Issue                                                                                                                                            | Details                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 9   | **Timeout timer leak** — `setTimeout` in `generateWithTimeout` is never cleared on success, leaking handles                                      | Wrap with `AbortController` or track handle and `clearTimeout` on success path        |
| 11  | **Unused packages** — `@nestjs/platform-express` and `supertest` are not needed for a pure gRPC microservice                                     | Remove from `package.json`                                                            |
| 12  | **`providers.module.ts` at wrong location** — sits at `src/providers/providers.module.ts`; should be `src/modules/providers/providers.module.ts` | Move file to complete the migration of `src/providers/` into `src/modules/providers/` |
| 13  | **`GetCostByUser` / `GetCostByFeature` not in controller** — `CostTrackerService` is commented out in `ExecutionController`                      | Add handlers once `CostModule` is implemented (Step 8 follow-up)                      |

### Resolved (since 2026-03-31)

- ✅ **#1 FIXED** — `console.log` removed from `execution.service.ts`
- ✅ **#2 FIXED** — `ExecutionService` now has full retry/fallback/Zod/timeout logic; no longer a stub
- ✅ **#3 FIXED** — `src/execution/` orphan deleted; engine logic merged directly into `ExecutionService`
- ✅ **#5 FIXED** — `ExecutionModule` now imports `ProvidersModule`
- ✅ **#7 FIXED** — Dual execution services merged into single `ExecutionService`
- ✅ **#8 FIXED** — `src/execution/` directory deleted
- ✅ **#10 FIXED** — `resolveApiKey` now cached via `getClient()` lazy init in `GeminiAdapter`

### Resolved / Good (all-time)

- ✅ Proto file complete and matches architecture spec
- ✅ `main.ts` bootstraps gRPC correctly on `Transport.GRPC`
- ✅ `app.module.ts` imports `ConfigModule`, `NomiLoggerModule`, `HealthModule`, `ExecutionModule`
- ✅ Health endpoint working
- ✅ Type definitions distributed properly across module-level type files
- ✅ `traceToLogContext()` utility working
- ✅ `resolveApiKey()` supports Docker secrets + env vars
- ✅ `GeminiAdapter` implements `IProviderAdapter` correctly; API key cached at first call
- ✅ `ProvidersModule` registers adapters under `PROVIDER_ADAPTER` token
- ✅ `vitest.config.ts` configured with SWC plugin
- ✅ `.env.example` created with all required vars
- ✅ `nest-cli.json` has proto asset copy
- ✅ `ExecutionService` retry/fallback/Zod/timeout logic fully implemented
- ✅ `ExecutionModule` imports `ProvidersModule`; `PROVIDER_ADAPTER` available at runtime

---

## Stages

| Stage                    | Scope                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **MVP** (Steps 0–11)     | Scaffold, gRPC transport, contracts, execution engine, providers, cost tracking, tests, integration client |
| **Post-MVP** (Steps 12+) | gRPC streaming, Prisma persistence, gRPC reflection, health checks, nomi-biseo integration                 |

---

## Prerequisites

Before starting, ensure:

- [x] Node.js 22+ and npm 10+ installed
- [x] NestJS CLI installed globally: `npm i -g @nestjs/cli`
- [x] `@nomi-labs/nomi-logger` is published with `NomiLoggerModule`, `NomiLoggerService`
- [ ] `@nomi-labs/nomi-shared` updated: proto moved in, duplicate TS types removed, only `LogContext` remains as a hand-written TypeScript type, `proto/core.proto` shipped as package asset
- [ ] Google Gemini API key available

---

# MVP Stage

---

## Step 0 — Scaffold Project with NestJS CLI

**What:** Create a fresh NestJS project using the CLI. This gives us the standard project structure, tsconfig, eslint, prettier, and package.json.

```powershell
# From the workspace root (nomi-workspace/)
nest new nomi-core --package-manager npm --strict
cd nomi-core
```

**Result:** A working NestJS project with:

```
nomi-core/
  src/
    app.controller.ts      ← will be deleted
    app.controller.spec.ts  ← will be deleted
    app.module.ts           ← will be rewritten
    app.service.ts          ← will be deleted
    main.ts                 ← will be rewritten
  test/
    app.e2e-spec.ts         ← will be deleted
    jest-e2e.json           ← will be deleted
  nest-cli.json
  package.json
  tsconfig.json
  tsconfig.build.json
  .eslintrc.js
  .prettierrc
```

### 0a — Clean up scaffold files

Delete the default scaffold files we don't need:

```powershell
# Delete default scaffold files
Remove-Item src/app.controller.ts
Remove-Item src/app.controller.spec.ts
Remove-Item src/app.service.ts
Remove-Item test/app.e2e-spec.ts
Remove-Item test/jest-e2e.json
```

### 0b — Create directory structure

```powershell
# Create all directories
New-Item -ItemType Directory -Force -Path src/proto
New-Item -ItemType Directory -Force -Path src/contracts
New-Item -ItemType Directory -Force -Path src/execution/__tests__
New-Item -ItemType Directory -Force -Path src/providers/__tests__
New-Item -ItemType Directory -Force -Path src/cost/__tests__
New-Item -ItemType Directory -Force -Path src/common
```

**Target structure (empty, ready to fill):**

```
src/
  main.ts
  app.module.ts
  proto/
  contracts/
  execution/
    __tests__/
  providers/
    __tests__/
  cost/
    __tests__/
  common/
test/
```

- [x] `nest new nomi-core` completed
- [x] Default scaffold files deleted (`app.controller.ts`, `app.service.ts`, etc. removed)
- [x] Directory structure created — `src/proto/`, `src/common/`, `src/common/types/`, `src/providers/` (old location), `src/modules/execution/`, `src/modules/execution/types/`, `src/modules/health/`, `src/modules/providers/types/`, `src/modules/cost/types/` all exist; `src/contracts/` deleted (types distributed to module-level files)
- [x] `npm run build` succeeds
- [x] Done

---

## Step 1 — Install Dependencies

**What:** Install all MVP dependencies: gRPC, AI SDK, Zod, nomi packages, Vitest. Remove Jest (NestJS default).

### 1a — Install production dependencies

```powershell
npm install @nestjs/microservices @nestjs/config @grpc/grpc-js @grpc/proto-loader ai @ai-sdk/google zod @nomi-labs/nomi-logger @nomi-labs/nomi-shared dotenv
```

### 1b — Install dev dependencies

```powershell
npm install -D vitest @vitest/coverage-v8 unplugin-swc @swc/core
```

### 1c — Remove Jest (NestJS default test runner)

```powershell
npm uninstall jest @types/jest ts-jest @nestjs/testing
```

### 1d — Create `vitest.config.ts`

```typescript
// vitest.config.ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    alias: {
      src: './src',
    },
  },
  plugins: [swc.vite()],
});
```

### 1e — Update `package.json` scripts

Replace the Jest-based test scripts:

```jsonc
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:client": "npx ts-node -r dotenv/config test/test-client.ts",
  },
}
```

### 1f — Update `nest-cli.json`

Add proto file asset copy so `.proto` files end up in `dist/`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "assets": ["proto/*.proto"],
    "watchAssets": true
  }
}
```

### 1g — Create `.env.example`

```env
# Required
GEMINI_API_KEY=your-gemini-api-key-here
MODEL_PRICING={"gemini-2.0-flash":{"input":0.10,"output":0.40},"gemini-2.5-flash-preview-04-17":{"input":0.15,"output":0.60}}

# Optional
CORE_GRPC_PORT=4000
LOG_LEVEL=info
NODE_ENV=development
```

### 1h — Create `.env`

```powershell
copy .env.example .env
# Edit .env and set your actual GEMINI_API_KEY
```

- [x] Production dependencies installed — `@grpc/grpc-js`, `@grpc/proto-loader`, `ai`, `@ai-sdk/google`, `zod`, `dotenv` added
- [x] Dev dependencies installed — `vitest`, `@vitest/coverage-v8`, `unplugin-swc`, `@swc/core` installed
- [x] Jest removed, Vitest configured — Jest uninstalled; `vitest.config.ts` created with `unplugin-swc`
- [x] `vitest.config.ts` created
- [x] `package.json` scripts updated — replaced Jest scripts with `vitest run`, `vitest`, `vitest run --coverage`
- [x] `nest-cli.json` — proto asset copy added (`"assets": ["proto/*.proto"]`) for local `src/proto/core.proto` (temporary until nomi-shared ships it)
- [x] `.env.example` and `.env` created — ✅ `NODE_ENV=development` added to `.env` (was missing, caused startup crash)
- [x] Done

---

## Step 2 — Define the Protobuf Contract

**What:** The `.proto` file lives in `@nomi-labs/nomi-shared` and is the single source of truth for the entire gRPC API. nomi-core and all other consumers reference it from the package — no local copy.

**File:** `packages/nomi-shared/proto/core.proto` (in the nomi-shared repo)

> Make sure `nomi-shared/package.json` includes: `"files": ["dist", "proto"]` so the `.proto` is shipped with the npm package.

```protobuf
syntax = "proto3";

package nomi.core;

service CoreService {
  rpc Execute (ExecutionRequest) returns (ExecutionResponse);
  rpc GetCostByUser (CostByUserRequest) returns (CostSummary);
  rpc GetCostByFeature (CostByFeatureRequest) returns (CostSummary);
  rpc Health (Empty) returns (HealthResponse);
}

message Empty {}

message HealthResponse {
  string status = 1;
  int64 timestamp_ms = 2;  // epoch ms — proto standard, avoids ISO string parsing
}

enum ChatRole {
  CHAT_ROLE_UNSPECIFIED = 0;
  CHAT_ROLE_USER = 1;
  CHAT_ROLE_ASSISTANT = 2;
  CHAT_ROLE_SYSTEM = 3;
}

message ChatMessage {
  ChatRole role = 1;  // typed enum instead of raw string
  string content = 2;
}

message ProviderConfig {
  string name = 1;
  string model = 2;
  optional double temperature = 3;
  optional int32 max_output_tokens = 4;
}

message ExecutionTrace {
  string user_id = 1;
  string feature_id = 2;
  string trace_id = 3;
}

message ExecutionPolicy {
  optional int32 max_retries = 1;
  optional int32 timeout_ms = 2;
  optional ProviderConfig fallback_provider = 3;
}

message ExecutionRequest {
  repeated ChatMessage messages = 1;
  ProviderConfig provider = 2;
  optional ExecutionPolicy policy = 3;
  ExecutionTrace trace = 4;
}

message TokenUsage {
  int32 input_tokens = 1;
  int32 output_tokens = 2;
  int32 total_tokens = 3;
}

message CostRecord {
  ExecutionTrace trace = 1;  // embeds trace instead of flat user_id/feature_id
  string provider = 2;
  string model = 3;
  double input_cost = 4;
  double output_cost = 5;
  double total_cost = 6;
  string timestamp = 7;
}

message ExecutionResponse {
  string raw = 1;
  optional string parsed_json = 2;
  bool valid = 3;
  TokenUsage usage = 4;
  CostRecord cost = 5;
  int32 duration_ms = 6;
  int32 attempt = 7;
  string trace_id = 8;
  optional string error = 9;
  string provider = 10;   // which provider actually served the response (fallback visibility)
  string model = 11;      // which model actually served the response
}

message CostByUserRequest {
  string user_id = 1;
}

message CostByFeatureRequest {
  string feature_id = 1;
}

message CostSummary {
  repeated CostRecord records = 1;
  double total_cost = 2;
}
```

> **Controller note:** `ChatRole` enum values must be mapped to AI SDK strings when building `InternalExecutionRequest`:
> `CHAT_ROLE_USER → "user"`, `CHAT_ROLE_ASSISTANT → "assistant"`, `CHAT_ROLE_SYSTEM → "system"`
>
> **nomi-shared note:** `CostRecord` in `@nomi-labs/nomi-shared` must be updated to embed `ExecutionTrace` instead of flat `userId`/`featureId` fields before finalising this proto.

- [ ] `proto/core.proto` created in **nomi-shared** repo — ⚠️ LOCAL COPY EXISTS at `src/proto/core.proto`; needs migration to nomi-shared
- [ ] `nomi-shared/package.json` ships `proto/` as a package asset (`"files": ["dist", "proto"]`)
- [ ] `@nomi-labs/nomi-shared` republished with updated version
- [ ] **Migrate nomi-core:** delete `src/proto/core.proto`, update `protoPath` in `main.ts` to resolve from `node_modules/@nomi-labs/nomi-shared/proto/core.proto` using `require.resolve`, remove `assets` from `nest-cli.json`
- [ ] **Fix `CostSummary` proto:** current local proto uses `request_count` instead of `repeated CostRecord records` — must match spec before migrating
- [ ] Done

---

## Step 3 — Build the Contracts Layer

**What:** Create internal types and utilities that are shared across modules but never cross the gRPC boundary.

`contracts/interfaces.ts` defines its own **thin TypeScript interfaces mirroring the proto** — the proto is the source of truth, these are the in-process representations. The only import from `@nomi-labs/nomi-shared` is `LogContext`.

### 3a — `src/contracts/interfaces.ts`

```typescript
// src/contracts/interfaces.ts
import { ModelMessage } from 'ai';
import { ZodType } from 'zod';
import { LogContext } from '@nomi-labs/nomi-shared';

export type { LogContext };

// ── Proto-mirroring types (derived from core.proto — proto is source of truth) ──

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

export interface ProviderConfig {
  name: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
}

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

export interface ExecutionRequest {
  messages: ChatMessage[];
  provider: ProviderConfig;
  policy?: ExecutionPolicy;
  trace: ExecutionTrace;
}

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

// ── Internal-only types — never cross gRPC boundary ──

export interface InternalExecutionRequest {
  messages: ModelMessage[]; // AI SDK type — converted from ChatMessage in controller
  provider: ProviderConfig;
  policy?: ExecutionPolicy;
  trace: ExecutionTrace;
  outputSchema?: ZodType;
}

export interface IProviderAdapter {
  readonly name: string;
  generate(
    messages: ModelMessage[],
    config: ProviderConfig,
  ): Promise<{ raw: string; usage: TokenUsage }>;
}

export const PROVIDER_ADAPTER = Symbol('PROVIDER_ADAPTER');
```

### 3b — `src/contracts/trace.util.ts`

```typescript
// src/contracts/trace.util.ts
import { LogContext } from '@nomi-labs/nomi-shared';
import { ExecutionTrace } from './interfaces';

export function traceToLogContext(trace: ExecutionTrace): LogContext {
  return {
    traceId: trace.traceId,
    userId: trace.userId,
    featureId: trace.featureId,
    service: 'nomi-core',
  };
}
```

- [x] `src/contracts/interfaces.ts` created — ✅ **REFACTORED & DELETED**: `src/contracts/` directory removed; types distributed to their owning modules:
  - `ExecutionTrace` → `src/common/types/trace.types.ts`
  - `ProviderConfig`, `IProviderAdapter`, `PROVIDER_ADAPTER` → `src/modules/providers/types/provider.types.ts`
  - `TokenUsage`, `CostRecord` → `src/modules/cost/types/cost.types.ts`
- [x] `src/contracts/trace.util.ts` created — ✅ **MOVED** to `src/common/trace.util.ts`; imports updated to `src/common/types/trace.types`
- [x] Done

---

## Step 4 — Build the Common Layer

**What:** Create the API key resolver utility that reads from Docker secrets first, then falls back to env vars.

**File:** `src/common/resolve-api-key.util.ts`

```typescript
// src/common/resolve-api-key.util.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function resolveApiKey(envKey: string): string {
  // 1. Docker secret (mounted at /run/secrets/<lowercase-key>)
  const secretPath = join('/run/secrets', envKey.toLowerCase());
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, 'utf-8').trim();
  }

  // 2. Environment variable
  const value = process.env[envKey];
  if (value) {
    return value;
  }

  throw new Error(
    `API key "${envKey}" not found in Docker secrets or environment variables`,
  );
}
```

- [x] `src/common/resolve-api-key.util.ts` created — ✅ Complete
- [x] `src/common/trace.util.ts` created — ✅ Moved from `src/contracts/`; `traceToLogContext()` builds `LogContext` from `ExecutionTrace`
- [x] `src/common/types/trace.types.ts` created — ✅ `ExecutionTrace` interface (`userId`, `featureId`, `traceId`)
- [x] Done

---

## Step 5 — Build the Cost Module

**What:** Build the cost tracking service that records and queries cost per user/feature. This module has no dependency on the execution module — it only depends on contracts.

### 5a — `src/cost/model-pricing.config.ts`

```typescript
// src/cost/model-pricing.config.ts

export interface ModelPricing {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

export type ModelPricingMap = Record<string, ModelPricing>;

export const MODEL_PRICING_TOKEN = Symbol('MODEL_PRICING');
```

### 5b — `src/cost/cost-tracker.service.ts`

```typescript
// src/cost/cost-tracker.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import {
  CostRecord,
  ExecutionTrace,
  TokenUsage,
} from '../contracts/interfaces';
import { MODEL_PRICING_TOKEN, ModelPricingMap } from './model-pricing.config';

@Injectable()
export class CostTrackerService {
  private readonly records: CostRecord[] = [];

  constructor(
    private readonly logger: NomiLoggerService,
    @Inject(MODEL_PRICING_TOKEN)
    private readonly pricing: ModelPricingMap,
  ) {}

  record(params: {
    trace: ExecutionTrace; // embedded trace — matches proto CostRecord shape
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

    const costRecord: CostRecord = {
      trace: params.trace,
      provider: params.provider,
      model: params.model,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      timestamp: new Date().toISOString(),
    };

    this.records.push(costRecord);
    this.logger.info(
      'Cost recorded',
      {
        traceId: params.trace.traceId,
        userId: params.trace.userId,
        featureId: params.trace.featureId,
        service: 'nomi-core',
      },
      { model: params.model, totalCost: costRecord.totalCost },
    );

    return costRecord;
  }

  getByUser(userId: string): { records: CostRecord[]; totalCost: number } {
    const userRecords = this.records.filter((r) => r.trace.userId === userId);
    const totalCost = userRecords.reduce((sum, r) => sum + r.totalCost, 0);
    return { records: userRecords, totalCost };
  }

  getByFeature(featureId: string): {
    records: CostRecord[];
    totalCost: number;
  } {
    const featureRecords = this.records.filter(
      (r) => r.trace.featureId === featureId,
    );
    const totalCost = featureRecords.reduce((sum, r) => sum + r.totalCost, 0);
    return { records: featureRecords, totalCost };
  }
}
```

### 5c — `src/cost/cost.module.ts`

```typescript
// src/cost/cost.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CostTrackerService } from './cost-tracker.service';
import { MODEL_PRICING_TOKEN, ModelPricingMap } from './model-pricing.config';

@Module({
  providers: [
    CostTrackerService,
    {
      provide: MODEL_PRICING_TOKEN,
      useFactory: (config: ConfigService): ModelPricingMap => {
        const raw = config.get<string>('MODEL_PRICING');
        if (!raw) {
          throw new Error(
            'MODEL_PRICING env var is required — JSON map of model pricing',
          );
        }
        return JSON.parse(raw);
      },
      inject: [ConfigService],
    },
  ],
  exports: [CostTrackerService],
})
export class CostModule {}
```

- [ ] `src/modules/cost/model-pricing.config.ts` created — ❌ Not created
- [ ] `src/modules/cost/cost-tracker.service.ts` created — ❌ Not created
- [ ] `src/modules/cost/cost.module.ts` created — ❌ Not created
- [x] `src/modules/cost/types/cost.types.ts` created — ✅ `TokenUsage`, `CostRecord` (moved from `src/contracts/interfaces.ts`)
- [ ] Done

---

## Step 6 — Build the Providers Module

**What:** Build the Gemini adapter and the providers module. Each adapter implements `IProviderAdapter` and is registered under the `PROVIDER_ADAPTER` token.

### 6a — `src/providers/gemini.adapter.ts`

```typescript
// src/providers/gemini.adapter.ts
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { Injectable } from '@nestjs/common';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import { generateText, ModelMessage } from 'ai';
import {
  IProviderAdapter,
  ProviderConfig,
  TokenUsage,
} from '../contracts/interfaces';
import { resolveApiKey } from '../common/resolve-api-key.util';

@Injectable()
export class GeminiAdapter implements IProviderAdapter {
  readonly name = 'gemini';

  constructor(private readonly logger: NomiLoggerService) {}

  async generate(
    messages: ModelMessage[],
    config: ProviderConfig,
  ): Promise<{ raw: string; usage: TokenUsage }> {
    const google = createGoogleGenerativeAI({
      apiKey: resolveApiKey('GEMINI_API_KEY'),
    });

    const result = await generateText({
      model: google(config.model),
      messages,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
    });

    const usage: TokenUsage = {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: result.usage?.totalTokens ?? 0,
    };

    this.logger.info(
      'Gemini generation complete',
      {
        traceId: 'provider',
        userId: 'system',
        featureId: 'generation',
        service: 'nomi-core',
      },
      { model: config.model, totalTokens: usage.totalTokens },
    );

    return { raw: result.text, usage };
  }
}
```

### 6b — `src/providers/providers.module.ts`

```typescript
// src/providers/providers.module.ts
import { Module } from '@nestjs/common';
import { PROVIDER_ADAPTER } from '../contracts/interfaces';
import { GeminiAdapter } from './gemini.adapter';

@Module({
  providers: [
    GeminiAdapter,
    {
      provide: PROVIDER_ADAPTER,
      useFactory: (gemini: GeminiAdapter) => [gemini],
      inject: [GeminiAdapter],
    },
  ],
  exports: [PROVIDER_ADAPTER],
})
export class ProvidersModule {}
```

> **Adding a new provider?** Create `<name>.adapter.ts`, add it to the `inject` array and `useFactory` params. Nothing else changes.

- [x] `src/modules/providers/gemini.adapter.ts` created — ✅ Complete; moved to `src/modules/providers/`; API key cached via `getClient()` lazy init
- [x] `src/modules/providers/types/provider.types.ts` created — ✅ `ProviderConfig`, `IProviderAdapter`, `PROVIDER_ADAPTER`
- [ ] **Migrate `providers.module.ts`** — `src/providers/providers.module.ts` still at old location; move to `src/modules/providers/providers.module.ts` and update `ExecutionModule` import path
- [ ] Done

---

## Step 7 — Build the Execution Engine

**What:** Build the core execution service — retry loop, fallback, Zod validation, cost recording. This is the heart of nomi-core. It **never throws** — always returns an `ExecutionResponse`.

**File:** `src/execution/execution-engine.service.ts`

```typescript
// src/execution/execution-engine.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import {
  ExecutionResponse,
  InternalExecutionRequest,
  IProviderAdapter,
  LogContext,
  ProviderConfig,
  PROVIDER_ADAPTER,
} from '../contracts/interfaces';
import { traceToLogContext } from '../contracts/trace.util';
import { CostTrackerService } from '../cost/cost-tracker.service';

@Injectable()
export class ExecutionEngineService {
  constructor(
    @Inject(PROVIDER_ADAPTER)
    private readonly adapters: IProviderAdapter[],
    private readonly costTracker: CostTrackerService,
    private readonly logger: NomiLoggerService,
  ) {}

  async execute(request: InternalExecutionRequest): Promise<ExecutionResponse> {
    const ctx = traceToLogContext(request.trace);
    const maxRetries = request.policy?.maxRetries ?? 3;
    const timeoutMs = request.policy?.timeoutMs ?? 30_000;
    const start = Date.now();

    const primaryResult = await this.tryWithRetries(
      request,
      request.provider,
      maxRetries,
      timeoutMs,
      ctx,
      start,
    );
    if (primaryResult) return primaryResult;

    if (request.policy?.fallbackProvider) {
      this.logger.warn('Primary provider exhausted, trying fallback', ctx);
      const fallbackResult = await this.tryWithRetries(
        request,
        request.policy.fallbackProvider,
        maxRetries,
        timeoutMs,
        ctx,
        start,
      );
      if (fallbackResult) return fallbackResult;
    }

    return this.errorResponse(
      'All retries exhausted across all providers',
      ctx.traceId,
      maxRetries,
      start,
    );
  }

  private async tryWithRetries(
    request: InternalExecutionRequest,
    providerConfig: ProviderConfig,
    maxRetries: number,
    timeoutMs: number,
    ctx: LogContext,
    start: number,
  ): Promise<ExecutionResponse | null> {
    const adapter = this.adapters.find((a) => a.name === providerConfig.name);
    if (!adapter) {
      this.logger.error(
        `No adapter found for provider: ${providerConfig.name}`,
        ctx,
      );
      return null;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.withTimeout(
          adapter.generate(request.messages, providerConfig),
          timeoutMs,
        );

        const cost = this.costTracker.record({
          trace: request.trace,
          provider: providerConfig.name,
          model: providerConfig.model,
          usage: result.usage,
        });

        let parsedJson: string | undefined;
        let valid = true;
        if (request.outputSchema) {
          const parseResult = request.outputSchema.safeParse(
            JSON.parse(result.raw),
          );
          if (parseResult.success) {
            parsedJson = JSON.stringify(parseResult.data);
          } else {
            valid = false;
            this.logger.warn('Schema validation failed', ctx, {
              attempt,
            });
          }
        }

        return {
          raw: result.raw,
          parsedJson,
          valid,
          usage: result.usage,
          cost,
          durationMs: Date.now() - start,
          attempt,
          traceId: ctx.traceId,
          provider: providerConfig.name,
          model: providerConfig.model,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Attempt failed: ${message}`, ctx, {
          attempt,
        });

        if (attempt < maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    return null;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), ms),
      ),
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorResponse(
    error: string,
    traceId: string,
    attempt: number,
    start: number,
  ): ExecutionResponse {
    return {
      raw: '',
      valid: false,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      cost: {
        trace: { userId: '', featureId: '', traceId },
        provider: '',
        model: '',
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        timestamp: new Date().toISOString(),
      },
      durationMs: Date.now() - start,
      attempt,
      traceId,
      provider: '',
      model: '',
      error,
    };
  }
}
```

- [x] `src/execution/execution-engine.service.ts` — ✅ MERGED into `ExecutionService` and `src/execution/` directory deleted; logic lives in `src/modules/execution/execution.service.ts`
- [x] Never throws — always returns `ExecutionResponse` ✅
- [x] Retry + fallback logic with exponential backoff ✅ (1s, 2s, 4s… `1000 * 2^(attempt-1)`)
- [x] Zod validation sets `valid: false`, never throws ✅
- [ ] Cost always recorded (even on validation failure) — ❌ `CostTrackerService` not injected yet; `buildResponse()` has hardcoded zero costs (pending Step 5)
- [x] All logs use `NomiLoggerService` + `LogContext` ✅
- [ ] Timeout timer leak fixed — ❌ `setTimeout` in `generateWithTimeout` never cleared on success
- [ ] Done

---

## Step 8 — Build the Controller + Execution Module

**What:** Build the gRPC controller that maps incoming proto requests to `InternalExecutionRequest` and delegates to the engine. Then wire everything together in the execution module.

### 8a — `src/execution/core.controller.ts`

```typescript
// src/execution/core.controller.ts
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  ChatRole,
  ExecutionRequest,
  ExecutionResponse,
  InternalExecutionRequest,
} from '../contracts/interfaces';
import { ExecutionEngineService } from './execution-engine.service';
import { CostTrackerService } from '../cost/cost-tracker.service';

@Controller()
export class CoreController {
  constructor(
    private readonly engine: ExecutionEngineService,
    private readonly costTracker: CostTrackerService,
  ) {}

  @GrpcMethod('CoreService', 'Execute')
  async execute(data: ExecutionRequest): Promise<ExecutionResponse> {
    const roleMap: Record<number, 'user' | 'assistant' | 'system'> = {
      [ChatRole.USER]: 'user',
      [ChatRole.ASSISTANT]: 'assistant',
      [ChatRole.SYSTEM]: 'system',
    };
    const internal: InternalExecutionRequest = {
      ...data,
      messages: data.messages.map((m) => ({
        role: roleMap[m.role] ?? 'user', // ChatRole enum → AI SDK string
        content: m.content,
      })),
    };
    return this.engine.execute(internal);
  }

  @GrpcMethod('CoreService', 'GetCostByUser')
  getCostByUser(data: { userId: string }) {
    return this.costTracker.getByUser(data.userId);
  }

  @GrpcMethod('CoreService', 'GetCostByFeature')
  getCostByFeature(data: { featureId: string }) {
    return this.costTracker.getByFeature(data.featureId);
  }

  @GrpcMethod('CoreService', 'Health')
  health() {
    return { status: 'ok', timestampMs: Date.now() }; // int64 epoch ms — matches proto
  }
}
```

### 8b — `src/execution/execution.module.ts`

```typescript
// src/execution/execution.module.ts
import { Module } from '@nestjs/common';
import { CoreController } from './core.controller';
import { ExecutionEngineService } from './execution-engine.service';
import { ProvidersModule } from '../providers/providers.module';
import { CostModule } from '../cost/cost.module';

@Module({
  imports: [ProvidersModule, CostModule],
  controllers: [CoreController],
  providers: [ExecutionEngineService],
})
export class ExecutionModule {}
```

- [x] `src/modules/execution/execution.controller.ts` created — ✅ `Execute` handler delegates to `ExecutionService`
- [ ] `GetCostByUser` and `GetCostByFeature` handlers — ❌ Not yet implemented (pending cost module — Step 5)
- [x] `src/modules/execution/execution.module.ts` — ✅ imports `ProvidersModule`; `ExecutionController` + `ExecutionService` wired — **still missing `CostModule` import** (pending Step 5)
- [x] Controller uses `@GrpcMethod('CoreService', '<RpcName>')` — matches proto exactly ✅
- [x] Controller only maps data and delegates — no logic ✅
- [x] **`src/modules/execution/types/execution.types.ts`** — `ChatRole`, `ChatMessage`, `ExecutionPolicy`, `ExecutionRequest`, `ExecutionResponse` ✅
- [x] **`src/modules/execution/types/execution.internal.types.ts`** — `InternalExecutionRequest` ✅
- [x] **`src/modules/execution/execution.service.ts`** — ✅ Full implementation: retry/fallback/Zod/timeout; `console.log` removed; `src/execution/` orphan deleted
- [x] **`src/modules/health/health.controller.ts`** — `Health` gRPC handler ✅
- [x] **`src/modules/health/health.module.ts`** — registered in `AppModule` ✅
- [ ] **PENDING — Add `CostModule` import to `ExecutionModule`; inject `CostTrackerService` into `ExecutionService`; add `GetCostByUser`/`GetCostByFeature` to controller; move `providers.module.ts` from `src/providers/` to `src/modules/providers/`**
- [ ] Done

---

## Step 9 — Wire Up `app.module.ts` and `main.ts`

**What:** Configure the root module and bootstrap the gRPC microservice.

### 9a — `src/app.module.ts`

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NomiLoggerModule } from '@nomi-labs/nomi-logger';
import { ExecutionModule } from './execution/execution.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    NomiLoggerModule,
    ExecutionModule,
  ],
})
export class AppModule {}
```

### 9b — `src/main.ts`

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import { AppModule } from './app.module';

async function bootstrap() {
  const grpcPort = process.env.CORE_GRPC_PORT ?? '4000';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'nomi.core',
        protoPath: require.resolve('@nomi-labs/nomi-shared/proto/core.proto'), // single source of truth
        url: `0.0.0.0:${grpcPort}`,
      },
    },
  );

  const logger = app.get(NomiLoggerService);
  const ctx = {
    traceId: 'bootstrap',
    userId: 'system',
    featureId: 'startup',
    service: 'nomi-core',
  };

  logger.info(`NODE_ENV: ${process.env.NODE_ENV}`, ctx);
  logger.info(`LOG_LEVEL: ${process.env.LOG_LEVEL}`, ctx);
  logger.info(`CORE_GRPC_PORT: ${grpcPort}`, ctx);

  await app.listen();
  logger.info('gRPC microservice is listening', ctx);
}
bootstrap();
```

- [x] `src/app.module.ts` updated — ✅ `ConfigModule`, `NomiLoggerModule`, `ExecutionModule`, `HealthModule` all present
- [ ] `src/main.ts` — ⚠️ PARTIAL: gRPC configured, using local `src/proto/core.proto`; migrate to `require.resolve('@nomi-labs/nomi-shared/proto/core.proto')` when Step 2 is complete
- [x] `npm run build` succeeds — ✅ Verified
- [x] Done

---

## Step 10 — Write Unit Tests

**What:** Write Vitest unit tests for all three core services: CostTracker, ExecutionEngine, GeminiAdapter.

**Rules:**

- No real API calls — always mock
- No NestJS TestingModule — instantiate services directly
- Mock `NomiLoggerService` as a plain object
- Use `vi.useFakeTimers()` for retry/backoff tests
- Use factory functions for test data builders

### 10a — `src/cost/__tests__/cost-tracker.service.spec.ts`

```typescript
// src/cost/__tests__/cost-tracker.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import { CostTrackerService } from '../cost-tracker.service';
import { ModelPricingMap } from '../model-pricing.config';

const TEST_PRICING: ModelPricingMap = {
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as NomiLoggerService;

describe('CostTrackerService', () => {
  let service: CostTrackerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CostTrackerService(mockLogger, TEST_PRICING);
  });

  it('should calculate cost correctly', () => {
    const result = service.record({
      userId: 'user-1',
      featureId: 'feat-1',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });

    expect(result.inputCost).toBeCloseTo(0.0001); // 1000/1M * 0.1
    expect(result.outputCost).toBeCloseTo(0.0002); // 500/1M * 0.4
    expect(result.totalCost).toBeCloseTo(0.0003);
  });

  it('should throw on unknown model', () => {
    expect(() =>
      service.record({
        userId: 'user-1',
        featureId: 'feat-1',
        provider: 'gemini',
        model: 'unknown-model',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
      }),
    ).toThrow('Unknown model "unknown-model"');
  });

  it('should query by user', () => {
    service.record({
      userId: 'user-1',
      featureId: 'feat-1',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });
    service.record({
      userId: 'user-2',
      featureId: 'feat-1',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
    });

    const result = service.getByUser('user-1');
    expect(result.records).toHaveLength(1);
    expect(result.records[0].userId).toBe('user-1');
  });

  it('should query by feature', () => {
    service.record({
      userId: 'user-1',
      featureId: 'feat-a',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });
    service.record({
      userId: 'user-1',
      featureId: 'feat-b',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
    });

    const result = service.getByFeature('feat-a');
    expect(result.records).toHaveLength(1);
    expect(result.records[0].featureId).toBe('feat-a');
  });

  it('should log cost on record', () => {
    service.record({
      userId: 'user-1',
      featureId: 'feat-1',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Cost recorded',
      expect.objectContaining({ traceId: 'cost', userId: 'user-1' }),
      expect.objectContaining({ model: 'gemini-2.0-flash' }),
    );
  });
});
```

### 10b — `src/providers/__tests__/gemini.adapter.spec.ts`

```typescript
// src/providers/__tests__/gemini.adapter.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import { GeminiAdapter } from '../gemini.adapter';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn()),
}));

vi.mock('../../common/resolve-api-key.util', () => ({
  resolveApiKey: vi.fn(() => 'test-api-key'),
}));

import { generateText } from 'ai';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as NomiLoggerService;

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GeminiAdapter(mockLogger);
  });

  it('should have name "gemini"', () => {
    expect(adapter.name).toBe('gemini');
  });

  it('should call generateText and return raw + usage', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'Hello world',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    } as any);

    const result = await adapter.generate([{ role: 'user', content: 'Hi' }], {
      name: 'gemini',
      model: 'gemini-2.0-flash',
    });

    expect(result.raw).toBe('Hello world');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(15);
  });

  it('should default token counts to 0 when usage is missing', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'response',
      usage: undefined,
    } as any);

    const result = await adapter.generate([{ role: 'user', content: 'Hi' }], {
      name: 'gemini',
      model: 'gemini-2.0-flash',
    });

    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.usage.totalTokens).toBe(0);
  });

  it('should log after successful generation', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'Hello',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    } as any);

    await adapter.generate([{ role: 'user', content: 'Hi' }], {
      name: 'gemini',
      model: 'gemini-2.0-flash',
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Gemini generation complete',
      expect.objectContaining({ service: 'nomi-core' }),
      expect.objectContaining({ model: 'gemini-2.0-flash', totalTokens: 15 }),
    );
  });

  it('should propagate errors from generateText', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('API error'));

    await expect(
      adapter.generate([{ role: 'user', content: 'Hi' }], {
        name: 'gemini',
        model: 'gemini-2.0-flash',
      }),
    ).rejects.toThrow('API error');
  });
});
```

### 10c — `src/execution/__tests__/execution-engine.service.spec.ts`

```typescript
// src/execution/__tests__/execution-engine.service.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import { ExecutionEngineService } from '../execution-engine.service';
import { CostTrackerService } from '../../cost/cost-tracker.service';
import {
  IProviderAdapter,
  InternalExecutionRequest,
  TokenUsage,
  CostRecord,
  ProviderConfig,
} from '../../contracts/interfaces';
import { ModelMessage } from 'ai';

// ── Test Factories ──

function makeAdapter(overrides?: Partial<IProviderAdapter>): IProviderAdapter {
  return {
    name: 'gemini',
    generate: vi.fn().mockResolvedValue({
      raw: '{"answer":"hello"}',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }),
    ...overrides,
  };
}

function makeRequest(
  overrides?: Partial<InternalExecutionRequest>,
): InternalExecutionRequest {
  return {
    messages: [{ role: 'user', content: 'Hi' }] as ModelMessage[],
    provider: { name: 'gemini', model: 'gemini-2.0-flash' },
    trace: {
      userId: 'user-1',
      featureId: 'feat-1',
      traceId: 'trace-1',
    },
    ...overrides,
  };
}

function makeCostRecord(): CostRecord {
  return {
    userId: 'user-1',
    featureId: 'feat-1',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    inputCost: 0.000001,
    outputCost: 0.000002,
    totalCost: 0.000003,
    timestamp: new Date(),
  };
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as NomiLoggerService;

describe('ExecutionEngineService', () => {
  let engine: ExecutionEngineService;
  let adapter: IProviderAdapter;
  let costTracker: CostTrackerService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    adapter = makeAdapter();
    costTracker = {
      record: vi.fn().mockReturnValue(makeCostRecord()),
    } as unknown as CostTrackerService;

    engine = new ExecutionEngineService([adapter], costTracker, mockLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute successfully on first attempt', async () => {
    const result = await engine.execute(makeRequest());

    expect(result.raw).toBe('{"answer":"hello"}');
    expect(result.valid).toBe(true);
    expect(result.attempt).toBe(1);
    expect(result.traceId).toBe('trace-1');
    expect(costTracker.record).toHaveBeenCalledOnce();
  });

  it('should retry on failure and succeed', async () => {
    const gen = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary error'))
      .mockResolvedValue({
        raw: '{"ok":true}',
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      });

    adapter = makeAdapter({ generate: gen });
    engine = new ExecutionEngineService([adapter], costTracker, mockLogger);

    const promise = engine.execute(makeRequest());

    // Advance past the 1s backoff (1000 * 2^0)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result.valid).toBe(true);
    expect(result.attempt).toBe(2);
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it('should return error response after all retries exhausted', async () => {
    adapter = makeAdapter({
      generate: vi.fn().mockRejectedValue(new Error('Always fails')),
    });
    engine = new ExecutionEngineService([adapter], costTracker, mockLogger);

    const promise = engine.execute(
      makeRequest({ policy: { maxRetries: 2, timeoutMs: 30_000 } }),
    );

    // Advance past backoff: 1s (between attempt 1 and 2)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.error).toContain('All retries exhausted');
  });

  it('should use fallback provider when primary exhausted', async () => {
    const primaryAdapter = makeAdapter({
      name: 'primary',
      generate: vi.fn().mockRejectedValue(new Error('Primary failed')),
    });

    const fallbackAdapter = makeAdapter({
      name: 'fallback',
      generate: vi.fn().mockResolvedValue({
        raw: 'fallback response',
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      }),
    });

    engine = new ExecutionEngineService(
      [primaryAdapter, fallbackAdapter],
      costTracker,
      mockLogger,
    );

    const promise = engine.execute(
      makeRequest({
        provider: { name: 'primary', model: 'model-a' },
        policy: {
          maxRetries: 1,
          timeoutMs: 30_000,
          fallbackProvider: { name: 'fallback', model: 'model-b' },
        },
      }),
    );

    // Advance timers to exhaust primary and reach fallback
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;

    expect(result.raw).toBe('fallback response');
    expect(result.valid).toBe(true);
  });

  it('should return null-adapter error for unknown provider', async () => {
    engine = new ExecutionEngineService([], costTracker, mockLogger);

    const result = await engine.execute(makeRequest());

    expect(result.valid).toBe(false);
    expect(result.error).toContain('All retries exhausted');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('No adapter found'),
      expect.any(Object),
    );
  });

  it('should set valid=false on Zod schema mismatch (never throws)', async () => {
    const { z } = await import('zod');

    adapter = makeAdapter({
      generate: vi.fn().mockResolvedValue({
        raw: '{"wrong":"shape"}',
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      }),
    });
    engine = new ExecutionEngineService([adapter], costTracker, mockLogger);

    const result = await engine.execute(
      makeRequest({
        outputSchema: z.object({ answer: z.string() }),
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.raw).toBe('{"wrong":"shape"}');
    expect(costTracker.record).toHaveBeenCalledOnce();
  });

  it('should validate output with Zod schema on success', async () => {
    const { z } = await import('zod');

    adapter = makeAdapter({
      generate: vi.fn().mockResolvedValue({
        raw: '{"answer":"hello"}',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    });
    engine = new ExecutionEngineService([adapter], costTracker, mockLogger);

    const result = await engine.execute(
      makeRequest({
        outputSchema: z.object({ answer: z.string() }),
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.parsed).toEqual({ answer: 'hello' });
  });

  it('should always record cost even on validation failure', async () => {
    const { z } = await import('zod');

    adapter = makeAdapter({
      generate: vi.fn().mockResolvedValue({
        raw: '{"wrong":"shape"}',
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      }),
    });
    engine = new ExecutionEngineService([adapter], costTracker, mockLogger);

    await engine.execute(
      makeRequest({
        outputSchema: z.object({ answer: z.string() }),
      }),
    );

    expect(costTracker.record).toHaveBeenCalledOnce();
  });
});
```

- [ ] `src/cost/__tests__/cost-tracker.service.spec.ts` created — 5 tests — ❌ Not created
- [ ] `src/providers/__tests__/gemini.adapter.spec.ts` created — 5 tests — ❌ Not created
- [ ] `src/execution/__tests__/execution-engine.service.spec.ts` created — 7 tests — ❌ Not created
- [ ] `npm test` → all green
- [ ] Done

---

## Step 11 — Create Integration Test Client + Docker Config

**What:** Create a manual gRPC test client and Docker deployment config.

### 11a — `test/test-client.ts`

```typescript
// test/test-client.ts
import 'dotenv/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { join } from 'path';

async function main() {
  const client = ClientProxyFactory.create({
    transport: Transport.GRPC,
    options: {
      package: 'nomi.core',
      protoPath: join(__dirname, '../src/proto/core.proto'),
      url: '127.0.0.1:4000',
    },
  });

  const coreService = client.getService<any>('CoreService');

  // 1. Health check
  console.log('--- Health Check ---');
  const health = await firstValueFrom(coreService.health({}));
  console.log('Health:', health);

  // 2. Execute
  console.log('\n--- Execute ---');
  const result = await firstValueFrom(
    coreService.execute({
      messages: [
        { role: 'user', content: 'Reply with exactly one word: hello' },
      ],
      provider: { name: 'gemini', model: 'gemini-2.0-flash' },
      trace: {
        userId: 'test-user',
        featureId: 'test-feature',
        traceId: 'manual-test-1',
      },
    }),
  );
  console.log('Raw     :', result.raw);
  console.log('Valid   :', result.valid);
  console.log('Usage   :', result.usage);
  console.log('Cost    :', result.cost);
  console.log('Attempt :', result.attempt);
  console.log('Duration:', result.durationMs, 'ms');

  // 3. Cost by user
  console.log('\n--- Cost by User ---');
  const userCost = await firstValueFrom(
    coreService.getCostByUser({ userId: 'test-user' }),
  );
  console.log('User cost:', userCost);

  // 4. Cost by feature
  console.log('\n--- Cost by Feature ---');
  const featureCost = await firstValueFrom(
    coreService.getCostByFeature({ featureId: 'test-feature' }),
  );
  console.log('Feature cost:', featureCost);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### 11b — `Dockerfile`

```dockerfile
# Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 4000
CMD ["node", "dist/main.js"]
```

### 11c — `docker-stack.yml`

```yaml
# docker-stack.yml
version: '3.8'

services:
  nomi-core:
    image: nomi-core:latest
    build: .
    ports:
      - '4000:4000'
    environment:
      NODE_ENV: production
      CORE_GRPC_PORT: '4000'
      LOG_LEVEL: info
    secrets:
      - gemini_api_key
    configs:
      - source: model_pricing
        target: /run/configs/model_pricing.json

secrets:
  gemini_api_key:
    external: true

configs:
  model_pricing:
    external: true
```

### 11d — `.dockerignore`

```
node_modules
dist
.env
.git
*.md
```

- [ ] `test/test-client.ts` created — ⚠️ PARTIAL: Health ✅ + Execute ✅ implemented; missing GetCostByUser, GetCostByFeature calls
- [ ] `Dockerfile` created — ❌ Not created
- [ ] `docker-stack.yml` created — ❌ Not created
- [ ] `.dockerignore` created — ❌ Not created
- [ ] Done

---

## MVP Verification

```powershell
# 1. Build
npm run build

# 2. Tests pass
npm test

# 3. Start service
npm run start:dev

# 4. Test with gRPC client (in another terminal)
npm run test:client
```

- [ ] `npm run build` — clean, no errors
- [ ] `npm test` — all pass (17 tests)
- [ ] Service starts on gRPC port 4000
- [ ] test-client.ts can call all 4 RPCs successfully
- [ ] **MVP COMPLETE**

---

# Post-MVP Stage

---

## Step 12 — gRPC Server Streaming for Execute

**What:** Add `ExecuteStream` RPC that sends partial tokens as a stream.

**Proto addition to `core.proto`:**

```protobuf
service CoreService {
  // ... existing RPCs ...
  rpc ExecuteStream (ExecutionRequest) returns (stream ExecutionChunk);
}

message ExecutionChunk {
  oneof payload {
    string token = 1;
    ExecutionResponse result = 2;
  }
}
```

**Controller addition:**

```typescript
import { GrpcMethod, GrpcStreamMethod } from '@nestjs/microservices';
import { Observable, Subject } from 'rxjs';

@GrpcMethod('CoreService', 'ExecuteStream')
executeStream(data: ExecutionRequest): Observable<ExecutionChunk> {
    const subject = new Subject<ExecutionChunk>();

    this.engine.executeStream(data, {
        onToken: (token: string) => subject.next({ token }),
        onComplete: (result: ExecutionResponse) => {
            subject.next({ result });
            subject.complete();
        },
        onError: (error: Error) => subject.error(error),
    });

    return subject.asObservable();
}
```

- [ ] Proto updated with `ExecuteStream` RPC
- [ ] `ExecutionChunk` message defined
- [ ] Controller `executeStream()` implemented
- [ ] ExecutionEngineService `executeStream()` implemented
- [ ] Test coverage added
- [ ] Done

---

## Step 13 — Prisma Integration for Cost Persistence

**What:** Replace in-memory cost storage with PostgreSQL via Prisma.

```powershell
npm install prisma @prisma/client
npx prisma init
```

**Prisma schema:**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model CostRecord {
  id           String   @id @default(cuid())
  userId       String
  featureId    String
  provider     String
  model        String
  inputCost    Float
  outputCost   Float
  totalCost    Float
  inputTokens  Int
  outputTokens Int
  totalTokens  Int
  timestamp    DateTime @default(now())

  @@index([userId])
  @@index([featureId])
  @@index([timestamp])
}
```

**CostTrackerService update:**

```typescript
import { PrismaClient } from '@prisma/client';

@Injectable()
export class CostTrackerService {
    constructor(
        private readonly logger: NomiLoggerService,
        @Inject(MODEL_PRICING_TOKEN) private readonly pricing: ModelPricingMap,
        private readonly prisma: PrismaClient,
    ) {}

    async record(params: { ... }): Promise<CostRecord> {
        // ... same pricing calculation ...
        const costRecord = await this.prisma.costRecord.create({ data: { ... } });
        this.logger.info('Cost recorded', ctx, { model, totalCost });
        return costRecord;
    }

    async getByUser(userId: string) {
        const records = await this.prisma.costRecord.findMany({ where: { userId } });
        const totalCost = records.reduce((sum, r) => sum + r.totalCost, 0);
        return { records, totalCost };
    }

    async getByFeature(featureId: string) {
        const records = await this.prisma.costRecord.findMany({ where: { featureId } });
        const totalCost = records.reduce((sum, r) => sum + r.totalCost, 0);
        return { records, totalCost };
    }
}
```

- [ ] Prisma schema created
- [ ] `npx prisma generate` runs
- [ ] `npx prisma migrate dev` creates migration
- [ ] CostTrackerService uses PrismaClient
- [ ] Methods become async
- [ ] Tests updated with Prisma mock
- [ ] Done

---

## Step 14 — gRPC Health Check Protocol

**What:** Implement the standard gRPC health checking protocol (`grpc.health.v1.Health`).

```protobuf
// src/proto/health.proto
syntax = "proto3";

package grpc.health.v1;

service Health {
  rpc Check (HealthCheckRequest) returns (HealthCheckResponse);
  rpc Watch (HealthCheckRequest) returns (stream HealthCheckResponse);
}

message HealthCheckRequest {
  string service = 1;
}

message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
  }
  ServingStatus status = 1;
}
```

- [ ] `health.proto` added
- [ ] HealthController implemented
- [ ] Compatible with standard gRPC health check clients
- [ ] Done

---

## Step 15 — gRPC Reflection

**What:** Enable gRPC server reflection so tools like `grpcurl` and Postman can discover services.

```powershell
npm install @grpc/reflection
```

```typescript
// In main.ts bootstrap
import { ReflectionService } from '@grpc/reflection';

const reflectionService = new ReflectionService(
  join(__dirname, 'proto/core.proto'),
);
reflectionService.addToServer(app.getServer());
```

- [ ] `@grpc/reflection` installed
- [ ] Reflection enabled in bootstrap
- [ ] `grpcurl -plaintext localhost:4000 list` returns `nomi.core.CoreService`
- [ ] Done

---

## Step 16 — Update nomi-biseo to gRPC Client

**What:** Update nomi-biseo to call nomi-core over gRPC instead of TCP.

```typescript
// nomi-biseo module registration
ClientsModule.register([{
    name: 'CORE_SERVICE',
    transport: Transport.GRPC,
    options: {
        package: 'nomi.core',
        protoPath: join(__dirname, 'proto/core.proto'),
        url: process.env.CORE_GRPC_URL ?? 'localhost:4000',
    },
}]),

// In service
@Inject('CORE_SERVICE') private readonly coreClient: ClientGrpc;

onModuleInit() {
    this.coreService = this.coreClient.getService<CoreServiceClient>('CoreService');
}

async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    return firstValueFrom(this.coreService.execute(request));
}
```

- [ ] nomi-biseo updated to gRPC transport
- [ ] Proto file shared (copy or symlink from nomi-core)
- [ ] Integration tested
- [ ] Done

---

## Summary — All Files to Create

### MVP (Steps 0–11)

| File                                                       | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `vitest.config.ts`                                         | Vitest config with SWC plugin                              |
| `nest-cli.json`                                            | Updated with proto asset copy                              |
| `.env.example`                                             | Environment variable template                              |
| `.env`                                                     | Local environment variables                                |
| `src/proto/core.proto`                                     | gRPC service definition                                    |
| `src/contracts/interfaces.ts`                              | Internal types: IProviderAdapter, InternalExecutionRequest |
| `src/contracts/trace.util.ts`                              | traceToLogContext() helper                                 |
| `src/common/resolve-api-key.util.ts`                       | API key resolver (Docker secrets / env)                    |
| `src/cost/model-pricing.config.ts`                         | ModelPricingMap type + injection token                     |
| `src/cost/cost-tracker.service.ts`                         | Records and queries cost per user/feature                  |
| `src/cost/cost.module.ts`                                  | Cost module with MODEL_PRICING provider                    |
| `src/providers/gemini.adapter.ts`                          | Gemini adapter via Vercel AI SDK                           |
| `src/providers/providers.module.ts`                        | Registers adapters under PROVIDER_ADAPTER                  |
| `src/execution/execution-engine.service.ts`                | Retry loop, fallback, Zod validation                       |
| `src/execution/core.controller.ts`                         | @GrpcMethod handlers                                       |
| `src/execution/execution.module.ts`                        | Wires controller + engine + imports                        |
| `src/app.module.ts`                                        | Root module: ConfigModule, NomiLoggerModule                |
| `src/main.ts`                                              | gRPC bootstrap (Transport.GRPC, port 4000)                 |
| `src/cost/__tests__/cost-tracker.service.spec.ts`          | 5 tests                                                    |
| `src/providers/__tests__/gemini.adapter.spec.ts`           | 5 tests                                                    |
| `src/execution/__tests__/execution-engine.service.spec.ts` | 7 tests                                                    |
| `test/test-client.ts`                                      | Manual gRPC integration test                               |
| `Dockerfile`                                               | Multi-stage Docker build                                   |
| `docker-stack.yml`                                         | Docker Swarm deployment                                    |
| `.dockerignore`                                            | Docker ignore file                                         |

### Post-MVP (Steps 12–16)

| File                                        | Action                                 |
| ------------------------------------------- | -------------------------------------- |
| `src/proto/core.proto`                      | Add ExecuteStream RPC + ExecutionChunk |
| `src/proto/health.proto`                    | Standard gRPC health check protocol    |
| `prisma/schema.prisma`                      | CostRecord model                       |
| `src/cost/cost-tracker.service.ts`          | In-memory → Prisma persistence         |
| `src/execution/core.controller.ts`          | Add executeStream()                    |
| `src/execution/execution-engine.service.ts` | Add executeStream()                    |
| `src/main.ts`                               | Add gRPC reflection                    |
| `nomi-biseo/`                               | Update caller to gRPC                  |

---

## Production-Grade Improvements (2026-03-31 Review)

### Priority 1 — Must Fix (Blocking MVP)

- [ ] **Remove `console.log`** from `execution.service.ts:39` — replace with `this.logger.debug()`
- [ ] **Wire the real execution pipeline** — merge `ExecutionEngineService` logic into the module system; `ExecutionService.execute()` must call through the full flow: adapter → cost → response
- [ ] **Build the cost module** — `CostTrackerService`, `model-pricing.config.ts`, `cost.module.ts` as specified in Step 5
- [ ] **Import `ProvidersModule` + `CostModule`** into `ExecutionModule`
- [ ] **Write all unit tests** — 17 tests across 3 spec files as specified in Step 10
- [ ] **Delete orphan `src/execution/`** folder after merging into `src/modules/execution/`
- [ ] **Clean up commented-out code** in `execution.controller.ts` and `execution.service.ts`

### Priority 2 — Production Hardening

- [ ] **Fix timeout timer leak** — `setTimeout` in `Promise.race` (line ~83 of `execution-engine.service.ts`) is never cleared on success; wrap in a utility that calls `clearTimeout` when the primary promise resolves
- [ ] **Cache API keys at startup** — `resolveApiKey()` reads from filesystem on every `generate()` call; resolve once in the adapter constructor and cache
- [ ] **Graceful shutdown** — add `app.enableShutdownHooks()` in `main.ts`; implement `OnModuleDestroy` in services that hold resources
- [ ] **gRPC request validation** — validate incoming `ExecutionRequest` fields (non-empty messages, valid provider config, non-empty trace) before delegating; return structured error
- [ ] **Remove unused dependencies** — `@nestjs/platform-express`, `supertest`, `source-map-support` are not needed for a pure gRPC microservice
- [ ] **Relaxed env validation in `main.ts`** — `NODE_ENV` and `LOG_LEVEL` should have sensible defaults instead of throwing; only `CORE_GRPC_PORT` is truly required (or default to 4000)

### Priority 3 — Observability & Operations

- [ ] **Structured error codes** — define an `ErrorCode` enum (`PROVIDER_UNAVAILABLE`, `TIMEOUT`, `SCHEMA_VALIDATION_FAILED`, `ALL_RETRIES_EXHAUSTED`) instead of free-form error strings
- [ ] **Health check should verify dependencies** — check that Gemini API key is resolvable, pricing config is loaded; return `NOT_SERVING` if not
- [ ] **Metrics endpoint** — expose Prometheus-compatible metrics (request count, latency histogram, cost per model, error rate) via `prom-client`
- [ ] **Request ID propagation** — log `traceId` in gRPC metadata so callers can correlate
- [ ] **Cost alerting hooks** — emit events when cost exceeds configurable thresholds per user/feature

### Priority 4 — Deployment & CI/CD

- [ ] **Create Dockerfile** — multi-stage build as specified in Step 11b
- [ ] **Create `.dockerignore`** — as specified in Step 11d
- [ ] **Create `docker-stack.yml`** — as specified in Step 11c
- [ ] **CI pipeline** — GitHub Actions or similar: lint → build → test → Docker build
- [ ] **Proto migration to nomi-shared** — delete local `src/proto/core.proto`, use `require.resolve('@nomi-labs/nomi-shared/proto/core.proto')`
- [ ] **gRPC reflection** — enable for dev/staging so `grpcurl` and Postman can discover services

### Priority 5 — Scalability (Post-MVP)

- [ ] **Circuit breaker pattern** — wrap provider calls in a circuit breaker that opens after N consecutive failures, preventing cascade failures
- [ ] **Connection pooling for Gemini** — reuse the `google` provider instance instead of creating one per `generate()` call
- [ ] **Rate limiting per user** — prevent any single user from exhausting the LLM budget; implement at the execution engine level
- [ ] **Prisma persistence for cost** — replace in-memory `CostRecord[]` with PostgreSQL (Step 13)
- [ ] **gRPC streaming** — implement `ExecuteStream` for real-time token streaming (Step 12)
