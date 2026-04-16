# nomi-biseo

> Personal AI Assistant — the user's Chief of Staff in the Nomi ecosystem.

nomi-biseo is the user's single point of contact in Nomi.
It receives messages from any channel (LINE, KakaoTalk, and more Post-MVP),
understands context through persistent memory, delegates AI execution to nomi-core,
and delivers personalized responses — all through one relationship that grows smarter over time.

Every user interaction in the Nomi ecosystem goes through Biseo. No exceptions.

> **Channel strategy:** MVP launches with **LINE** and **KakaoTalk** to target Korean/Asian users.
> Web (REST API) and Telegram are deferred to Post-MVP once the core assistant is validated.

---

## Where nomi-biseo Sits

nomi-biseo is the middle layer of the Nomi stack.
It holds all user-facing logic, memory, and orchestration.
It never calls LLM providers directly — it delegates to nomi-core.

- **Nomi Company** (future) — Multi-agent AI workforce. Biseo delegates complex tasks to Company.
- **Nomi Biseo** ← you are here — Personal AI assistant. Receives user messages, orchestrates responses.
- **Nomi Core** — AI execution engine. Runs LLM calls on behalf of Biseo.

```
┌─────────────────────────────────────────┐
│           Nomi Company                  │
│        AI Agent Workforce               │
├─────────────────────────────────────────┤
│           Nomi Biseo    ← you are here  │
│      Personal AI Assistant              │
├─────────────────────────────────────────┤
│           Nomi Core                     │
│       AI Execution Engine               │
└─────────────────────────────────────────┘
```

---

## What nomi-biseo Does

- **Multi-Channel Input** — Receives user messages from LINE (webhook) and KakaoTalk (OpenBuilder webhook) in MVP. Post-MVP: Web (REST API), Telegram (webhook), and any future channel. All channels produce a standardized `IncomingMessage`.
- **Persistent Memory** — Maintains a four-layer memory model per user: Profile, Goals, Habits, Interaction History. Memory is the foundation of personalization. _(MVP: in-memory; Post-MVP: relational store via Prisma + vector store via pgvector for semantic interaction retrieval)_
- **Conversation Orchestration** — Builds LLM prompts enriched with user memory context, calls nomi-core via TCP, and returns personalized responses.
- **Request Classification** — _(Post-MVP)_ Classifies incoming messages as `chat`, `simple_task`, or `workflow_task` to route them appropriately.
- **Task Planning** — _(Post-MVP)_ Decomposes complex goals into subtasks and delegates to Nomi Company agents.
- **Proactive Features** — _(Post-MVP)_ Morning briefings, reminders, and follow-ups initiated by Biseo.

## What nomi-biseo Must NEVER Do

- Call LLM providers directly — always delegate to nomi-core
- Expose internal agent operations to the user
- Return a silent failure — always respond with something
- Lose user context between conversations
- Know about LLM provider internals (models, tokens, pricing)

---

## Tech Stack

| Concern | Technology | Stage |
|---------|------------|-------|
| Framework | NestJS (HTTP) | MVP |
| Channel: LINE | Messaging API webhook | MVP |
| Channel: KakaoTalk | OpenBuilder skill server webhook | MVP |
| Channel: Web | REST API (`/api/chat`) | Post-MVP |
| Channel: Telegram | Bot API webhook | Post-MVP |
| Transport (inbound) | HTTP / Webhooks | MVP |
| Transport (to nomi-core) | TCP Client | MVP |
| Language | TypeScript (strict mode) | MVP |
| Logging | Pino via nestjs-pino | MVP |
| Testing | Vitest | MVP |
| Package Manager | npm | MVP |
| Shared Types | nomi-shared (GitHub package) | MVP |
| Database ORM | Prisma | Post-MVP |
| Database | PostgreSQL | Post-MVP |
| Vector Store | pgvector (PostgreSQL extension) | Post-MVP |

---

## Getting Started

**Prerequisites:** Node.js 20+, npm 10+, nomi-core running on TCP port 4000.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure
3. Run in dev mode: `npm run start:dev`
4. For production: `npm run build` then `npm start`

