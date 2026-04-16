# nomi-core — Open Tasks

Last reviewed: 2026-04-08

---

## Prerequisites

- [ ] `@nomi-labs/nomi-shared` updated: proto moved in, duplicate types removed, only `LogContext` remains as hand-written TS type, `proto/core.proto` shipped as package asset (`"files": ["dist", "proto"]`)
- [ ] Google Gemini API key available in `.env`

---

## MVP — Remaining Steps

### Step 2 — Proto migration to nomi-shared

- [ ] Create `proto/core.proto` in nomi-shared repo (use local `src/proto/core.proto` as source)
- [ ] Fix `CostSummary` in proto: replace `request_count` with `repeated CostRecord records`
- [ ] Update `nomi-shared/package.json`: add `"files": ["dist", "proto"]`
- [ ] Republish `@nomi-labs/nomi-shared`
- [ ] In nomi-core: delete `src/proto/core.proto`, update `protoPath` in `main.ts` to `require.resolve('@nomi-labs/nomi-shared/proto/core.proto')`, remove `assets` from `nest-cli.json`

### Step 5 — Cost Module

- [ ] Create `src/modules/cost/model-pricing.config.ts` — `ModelPricing`, `ModelPricingMap`, `MODEL_PRICING_TOKEN`
- [ ] Create `src/modules/cost/cost-tracker.service.ts` — `record()`, `getByUser()`, `getByFeature()`; throws on unknown model; uses `NomiLoggerService`
- [ ] Create `src/modules/cost/cost.module.ts` — provides `CostTrackerService` + `MODEL_PRICING_TOKEN` factory from `ConfigService`

### Step 6 — Providers Module location fix

- [ ] Move `src/providers/providers.module.ts` → `src/modules/providers/providers.module.ts`
- [ ] Update import path in `src/modules/execution/execution.module.ts`

### Step 7 — Execution Engine loose ends

- [ ] Inject `CostTrackerService` into `ExecutionService`; call `costTracker.record()` in `buildResponse()` instead of hardcoding zero costs
- [ ] Fix timeout timer leak in `generateWithTimeout`: track the `setTimeout` handle and call `clearTimeout` on the success path

### Step 8 — Wire cost into Controller + Module

- [ ] Import `CostModule` into `ExecutionModule`
- [ ] Uncomment and implement `CostTrackerService` injection in `ExecutionController`
- [ ] Add `GetCostByUser` handler: `@GrpcMethod('CoreService', 'GetCostByUser')` → `costTracker.getByUser(data.userId)`
- [ ] Add `GetCostByFeature` handler: `@GrpcMethod('CoreService', 'GetCostByFeature')` → `costTracker.getByFeature(data.featureId)`

### Step 9 — main.ts

- [ ] Migrate `protoPath` to `require.resolve('@nomi-labs/nomi-shared/proto/core.proto')` once Step 2 is complete

### Step 10 — Unit Tests

- [ ] Create `src/modules/cost/__tests__/cost-tracker.service.spec.ts` — 5 tests: correct cost calc, unknown model throws, query by user, query by feature, logs on record
- [ ] Create `src/modules/providers/__tests__/gemini.adapter.spec.ts` — 5 tests: name, returns raw+usage, defaults 0 on missing usage, logs on success, propagates errors
- [ ] Create `src/modules/execution/__tests__/execution.service.spec.ts` — 7 tests: success on attempt 1, retry + succeed, all retries exhausted, fallback provider, unknown provider, Zod mismatch sets valid=false, cost always recorded
- [ ] `npm test` → all 17 tests green

### Step 11 — Integration Client + Docker

- [ ] Complete `test/test-client.ts`: add `GetCostByUser` and `GetCostByFeature` calls
- [ ] Create `Dockerfile` — multi-stage: `node:22-alpine` builder + slim runtime
- [ ] Create `docker-stack.yml` — service with secrets + configs
- [ ] Create `.dockerignore` — exclude `node_modules`, `dist`, `.env`, `.git`

---

## MVP Verification

- [ ] `npm run build` — clean, zero errors
- [ ] `npm test` — all 17 tests pass
- [ ] Service starts on gRPC port 4000
- [ ] `test/test-client.ts` successfully calls all 4 RPCs (Health, Execute, GetCostByUser, GetCostByFeature)
- [ ] **MVP COMPLETE**

---

## Production Hardening (Pre-release)

- [ ] **Graceful shutdown** — add `app.enableShutdownHooks()` in `main.ts`; implement `OnModuleDestroy` in services holding resources
- [ ] **gRPC request validation** — validate incoming `ExecutionRequest` (non-empty messages, valid provider config, non-empty trace) before delegating; return structured error response
- [ ] **Remove unused dependencies** — `@nestjs/platform-express`, `supertest`, `source-map-support` from `package.json`
- [ ] **Structured error codes** — define `ErrorCode` enum (`PROVIDER_UNAVAILABLE`, `TIMEOUT`, `SCHEMA_VALIDATION_FAILED`, `ALL_RETRIES_EXHAUSTED`) instead of free-form strings
- [ ] **Health check verify dependencies** — check that Gemini API key resolves and pricing config is loaded; return `NOT_SERVING` if either is missing

---

## Observability

- [ ] **Metrics endpoint** — expose Prometheus-compatible metrics (request count, latency histogram, cost per model, error rate) via `prom-client`
- [ ] **Request ID propagation** — attach `traceId` to outgoing gRPC metadata for cross-service correlation
- [ ] **Cost alerting hooks** — emit events when cost exceeds configurable thresholds per user/feature

---

## Deployment & CI/CD

- [ ] **CI pipeline** — GitHub Actions: lint → build → test → Docker build
- [ ] **gRPC reflection** — install `@grpc/reflection`, enable in bootstrap for dev/staging; verify with `grpcurl -plaintext localhost:4000 list`

---

## Post-MVP

### Step 12 — gRPC Streaming (`ExecuteStream`)

- [ ] Add `ExecuteStream` RPC + `ExecutionChunk` message to `core.proto`
- [ ] Implement `executeStream()` in `ExecutionController` using `Observable<ExecutionChunk>`
- [ ] Implement `executeStream()` in `ExecutionService`
- [ ] Add test coverage

### Step 13 — Prisma Persistence for Cost

- [ ] `npm install prisma @prisma/client`
- [ ] Create `prisma/schema.prisma` with `CostRecord` model
- [ ] `npx prisma generate` + `npx prisma migrate dev`
- [ ] Update `CostTrackerService` to use `PrismaClient` instead of in-memory array
- [ ] Make `getByUser()` / `getByFeature()` async; update controller accordingly
- [ ] Update tests with Prisma mock

### Step 14 — Standard gRPC Health Check

- [ ] Add `health.proto` (standard gRPC health check protocol)
- [ ] Implement `HealthController` compatible with standard health check clients

### Step 15 — gRPC Reflection

- [ ] Install `@grpc/reflection`
- [ ] Enable in `main.ts` bootstrap
- [ ] Verify: `grpcurl -plaintext localhost:4000 list` returns `nomi.core.CoreService`

### Step 16 — nomi-biseo Integration

- [ ] Update nomi-biseo to gRPC transport (replace TCP)
- [ ] Reference proto from `@nomi-labs/nomi-shared` (not a local copy)
- [ ] Integration test all RPCs end-to-end

---

## Scalability (Future)

- [ ] **Circuit breaker** — open after N consecutive provider failures to prevent cascade failures
- [ ] **Rate limiting per user** — cap LLM spend per user/feature at the execution engine level
- [ ] **Multi-provider support** — add OpenAI, Anthropic adapters following `IProviderAdapter` contract
