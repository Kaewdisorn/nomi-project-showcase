# nomi-shared

> Shared TypeScript contracts for the Nomi ecosystem — TCP message patterns, execution interfaces, and cross-service types.

`nomi-shared` is the single source of truth for all types and interfaces that cross service boundaries in the Nomi platform. Every service that communicates with `nomi-core` over TCP imports its contracts from here.

---

## What This Package Contains

- **TCP message patterns** — `CORE_PATTERNS` constant with all `nomi-core` message pattern strings
- **Execution contracts** — `ExecutionRequest`, `ExecutionResponse`, `ExecutionTrace`, `ExecutionPolicy`
- **Provider types** — `ProviderConfig`, `TokenUsage`
- **Cost types** — `CostRecord`

## What This Package Does NOT Contain

- Business logic of any kind
- NestJS or framework-specific code
- Types that are internal to a single service (e.g. `IProviderAdapter`, `ZodType` schemas)
- Runtime dependencies beyond TypeScript

---

## Installation

Install via GitHub (no registry required):

```bash
npm install github:your-org/nomi-shared#main
```

---

## Usage

```typescript
import {
  CORE_PATTERNS,
  ExecutionRequest,
  ExecutionResponse,
  ExecutionTrace,
  ProviderConfig,
  CostRecord,
} from 'nomi-shared';
```

---

## Package Structure

```
nomi-shared/
├── src/
│   └── index.ts        ← All exported types and constants
├── dist/               ← Compiled output (committed, no build step needed by consumers)
├── tsconfig.json
└── package.json
```

---

## Consumers

| Service | Role |
|---------|------|
| `nomi-core` | AI execution engine — implements these contracts |
| `nomi-biseo` | Personal AI assistant — sends requests using these contracts |
| `nomi-company` | _(planned)_ Agent workforce — same contracts for agent execution |

---

## Development

### Prerequisites

- Node.js 20+
- npm 10+

### Build

```bash
npm install
npm run build        # compile once
npm run build:watch  # watch mode
```

### Making Changes

1. Edit `src/index.ts`
2. Run `npm run build`
3. Commit both `src/` and `dist/` — consumers install directly from GitHub and need the compiled output

> **Versioning:** Tag releases when making breaking changes so consumers can pin to a specific version:
> ```bash
> git tag v1.1.0
> git push origin v1.1.0
> ```
> Then consumers can install with: `npm install github:your-org/nomi-shared#v1.1.0`

---

## Related Repos

| Repo | Role |
|------|------|
| `nomi-core` | AI Execution Engine — primary implementor of these contracts |
| `nomi-biseo` | Personal AI Assistant — primary consumer |
| `nomi-company` | _(planned)_ Multi-agent AI workforce |