The HTTP server listens on port **3000** by default.

**Testing:** `npm test` (run once), `npm run test:watch` (watch mode), `npm run test:cov` (coverage).

---

## Environment Variables

| Variable | Required | Stage | Description |
|----------|----------|-------|-------------|
| CORE_TCP_HOST | No | MVP | nomi-core TCP host (default: localhost) |
| CORE_TCP_PORT | No | MVP | nomi-core TCP port (default: 4000) |
| BISEO_HTTP_PORT | No | MVP | HTTP listen port (default: 3000) |
| LOG_LEVEL | No | MVP | Pino log level (default: info) |
| NODE_ENV | No | MVP | Set to `production` to disable pretty logging |
| DEFAULT_PROVIDER_NAME | No | MVP | Default LLM provider name (default: gemini) |
| DEFAULT_PROVIDER_MODEL | No | MVP | Default LLM model (default: gemini-2.0-flash) |
| LINE_CHANNEL_ACCESS_TOKEN | No | MVP | LINE Messaging API access token |
| LINE_CHANNEL_SECRET | No | MVP | LINE channel secret for webhook validation |
| KAKAO_APP_KEY | No | MVP | KakaoTalk app key (optional: for push API) |
| TELEGRAM_BOT_TOKEN | No | Post-MVP | Telegram Bot API token |
| DATABASE_URL | **Yes** | Post-MVP | Prisma DB connection string (also used by pgvector — same instance) |

---

## API Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/webhook/line` | LINE webhook receiver — processes message events | MVP |
| POST | `/webhook/kakao` | KakaoTalk OpenBuilder skill server — processes utterances | MVP |
| POST | `/api/chat` | Web client chat — send `{ userId, message }`, receive `{ response }` | Post-MVP |
| POST | `/webhook/telegram` | Telegram webhook receiver — processes message updates | Post-MVP |

---

## Architecture

### Request Flow

A user sends a message through any channel (LINE, KakaoTalk; Post-MVP: Web, Telegram). The channel's controller receives it and normalizes it into an `IncomingMessage`. The `ChannelGatewayService` routes it to the `ConversationService`, which retrieves the user's `MemorySummary`, builds a personalized system prompt, and sends an `ExecutionRequest` to nomi-core over TCP. nomi-core runs the LLM call and returns an `ExecutionResponse`. The `ConversationService` records the interaction in memory and returns the response. The gateway dispatches the response back through the originating channel adapter.

### Memory Model

Biseo maintains four layers of memory per user:

| Layer | Description | Example |
|-------|-------------|---------|
| **Profile** | Static/slow-changing user info | Name, timezone, occupation |
| **Goals** | What the user is working toward | "Launch product by Q3" |
| **Habits** | Recurring patterns learned over time | "Morning news at 8am" |
| **Interactions** | Context from past conversations | Past decisions, preferences |

**Storage strategy (Post-MVP):**

| Data | Store | Why |
|------|-------|-----|
| Profile, Goals, Habits | PostgreSQL (Prisma) | Structured, always-relevant, small |
| Interaction History | pgvector (same PostgreSQL) | Semantic retrieval — most *relevant* past context, not just most recent |
| Personal Knowledge Base | pgvector | User-uploaded docs/notes retrieved via RAG |

Using pgvector on the same PostgreSQL instance (not a separate service like Pinecone) keeps infrastructure simple while remaining production-capable. Embedding calls are routed through nomi-core, keeping Biseo decoupled from provider details.

### Architecture Rules

1. All user messages enter through a channel adapter — nothing bypasses the gateway
2. Each channel is isolated in its own adapter implementing `IChannelAdapter`
3. All AI execution goes through nomi-core via TCP — Biseo never calls LLMs directly
4. Every conversation uses memory context — personalization is always active
5. Never return a silent failure — always respond to the user
6. Channel adapters are stateless — all state lives in the memory layer
7. Embedding generation goes through nomi-core — Biseo never calls embedding providers directly

---

