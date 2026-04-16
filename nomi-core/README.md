# nomi-core

> AI Execution Engine — the backbone of the Nomi ecosystem.

nomi-core is a NestJS gRPC microservice that handles every AI call in the Nomi platform. It abstracts LLM providers, validates structured outputs, manages retries and fallbacks, tracks costs, and provides full observability — with zero business logic.

---

## Where nomi-core Sits

nomi-core is the bottom layer of the Nomi stack. It never makes decisions, never sees users, never holds business logic. It is pure AI execution infrastructure.

```
Nomi Company  (future)  — Multi-agent AI workforce
Nomi Biseo              — Personal AI assistant
nomi-core      ← here  — Executes AI requests from any caller over gRPC
```

Biseo (and eventually Company) send requests to nomi-core over gRPC. nomi-core runs them through the right LLM provider and returns structured results.

---

## What It Does

**LLM Abstraction** — Each provider (Gemini, etc.) is isolated behind a common adapter interface. Callers never talk to providers directly.

**Structured Validation** — Callers attach a Zod schema to any request. If the LLM output doesn't match, the response is marked invalid — it never throws.

**Retry + Fallback** — Failed attempts retry with exponential backoff (1s → 2s → 4s). If a fallback provider is configured, it kicks in after the primary is exhausted.

**Cost Tracking** — Every execution produces a cost record, calculated per-model from a pricing table and tracked per-user and per-feature. _(MVP: in-memory; Post-MVP: persisted to PostgreSQL)_

**Execution Tracing** — Every request carries a `userId`, `featureId`, and `traceId` for full observability and log correlation.

**Streaming** _(Post-MVP)_ — Real-time token streaming via gRPC server streaming.

---

## What It Must Never Do

- Contain business logic of any kind
- Know about specific users or their preferences
- Know about Biseo features or Company agents
- Skip cost tracking on any execution
- Throw on LLM failure — always returns a structured `ExecutionResponse`

---

## Tech Stack

| Concern | Technology |
|---|---|
| Framework | NestJS 11 |
| Transport | gRPC (`@nestjs/microservices`) |
| Language | TypeScript 5 (strict mode) |
| AI SDK | Vercel AI SDK v5 (`ai`, `@ai-sdk/google`) |
| Schema Validation | Zod v4 |
| Logging | `@nomi-labs/nomi-logger` |
| Testing | Vitest |
| Contracts | `@nomi-labs/nomi-shared` + `src/contracts/` |
| Database _(Post-MVP)_ | PostgreSQL via Prisma |

---

## Project Structure

```
src/
  main.ts                        ← gRPC bootstrap (port 4000)
  app.module.ts                  ← Root module

  proto/
    core.proto                   ← Protobuf service definition (source of truth)

  contracts/
    interfaces.ts                ← IProviderAdapter, InternalExecutionRequest
    trace.util.ts                ← traceToLogContext()

  execution/
    core.controller.ts           ← @GrpcMethod handlers
    execution-engine.service.ts  ← Retry loop, fallback, Zod validation, cost recording

  providers/
    gemini.adapter.ts            ← Gemini provider via Vercel AI SDK
    providers.module.ts          ← Registers adapters

  cost/
    cost-tracker.service.ts      ← Records and queries cost per user/feature
    model-pricing.config.ts      ← Pricing map

  common/
    resolve-api-key.util.ts      ← Reads API keys from Docker secrets or env vars

test/
  test-client.ts                 ← Manual gRPC integration test client
```

---

## Request Flow

```
gRPC caller (nomi-biseo)
  → CoreController
  → ExecutionEngineService.execute()
      ├─ resolves provider adapter by name
      ├─ retry loop (max 3, backoff: 1s / 2s / 4s)
      │   └─ adapter.generate()  ← only place LLMs are called
      ├─ CostTrackerService.record()  ← always recorded
      ├─ optional Zod schema validation  ← sets valid=false, never throws
      └─ fallback provider if primary exhausted
  → ExecutionResponse  ← always returned, never thrown
```

---

## gRPC API — `nomi.core.CoreService`

| RPC | Status |
|---|---|
| `Execute` | ✅ Live |
| `GetCostByUser` | ✅ Live |
| `GetCostByFeature` | ✅ Live |
| `Health` | ✅ Live |
| `ExecuteStream` | Post-MVP |

---

## Related Repos

| Repo | Role |
|---|---|
| nomi-biseo | Personal AI Assistant — primary consumer of nomi-core |
| nomi-shared | Shared TypeScript interfaces + `LogContext` |
| nomi-logger | `NomiLoggerService` — structured logging for all Nomi services |
| nomi-company | _(planned)_ Multi-agent AI workforce |