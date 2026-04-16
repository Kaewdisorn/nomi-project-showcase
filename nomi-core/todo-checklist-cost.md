# nomi-core — Cost Module Build Guide

Complete step-by-step guide to implement the cost module and wire it into the execution pipeline.

---

## What We're Building

```
prisma/
  schema.prisma             ← Prisma schema with ModelPricing table

src/
  database/
    prisma.service.ts       ← PrismaClient wrapper with lifecycle hooks
    database.module.ts      ← @Global() NestJS module exporting PrismaService

  modules/cost/
    model-pricing.config.ts ← ModelPricing interfaces + MODEL_PRICING_TOKEN
    cost-tracker.service.ts ← records cost, queries by user/feature
    cost.module.ts          ← NestJS module; loads pricing map from DB at startup
    __tests__/
      cost-tracker.service.spec.ts
```

**After this is done:**

- Model pricing rows live in PostgreSQL (`model_pricing` table) — no `MODEL_PRICING` env var
- Pricing map is loaded once at startup via Prisma; unknown model throws fail-fast
- `ExecutionService.buildResponse()` calculates real costs instead of zeros
- `GetCostByUser` and `GetCostByFeature` gRPC handlers work
- All unit tests pass

---

## Step 0 — Prisma Setup

### 0a — Install dependencies

```powershell
npm install @prisma/client @prisma/adapter-pg pg
npm install --save-dev prisma @types/pg
```

**Checklist:**

- [x] `@prisma/client` and `prisma` installed
- [x] `@prisma/adapter-pg` and `pg` installed

---

### 0b — `prisma/schema.prisma`

**File:** `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model ModelPricing {
  id        Int      @id @default(autoincrement())
  model     String   @unique
  input     Float    // USD per 1M input tokens
  output    Float    // USD per 1M output tokens
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("model_pricing")
}
```

**Checklist:**

- [x] File created at `prisma/schema.prisma`

---

### 0c — Run migration

```powershell
npx prisma migrate dev --name init
npx prisma generate
```

**Checklist:**

- [x] `prisma/migrations/` directory created
- [x] `@prisma/client` generated (`node_modules/.prisma/client`)

---

### 0d — `src/database/prisma.service.ts`

**File:** `src/database/prisma.service.ts`

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
```

**Checklist:**

- [x] File created at `src/database/prisma.service.ts`

---

### 0e — `src/database/database.module.ts`

**File:** `src/database/database.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
```

**Checklist:**

- [x] File created at `src/database/database.module.ts`

---

### 0f — Register `DatabaseModule` in `AppModule`

**File:** `src/app.module.ts`

Add `DatabaseModule` to the `imports` array:

```typescript
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NomiLoggerModule,
    DatabaseModule, // ← add this
    ExecutionModule,
    HealthModule,
  ],
})
export class AppModule {}
```

**Checklist:**

- [x] `DatabaseModule` imported in `AppModule`

---

## Step 1 — `types/pricing.types.ts`

**File:** `src/modules/cost/types/pricing.types.ts` _(placed here instead of `model-pricing.config.ts`)_

```typescript
export interface ModelPricing {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

export type ModelPricingMap = Record<string, ModelPricing>;

export const MODEL_PRICING_TOKEN = Symbol('MODEL_PRICING');
```

**Checklist:**

- [x] File created at `src/modules/cost/types/pricing.types.ts`

---

## Step 2 — `cost-tracker.service.ts`

**File:** `src/modules/cost/cost-tracker.service.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import { CostRecord, TokenUsage } from './types/cost.types';
import { ExecutionTrace } from '@common/types/trace.types';
import { MODEL_PRICING_TOKEN, ModelPricingMap } from './types/pricing.types';

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

  getByUser(userId: string): { records: CostRecord[]; totalCost: number } {
    const userRecords = this.records.filter((r) => r.trace.userId === userId);
    return {
      records: userRecords,
      totalCost: userRecords.reduce((sum, r) => sum + r.totalCost, 0),
    };
  }