## Project Structure

```
nomi-biseo/
├── src/
│   ├── main.ts                            ← Bootstrap HTTP server on port 3000
│   ├── app.module.ts                      ← Root module wiring
│   │
│   ├── channels/                          ← Channel adapter layer
│   │   ├── interfaces.ts                  ← ChannelType, IncomingMessage, OutgoingMessage, IChannelAdapter
│   │   ├── channel-gateway.service.ts     ← Normalizes incoming → orchestrator → outgoing
│   │   ├── channels.module.ts             ← Registers all channel adapters
│   │   ├── line/                          ← MVP
│   │   │   ├── line.adapter.ts            ← IChannelAdapter for LINE
│   │   │   └── line.controller.ts         ← POST /webhook/line
│   │   ├── kakao/                         ← MVP
│   │   │   ├── kakao.adapter.ts           ← IChannelAdapter for KakaoTalk OpenBuilder
│   │   │   └── kakao.controller.ts        ← POST /webhook/kakao
│   │   ├── web/                           ← Post-MVP
│   │   │   ├── web.adapter.ts
│   │   │   └── web.controller.ts          ← POST /api/chat
│   │   └── telegram/                      ← Post-MVP
│   │       ├── telegram.adapter.ts
│   │       └── telegram.controller.ts     ← POST /webhook/telegram
│   │
│   ├── conversation/                      ← Conversation orchestration
│   │   ├── interfaces.ts                  ← RequestType, ClassifiedRequest, ConversationContext
│   │   ├── conversation.service.ts        ← Classify → build context → call core → respond
│   │   └── conversation.module.ts
│   │
│   ├── memory/                            ← User memory (in-memory for MVP)
│   │   ├── interfaces.ts                  ← UserProfile, UserGoal, UserHabit, InteractionRecord
│   │   ├── memory.service.ts              ← CRUD + summary generation
│   │   └── memory.module.ts
│   │
│   └── core-client/                       ← nomi-core TCP client
│       ├── core-client.service.ts         ← Typed TCP client for nomi-core
│       └── core-client.module.ts          ← ClientsModule.register TCP config
│
├── test/
│   └── test-web-client.ts                 ← Manual HTTP test script
│
├── .env.example
├── .gitignore
├── dev.ps1
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── README.md
└── todo-checklist.md
```

**Post-MVP additions:**
```
nomi-biseo/
├── prisma/
│   ├── schema.prisma                      ← Memory data models
│   └── migrations/
│
└── src/
    ├── prisma/
    │   ├── prisma.service.ts              ← PrismaClient wrapper
    │   └── prisma.module.ts
    │
    ├── task-planning/                     ← Workflow task decomposition
    │   ├── task-planner.service.ts
    │   └── task-planning.module.ts
    │
    ├── company-client/                    ← Nomi Company TCP client
    │   ├── company-client.service.ts
    │   └── company-client.module.ts
    │
    ├── identity/                          ← Cross-channel user identity
    │   ├── identity.service.ts
    │   └── identity.module.ts
    │
    ├── scheduler/                         ← Proactive features (cron)
    │   ├── scheduler.service.ts
    │   └── scheduler.module.ts
    │
    └── memory/                            ← Expanded memory layer (Post-MVP)
        ├── memory.service.ts              ← Orchestrates both relational + vector stores
        ├── memory.module.ts
        ├── relational/
        │   └── prisma-memory.service.ts   ← Profile, goals, habits (structured)
        └── vector/
            ├── vector-memory.service.ts   ← Interaction retrieval by semantic similarity
            └── embedding.service.ts       ← Generates embeddings via nomi-core
```

---

## Adding a New Channel

1. Create `src/channels/<channel>/` folder
2. Create `<channel>.adapter.ts` implementing `IChannelAdapter`
3. Create `<channel>.controller.ts` with webhook/REST endpoint
4. Register the adapter in `channels.module.ts` under `CHANNEL_ADAPTER` token
5. Add env vars for API credentials in `.env.example`

No changes to the conversation, memory, or core-client layers are required.
