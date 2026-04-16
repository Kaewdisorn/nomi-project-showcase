# nomi-logger

Shared structured logging library for the Nomi ecosystem.

Every Nomi service (`nomi-core`, `nomi-biseo`, `nomi-company`) uses `nomi-logger` for all logging. No service implements its own logger. No exceptions.

---

## What It Does

- Provides a single `NomiLoggerService` with `debug`, `info`, `warn`, and `error` methods
- Enforces structured JSON output on every log — no plain strings, no `console.log`
- Requires a `LogContext` on every call, which carries `traceId`, `userId`, `featureId`, and `service` — so logs from any service can be correlated back to a single request
- Pretty-prints in development, outputs pure JSON in production
- Ships as a NestJS global module — import once, inject anywhere

---

## Tech Stack

| Concern         | Technology          |
|-----------------|---------------------|
| Framework       | NestJS              |
| Language        | TypeScript (strict) |
| Logger          | Pino + pino-pretty  |
| Package Manager | npm                 |
| Testing         | Vitest              |

---

## Project Structure

```
nomi-logger/
├── src/
│   ├── index.ts                    <- Public exports
│   ├── nomi-logger.module.ts       <- NestJS global module
│   ├── nomi-logger.service.ts      <- NomiLoggerService (wraps Pino)
│   ├── nomi-logger.config.ts       <- Pino config factory
│   └── __tests__/
│       └── nomi-logger.service.spec.ts
├── dist/                           <- Compiled output (built by CI, git-ignored)
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Related Repos

| Repo             | Role                                        |
|------------------|---------------------------------------------|
| `nomi-shared`    | Provides the `LogContext` type              |
| `nomi-core`      | Primary consumer - AI execution engine      |
| `nomi-biseo`     | Consumer - personal AI assistant            |
| `nomi-company`   | (planned) Consumer - agent workforce        |