  getByFeature(featureId: string): {
    records: CostRecord[];
    totalCost: number;
  } {
    const featureRecords = this.records.filter(
      (r) => r.trace.featureId === featureId,
    );
    return {
      records: featureRecords,
      totalCost: featureRecords.reduce((sum, r) => sum + r.totalCost, 0),
    };
  }
}
```

**Checklist:**

- [x] File created at `src/modules/cost/cost-tracker.service.ts`
- [x] `record()` throws on unknown model (fail-fast, never silently returns zero cost)
- [x] `record()` logs with full `LogContext` (traceId, userId, featureId, service)
- [ ] `getByUser()` and `getByFeature()` filter from in-memory array _(methods not yet implemented)_

---

## Step 3 — `cost.module.ts`

**File:** `src/modules/cost/cost.module.ts`

The factory is `async` and uses `PrismaService` to load all pricing rows from the `model_pricing` table at startup. If the table is empty the service throws immediately (fail-fast).

```typescript
import { Module } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { CostTrackerService } from './cost-tracker.service';
import { MODEL_PRICING_TOKEN, ModelPricingMap } from './types/pricing.types';

@Module({
  providers: [
    CostTrackerService,
    {
      provide: MODEL_PRICING_TOKEN,
      useFactory: async (prisma: PrismaService): Promise<ModelPricingMap> => {
        const rows = await prisma.modelPricing.findMany();
        if (rows.length === 0) {
          throw new Error(
            'No rows in model_pricing table — seed the database before starting',
          );
        }
        return Object.fromEntries(
          rows.map((r) => [r.model, { input: r.input, output: r.output }]),
        );
      },
      inject: [PrismaService],
    },
  ],
  exports: [CostTrackerService],
})
export class CostModule {}
```

> `PrismaService` is available here because `DatabaseModule` is `@Global()` and is imported in `AppModule` (Step 0f).

**Checklist:**

- [x] File created at `src/modules/cost/cost.module.ts`
- [x] `MODEL_PRICING_TOKEN` factory is `async` and uses `PrismaService`
- [x] Empty `model_pricing` table throws at startup — fail-fast before any request
- [x] `CostTrackerService` is exported so `ExecutionModule` can use it

---

## Step 4 — Wire `CostModule` into `ExecutionModule`

**File:** `src/modules/execution/execution.module.ts`

Replace the current content:

```typescript
import { Module } from '@nestjs/common';
import { ExecutionController } from '@modules/execution/execution.controller';
import { ExecutionService } from '@modules/execution/execution.service';
import { ProvidersModule } from '@modules/providers/providers.module';
import { CostModule } from '@modules/cost/cost.module';

@Module({
  imports: [ProvidersModule, CostModule],
  controllers: [ExecutionController],
  providers: [ExecutionService],
})
export class ExecutionModule {}
```

**Checklist:**

- [x] `CostModule` imported in `ExecutionModule`

---

## Step 5 — Inject `CostTrackerService` into `ExecutionService`

**File:** `src/modules/execution/execution.service.ts`

### 5a — Add import

```typescript
import { CostTrackerService } from '@modules/cost/cost-tracker.service';
```

### 5b — Add to constructor

```typescript
constructor(
  private readonly logger: NomiLoggerService,
  @Inject(PROVIDER_ADAPTER) private readonly adapters: IProviderAdapter[],
  private readonly costTracker: CostTrackerService,
) {}
```

### 5c — Replace `buildResponse()` to call real cost tracking

Find the `buildResponse()` private method and replace the hardcoded zero-cost block:

```typescript
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
```

**Checklist:**

- [x] `CostTrackerService` imported at top of file
- [x] `CostTrackerService` added to constructor
- [x] `buildResponse()` calls `this.costTracker.record()` — no more hardcoded zero costs
- [x] Cost is recorded on both valid and invalid (schema mismatch) responses

---

## Step 6 — Add Cost Handlers to `ExecutionController`

**File:** `src/modules/execution/execution.controller.ts`

Replace the current content:

```typescript
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ExecutionRequest, ExecutionResponse } from './types/execution.types';
import { ExecutionService } from './execution.service';
import { CostTrackerService } from '@modules/cost/cost-tracker.service';

@Controller()
export class ExecutionController {
  constructor(
    private readonly engine: ExecutionService,
    private readonly costTracker: CostTrackerService,
  ) {}

  @GrpcMethod('CoreService', 'Execute')
  execute(data: ExecutionRequest): Promise<ExecutionResponse> {
    return this.engine.execute(data);
  }

  @GrpcMethod('CoreService', 'GetCostByUser')
  getCostByUser(data: { userId: string }) {
    return this.costTracker.getByUser(data.userId);
  }

  @GrpcMethod('CoreService', 'GetCostByFeature')
  getCostByFeature(data: { featureId: string }) {
    return this.costTracker.getByFeature(data.featureId);
  }
}
```

**Checklist:**

- [ ] `CostTrackerService` injected in constructor (currently commented out)
- [ ] `GetCostByUser` handler implemented — matches proto RPC name exactly
- [ ] `GetCostByFeature` handler implemented — matches proto RPC name exactly

---

## Step 7 — Unit Tests

**File:** `src/modules/cost/__tests__/cost-tracker.service.spec.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';
import { CostTrackerService } from '../cost-tracker.service';
import { ModelPricingMap } from '../types/pricing.types';

