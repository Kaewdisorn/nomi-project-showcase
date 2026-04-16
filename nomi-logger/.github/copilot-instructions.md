# Copilot Instructions — nomi-logger

> Shared structured logging library for the Nomi ecosystem.

---

## What This Repo Is

`nomi-logger` is a NestJS-compatible structured logging library used across all Nomi services.
It provides a consistent log format, log correlation via `traceId`, and Pino under the hood.

Every Nomi service (`nomi-core`, `nomi-biseo`, `nomi-company`) uses `nomi-logger`.
No service implements its own logging. All logging goes through this package.

---

## Where It Sits in the Nomi Stack

```
nomi-company   →  uses nomi-logger
nomi-biseo     →  uses nomi-logger
nomi-core      →  uses nomi-logger
               ↑
          nomi-logger   ←  you are here
               ↑
          nomi-shared   (LogContext type lives here)
```

`nomi-logger` depends on `nomi-shared` for the `LogContext` type only.
It does not depend on any other Nomi service.

---

## Tech Stack

| Concern        | Technology          |
|----------------|---------------------|
| Framework      | NestJS              |
| Language       | TypeScript (strict) |
| Logger         | Pino + nestjs-pino  |
| Package Manager| npm                 |
| Testing        | Vitest              |

---

## Package Structure

```
nomi-logger/
├── src/
│   ├── index.ts                   ← Public exports
│   ├── nomi-logger.module.ts      ← NestJS global module
│   ├── nomi-logger.service.ts     ← Logging service (wraps Pino)
│   └── nomi-logger.config.ts      ← Pino config factory
├── src/__tests__/
│   └── nomi-logger.service.spec.ts
├── dist/                          ← Compiled output (committed)
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Core Concepts

### LogContext

Sourced from `nomi-shared`. Always included in every log entry.

```typescript
interface LogContext {
  traceId: string;   // from ExecutionTrace — ties logs across services
  userId: string;    // required — every call originates from a user
  featureId: string; // required — every call must identify its feature
  service: string;   // required — name of the calling service, e.g. 'nomi-core'
}
```

### Log Levels

Use the standard set: `debug`, `info`, `warn`, `error`.
Never invent custom levels.

### Log Entry Shape

Every log must be structured JSON with at minimum:

```json
{
  "level": "info",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "service": "nomi-core",
  "traceId": "abc-123",
  "message": "Execution completed",
  "...additionalFields": {}
}
```

---

## NomiLoggerService API

```typescript
class NomiLoggerService {
  debug(message: string, context: LogContext, meta?: Record<string, unknown>): void
  info(message: string, context: LogContext, meta?: Record<string, unknown>): void
  warn(message: string, context: LogContext, meta?: Record<string, unknown>): void
  error(message: string, context: LogContext, error?: Error, meta?: Record<string, unknown>): void
}
```

- `context` is always required — never log without a `traceId`
- `meta` is optional structured data relevant to the log entry
- `error` on the `error()` method serializes the error stack automatically

---

## NomiLoggerModule

`NomiLoggerModule` is a **global NestJS module**.
Consuming services import it once in their root `AppModule`.

```typescript
// In consuming service's AppModule
@Module({
  imports: [NomiLoggerModule],
})
export class AppModule {}

// Then inject anywhere
constructor(private readonly logger: NomiLoggerService) {}
```

---

## Design Rules

These rules are non-negotiable. Follow them in every suggestion.

1. **Always include `traceId`** — Never generate a log without a `traceId` in context. This is how logs are correlated across services.

2. **Structured output only** — All logs must be JSON. No plain string logging with `console.log`.

3. **No business logic** — `nomi-logger` is pure infrastructure. It must not know about Biseo, agents, users, or Nomi-specific concepts.

4. **No direct Pino usage in consuming services** — Services must use `NomiLoggerService`. Never import Pino directly in `nomi-core`, `nomi-biseo`, or `nomi-company`.

5. **No silent errors** — If the logger itself fails, it must fail loudly at bootstrap, not silently at runtime.

6. **Pretty logging in dev, JSON in production** — Controlled via `NODE_ENV`. Use `pino-pretty` transport when `NODE_ENV !== 'production'`.

7. **Service name is required at module registration** — Each consuming service must identify itself so logs can be filtered by service.

8. **Do not log sensitive data** — Never log passwords, API keys, raw LLM prompts, or full user messages. Log IDs and metadata only.

---

## Environment Variables

| Variable    | Required | Default  | Description                              |
|-------------|----------|----------|------------------------------------------|
| `NODE_ENV`  | No       | —        | Set to `production` to disable pretty print |
| `LOG_LEVEL` | No       | `info`   | Minimum log level: debug, info, warn, error |

---

## How Consuming Services Use This

### nomi-core example

```typescript
// In ExecutionEngineService
this.logger.info('Execution started', {
  traceId: trace.traceId,
  userId: trace.userId,
  featureId: trace.featureId,
  service: 'nomi-core',
}, { model: request.provider.model });
```

### Error logging example

```typescript
this.logger.error('LLM call failed', {
  traceId: trace.traceId,
  userId: trace.userId,
  featureId: trace.featureId,
  service: 'nomi-core',
}, error, { attempt: retryCount });
```

---

## What NOT to Build Here

- Do not add request interceptors or HTTP middleware — that belongs in each service
- Do not add log aggregation or shipping (e.g. sending to Datadog) — out of scope for MVP
- Do not add a log query API — logs are consumed externally via stdout
- Do not add any NestJS guards, pipes, or filters
- Do not import from `nomi-core`, `nomi-biseo`, or `nomi-company`

---

## Testing Rules

- Use Vitest for all tests
- Test `NomiLoggerService` methods produce correct structured output
- Mock Pino in unit tests — never let tests write to stdout
- Verify that missing `traceId` is handled (warn or enforce at type level)
- Test that `NODE_ENV=production` disables pretty printing

---

## Related Repos

| Repo           | Role                                              |
|----------------|---------------------------------------------------|
| `nomi-shared`  | Provides `LogContext` type used by this package   |
| `nomi-core`    | Primary consumer — AI execution engine            |
| `nomi-biseo`   | Consumer — personal AI assistant                  |
| `nomi-company` | _(planned)_ Consumer — agent workforce            |