const TEST_PRICING: ModelPricingMap = {
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as NomiLoggerService;

function makeTrace(
  overrides?: Partial<{ traceId: string; userId: string; featureId: string }>,
) {
  return {
    traceId: 'trace-1',
    userId: 'user-1',
    featureId: 'feat-1',
    ...overrides,
  };
}

describe('CostTrackerService', () => {
  let service: CostTrackerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CostTrackerService(mockLogger, TEST_PRICING);
  });

  it('calculates cost correctly', () => {
    const result = service.record({
      trace: makeTrace(),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
      },
    });

    expect(result.inputCost).toBeCloseTo(0.1); // 1M * $0.10/1M
    expect(result.outputCost).toBeCloseTo(0.4); // 1M * $0.40/1M
    expect(result.totalCost).toBeCloseTo(0.5);
  });

  it('throws on unknown model', () => {
    expect(() =>
      service.record({
        trace: makeTrace(),
        provider: 'gemini',
        model: 'unknown-model',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    ).toThrow('Unknown model "unknown-model"');
  });

  it('queries records by user', () => {
    service.record({
      trace: makeTrace({ userId: 'user-1' }),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });
    service.record({
      trace: makeTrace({ userId: 'user-2' }),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
    });

    const { records, totalCost } = service.getByUser('user-1');
    expect(records).toHaveLength(1);
    expect(records[0].trace.userId).toBe('user-1');
    expect(totalCost).toBeGreaterThan(0);
  });

  it('queries records by feature', () => {
    service.record({
      trace: makeTrace({ featureId: 'feat-a' }),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });
    service.record({
      trace: makeTrace({ featureId: 'feat-b' }),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
    });

    const { records } = service.getByFeature('feat-a');
    expect(records).toHaveLength(1);
    expect(records[0].trace.featureId).toBe('feat-a');
  });

  it('logs after recording cost', () => {
    service.record({
      trace: makeTrace(),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Cost recorded',
      expect.objectContaining({
        traceId: 'trace-1',
        userId: 'user-1',
        service: 'nomi-core',
      }),
      expect.objectContaining({ model: 'gemini-2.0-flash' }),
    );
  });
});
```

**Checklist:**

- [ ] Directory `src/modules/cost/__tests__/` created
- [ ] File created at `src/modules/cost/__tests__/cost-tracker.service.spec.ts`
- [ ] `npm test` → all 5 tests pass

---

## Step 8 — Configure Database and Verify Startup

### 8a — Set `DATABASE_URL` in `.env`

Open `.env` and confirm this line exists (add it if missing):

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/nomi_core
```

Replace `USER`, `PASSWORD`, and the database name as appropriate for your local setup.

### 8b — Run migration and seed

If not already done in Step 0:

```powershell
npx prisma migrate dev --name init
npx prisma db seed
```

### 8c — Verify pricing rows exist

```powershell
npx prisma studio
# or query directly:
npx prisma db execute --stdin <<< "SELECT model, input, output FROM model_pricing;"
```

Expected rows:

| model                          | input | output |
| ------------------------------ | ----- | ------ |
| gemini-2.0-flash               | 0.10  | 0.40   |
| gemini-2.5-flash-preview-04-17 | 0.15  | 0.60   |

**Checklist:**

- [x] `DATABASE_URL` set in `.env`
- [x] `model_pricing` table contains at least the two Gemini rows (gemini-2.0-flash, gemini-2.5-flash-preview-04-17, gemini-3.1-flash-lite-preview)
- [ ] `npm run build` — clean, zero errors
- [ ] `npm run start:dev` — service starts, pricing map loaded from DB, no crash

---

## Final Verification

```powershell
npm run build
npm test
```

Expected test output:

```
✓ src/modules/cost/__tests__/cost-tracker.service.spec.ts (5)
  ✓ calculates cost correctly
  ✓ throws on unknown model
  ✓ queries records by user
  ✓ queries records by feature
  ✓ logs after recording cost
```

- [ ] Build succeeds
- [ ] All 5 cost tests pass
- [x] `buildResponse()` no longer has hardcoded zero costs
- [ ] `GetCostByUser` and `GetCostByFeature` RPCs wired and functional
- [ ] `model_pricing` table seeded and service loads pricing map from DB at startup
- [ ] **Cost module complete**
