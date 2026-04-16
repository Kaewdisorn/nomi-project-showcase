# nomi-biseo — Project Plan

> **Personal AI Assistant** — the business-logic layer of the Nomi ecosystem.

nomi-biseo is a NestJS REST API that serves as the personal AI assistant for end users.
It receives messages from multiple messaging channels (Kakao Talk, LINE, Telegram, Web, etc.),
owns all business logic, user management, conversations, and AI features — delegating
every LLM call to nomi-core over gRPC.

**MVP channel: Kakao Talk** — designed with a channel adapter pattern for easy expansion.

---

## Where nomi-biseo Sits

```
┌──────────────────────────────────────────────────────────────┐
│  Messaging Channels                                          │
│  Kakao Talk (MVP) │ LINE │ Telegram │ Web │ ...              │
└────────┬──────────┴──┬───┴────┬─────┴──┬──┘                  │
         │ Webhook      │        │        │ REST                │
┌────────▼─────────────▼────────▼────────▼────────────────────┐
│  nomi-biseo         ← THIS PROJECT                          │
│  Channel adapters → ChatService → CoreClient                 │
│  Auth, conversations, features, user management              │
└────────────────────────┬────────────────────────────────────┘
                         │ gRPC (port 4000)
┌────────────────────────▼────────────────────────────────────┐
│  nomi-core                                                   │
│  AI Execution Engine (zero business logic)                   │
│  LLM abstraction, retry, cost tracking                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Principles

1. **All business logic lives here** — nomi-core is pure infrastructure; nomi-biseo decides _what_ to ask the LLM, _how_ to use the output, and _who_ can access what
2. **Never call LLM providers directly** — every AI call goes through nomi-core's `Execute` RPC
3. **Own the user** — authentication, authorization, user settings, and preferences
4. **Own the conversation** — message history, threads, context management
5. **Own the features** — each AI capability (chat, summarize, translate, etc.) is a feature module
6. **Channel-agnostic core** — `ChatService` and all business logic never know which channel the message came from; channel adapters normalize input into a common `IncomingMessage` format
7. **Channel adapter pattern** — each messaging platform (Kakao Talk, LINE, Telegram, etc.) is an isolated adapter behind `IChannelAdapter`; adding a new channel never touches core business logic
8. **Structured logging everywhere** — `NomiLoggerService` with `LogContext`, same as nomi-core
9. **Every AI call is traceable** — `userId`, `featureId`, `traceId` sent to nomi-core on every request

---

## Tech Stack

| Concern                  | Technology                                                               |
| ------------------------ | ------------------------------------------------------------------------ |
| Framework                | NestJS 11                                                                |
| Transport (external)     | REST (HTTP) + Channel Webhooks (Kakao Talk MVP; LINE, Telegram Post-MVP) |
| Transport (to nomi-core) | gRPC client (`@nestjs/microservices` + `Transport.GRPC`)                 |
| Language                 | TypeScript 5 (strict mode)                                               |
| Database                 | PostgreSQL 16                                                            |
| ORM                      | Prisma                                                                   |
| Authentication           | JWT (access + refresh tokens)                                            |
| Validation               | class-validator + class-transformer (DTOs), Zod (AI output schemas)      |
| Logging                  | `@nomi-labs/nomi-logger` (`NomiLoggerService`)                           |
| Shared Types             | `@nomi-labs/nomi-shared` (`LogContext`, proto definitions)               |
| Schema Validation (AI)   | Zod v4 (output schemas sent to nomi-core)                                |
| Testing                  | Vitest                                                                   |
| API Docs                 | Swagger (`@nestjs/swagger`)                                              |
| Rate Limiting            | `@nestjs/throttler`                                                      |
| Config                   | `@nestjs/config` + `.env`                                                |

---

## Project Structure

```
nomi-biseo/
├── prisma/
│   ├── schema.prisma               ← Database schema (source of truth)
│   └── migrations/                  ← Auto-generated migrations
│
├── src/
│   ├── main.ts                      ← HTTP bootstrap (port 3000)
│   ├── app.module.ts                ← Root module
│   │
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts   ← @CurrentUser() param decorator
│   │   │   └── public.decorator.ts         ← @Public() skip auth guard
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts           ← Global JWT guard
│   │   ├── interceptors/
│   │   │   └── trace.interceptor.ts        ← Auto-generates traceId per request
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts    ← Global error handler with logging
│   │   └── utils/
│   │       └── trace.util.ts               ← buildTrace(user, featureId) helper
│   │
│   ├── channels/
│   │   ├── channels.module.ts              ← Registers all channel adapters
│   │   ├── channel-dispatcher.service.ts   ← Receives normalized IncomingMessage → delegates to ChatService
│   │   ├── types/
│   │   │   └── channel.types.ts            ← IChannelAdapter, IncomingMessage, OutgoingMessage, ChannelType enum
│   │   └── adapters/
│   │       ├── kakao/
│   │       │   ├── kakao.adapter.ts         ← IChannelAdapter for Kakao Talk (MVP)
│   │       │   ├── kakao.controller.ts      ← POST /webhooks/kakao (webhook receiver)
│   │       │   ├── kakao.service.ts         ← Kakao Talk API client (send replies, verify tokens)
│   │       │   └── kakao.types.ts           ← Kakao-specific webhook payload types
│   │       ├── line/                        ← (Post-MVP) LINE adapter
│   │       │   └── ...
│   │       └── telegram/                    ← (Post-MVP) Telegram adapter
│   │           └── ...
│   │
│   ├── core-client/
│   │   ├── core-client.module.ts           ← gRPC client to nomi-core
│   │   ├── core-client.service.ts          ← Typed wrapper: execute(), getCostByUser(), health()
│   │   └── types/
│   │       └── core-client.types.ts        ← Request/response types matching core.proto
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts          ← POST /auth/register, /auth/login, /auth/refresh
│   │   │   ├── auth.service.ts             ← JWT sign/verify, password hash
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts         ← Passport JWT strategy
│   │   │   └── dto/
│   │   │       ├── register.dto.ts
│   │   │       ├── login.dto.ts
│   │   │       └── auth-response.dto.ts
│   │   │
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.service.ts            ← CRUD, preferences
│   │   │   ├── users.controller.ts         ← GET /users/me, PATCH /users/me
│   │   │   └── dto/
│   │   │       └── update-user.dto.ts
│   │   │
│   │   ├── conversations/
│   │   │   ├── conversations.module.ts
│   │   │   ├── conversations.controller.ts ← CRUD /conversations
│   │   │   ├── conversations.service.ts    ← Create, list, get, delete threads
│   │   │   ├── messages.service.ts         ← Append/query messages within a conversation
│   │   │   └── dto/
│   │   │       ├── create-conversation.dto.ts
│   │   │       └── send-message.dto.ts
│   │   │
│   │   ├── chat/
│   │   │   ├── chat.module.ts
│   │   │   ├── chat.controller.ts          ← POST /chat/send
│   │   │   └── chat.service.ts             ← Orchestrates: load history → build messages → call core → save response
│   │   │
│   │   ├── features/
│   │   │   ├── features.module.ts
│   │   │   ├── features.controller.ts      ← POST /features/:featureId/execute
│   │   │   ├── features.service.ts         ← Routes to feature handlers
│   │   │   ├── registry/
│   │   │   │   └── feature.registry.ts     ← Maps featureId → handler + schema + system prompt
│   │   │   └── handlers/
│   │   │       ├── summarize.handler.ts    ← "summarize" feature
│   │   │       ├── translate.handler.ts    ← "translate" feature
│   │   │       └── extract.handler.ts      ← "extract" structured data feature
│   │   │
│   │   ├── cost/
│   │   │   ├── cost.module.ts
│   │   │   ├── cost.controller.ts          ← GET /cost/me, GET /cost/features
│   │   │   └── cost.service.ts             ← Calls nomi-core GetCostByUser/GetCostByFeature RPCs
│   │   │
│   │   ├── prompts/
│   │   │   ├── prompts.module.ts
│   │   │   ├── prompts.service.ts          ← System prompt templates per feature
│   │   │   └── templates/
│   │   │       ├── chat.system.ts          ← Default chat system prompt
│   │   │       ├── summarize.system.ts
│   │   │       └── translate.system.ts
│   │   │
│   │   └── health/
│   │       ├── health.module.ts
│   │       └── health.controller.ts        ← GET /health (self + nomi-core connectivity)
│   │
│   └── prisma/
│       ├── prisma.module.ts                ← Global Prisma module
│       └── prisma.service.ts               ← PrismaClient wrapper with onModuleInit/onModuleDestroy
│
├── test/
│   ├── app.e2e-spec.ts                     ← End-to-end tests
│   └── helpers/
│       └── test-utils.ts                   ← Test factories, mock gRPC client
│
├── .env.example
├── .github/
│   └── copilot-instructions.md
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── nest-cli.json
└── README.md
```

---

## Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String             @id @default(uuid())
  email         String?            @unique           // null for channel-only users
  passwordHash  String?                               // null for channel-only users
  displayName   String?
  preferences   Json               @default("{}")
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  conversations Conversation[]
  identities    PlatformIdentity[]
}

/// Links a user to a messaging platform account.
/// One user can have multiple platform identities (Kakao + LINE + Telegram etc.)
model PlatformIdentity {
  id             String   @id @default(uuid())
  userId         String
  platform       String                              // "kakao" | "line" | "telegram" | "web"
  platformUserId String                              // Platform-specific user ID
  displayName    String?                             // Name from platform profile
  metadata       Json     @default("{}")             // Platform-specific extra data
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([platform, platformUserId])               // One identity per platform per user
  @@index([userId])
}

model Conversation {
  id        String    @id @default(uuid())
  userId    String
  title     String?
  featureId String    @default("chat")
  channel   String    @default("web")            // "kakao" | "line" | "telegram" | "web"
  metadata  Json      @default("{}")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]

  @@index([userId, updatedAt(sort: Desc)])
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  role           String                          // "user" | "assistant" | "system"
  content        String
  tokenUsage     Json?                           // { inputTokens, outputTokens, totalTokens }
  cost           Json?                           // { inputCost, outputCost, totalCost }
  model          String?
  provider       String?
  durationMs     Int?
  traceId        String?
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

---

## API Surface

### Auth

| Method | Endpoint         | Description          | Auth          |
| ------ | ---------------- | -------------------- | ------------- |
| POST   | `/auth/register` | Create new user      | Public        |
| POST   | `/auth/login`    | Get JWT tokens       | Public        |
| POST   | `/auth/refresh`  | Refresh access token | Refresh token |

### Users

| Method | Endpoint    | Description                | Auth |
| ------ | ----------- | -------------------------- | ---- |
| GET    | `/users/me` | Get current user profile   | JWT  |
| PATCH  | `/users/me` | Update profile/preferences | JWT  |

### Conversations

| Method | Endpoint             | Description                           | Auth |
| ------ | -------------------- | ------------------------------------- | ---- |
| POST   | `/conversations`     | Create new conversation               | JWT  |
| GET    | `/conversations`     | List user's conversations (paginated) | JWT  |
| GET    | `/conversations/:id` | Get conversation with messages        | JWT  |
| DELETE | `/conversations/:id` | Delete conversation                   | JWT  |
| PATCH  | `/conversations/:id` | Update title/metadata                 | JWT  |

### Chat

| Method | Endpoint     | Description                      | Auth |
| ------ | ------------ | -------------------------------- | ---- |
| POST   | `/chat/send` | Send message and get AI response | JWT  |

**Request body:**

```json
{
  "conversationId": "uuid",
  "message": "What is the weather?",
  "provider": {
    "name": "gemini",
    "model": "gemini-2.0-flash"
  }
}
```

**Response body:**

```json
{
  "conversationId": "uuid",
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "I don't have access to real-time weather...",
    "model": "gemini-2.0-flash",
    "provider": "gemini",
    "tokenUsage": {
      "inputTokens": 42,
      "outputTokens": 128,
      "totalTokens": 170
    },
    "cost": {
      "inputCost": 0.0000042,
      "outputCost": 0.0000512,
      "totalCost": 0.0000554
    },
    "durationMs": 1234,
    "traceId": "trace-abc-123"
  }
}
```

### Features

| Method | Endpoint                       | Description                   | Auth |
| ------ | ------------------------------ | ----------------------------- | ---- |
| GET    | `/features`                    | List available features       | JWT  |
| POST   | `/features/:featureId/execute` | Execute a specific AI feature | JWT  |

**Features (MVP):**

| featureId   | Description             | Input                      | Output           |
| ----------- | ----------------------- | -------------------------- | ---------------- |
| `summarize` | Summarize text          | `{ text, maxLength? }`     | `{ summary }`    |
| `translate` | Translate text          | `{ text, targetLanguage }` | `{ translated }` |
| `extract`   | Extract structured data | `{ text, schema }`         | Validated JSON   |

### Cost

| Method | Endpoint         | Description                   | Auth |
| ------ | ---------------- | ----------------------------- | ---- |
| GET    | `/cost/me`       | Get current user's total cost | JWT  |
| GET    | `/cost/features` | Get cost breakdown by feature | JWT  |

### Health

| Method | Endpoint  | Description                             | Auth   |
| ------ | --------- | --------------------------------------- | ------ |
| GET    | `/health` | Service health + nomi-core connectivity | Public |

### Channel Webhooks

| Method | Endpoint             | Description                          | Auth                         |
| ------ | -------------------- | ------------------------------------ | ---------------------------- |
| POST   | `/webhooks/kakao`    | Kakao Talk webhook receiver (MVP)    | Kakao signature verification |
| POST   | `/webhooks/line`     | LINE webhook receiver (Post-MVP)     | LINE signature verification  |
| POST   | `/webhooks/telegram` | Telegram webhook receiver (Post-MVP) | Telegram token verification  |

> Webhook endpoints are **not JWT-protected**. Each channel adapter verifies authenticity using
> the platform's own signature/token mechanism.

---

## gRPC Client — Calling nomi-core

`CoreClientService` wraps the gRPC connection and provides typed methods:

```typescript
@Injectable()
export class CoreClientService implements OnModuleInit {
  private coreService: CoreServiceClient;

  constructor(
    @Inject('CORE_PACKAGE') private readonly client: ClientGrpc,
    private readonly logger: NomiLoggerService,
  ) {}

  onModuleInit() {
    this.coreService = this.client.getService<CoreServiceClient>('CoreService');
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    return firstValueFrom(this.coreService.execute(request));
  }

  async getCostByUser(userId: string): Promise<CostSummary> {
    return firstValueFrom(this.coreService.getCostByUser({ userId }));
  }

  async getCostByFeature(featureId: string): Promise<CostSummary> {
    return firstValueFrom(this.coreService.getCostByFeature({ featureId }));
  }

  async health(): Promise<HealthResponse> {
    return firstValueFrom(this.coreService.health({}));
  }
}
```

**Module registration:**

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'CORE_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'nomi.core',
          protoPath: join(__dirname, '../proto/core.proto'),
          url: process.env.CORE_GRPC_URL || 'localhost:4000',
        },
      },
    ]),
  ],
  providers: [CoreClientService],
  exports: [CoreClientService],
})
export class CoreClientModule {}
```

---

## Channel Adapter Pattern

Every messaging platform is isolated behind `IChannelAdapter`:

```typescript
// src/channels/types/channel.types.ts

enum ChannelType {
  KAKAO = 'kakao',
  LINE = 'line',
  TELEGRAM = 'telegram',
  WEB = 'web',
}

/// Normalized message — every adapter converts platform-specific payloads into this.
interface IncomingMessage {
  channelType: ChannelType;
  platformUserId: string; // Platform-specific sender ID
  text: string; // User's message content
  raw: unknown; // Original platform payload (for debugging/logging)
}

/// What the adapter needs to send a reply back to the platform.
interface OutgoingMessage {
  platformUserId: string;
  text: string;
}

/// Each channel adapter implements this interface.
interface IChannelAdapter {
  readonly channelType: ChannelType;
  sendReply(message: OutgoingMessage): Promise<void>;
}
```

### Adding a New Channel

1. Create `src/channels/adapters/<name>/` directory
2. Implement `<name>.adapter.ts` (`IChannelAdapter`) — sends replies via platform API
3. Implement `<name>.controller.ts` — webhook endpoint, signature verification, parse payload → `IncomingMessage`
4. Implement `<name>.service.ts` — platform API client (send messages, manage tokens)
5. Implement `<name>.types.ts` — platform-specific webhook payload types
6. Register in `channels.module.ts`
7. No changes to `ChatService`, `ChannelDispatcherService`, or any business logic needed

---

## Channel Flow — End to End (Kakao Talk)

```
1. Kakao Talk server → POST /webhooks/kakao { webhook payload }
2. KakaoController:
   a. Verify Kakao signature (reject if invalid)
   b. Parse webhook payload → IncomingMessage { channelType: 'kakao', platformUserId, text }
3. ChannelDispatcherService:
   a. Look up or create User + PlatformIdentity for this platformUserId
   b. Look up or create Conversation for this user + channel
   c. Delegate to ChatService.sendFromChannel(user, conversation, message)
4. ChatService:
   a. Save user message to DB
   b. Load recent message history
   c. Build system prompt + ExecutionRequest
   d. Call CoreClientService.execute(request)
   e. Save assistant message to DB
   f. Return assistant response text
5. ChannelDispatcherService:
   a. Call KakaoAdapter.sendReply({ platformUserId, text: response })
   b. Kakao Talk API sends reply to user
```

---

## Chat Flow — End to End (REST / Web)

```
1. User → POST /chat/send { conversationId, message }
2. JwtAuthGuard validates token → extracts userId
3. TraceInterceptor generates traceId (uuid)
4. ChatService:
   a. Load or create Conversation (via ConversationsService)
   b. Save user message to DB
   c. Load recent message history (context window)
   d. Build system prompt (from PromptsService)
   e. Build ExecutionRequest:
      {
        messages: [system, ...history, userMessage],
        provider: user.preferences.defaultProvider || system default,
        trace: { userId, featureId: 'chat', traceId },
        policy: { maxRetries: 3, timeoutMs: 30000 }
      }
   f. Call CoreClientService.execute(request)
   g. Save assistant message to DB (with usage, cost, model, traceId)
   h. Return response to user
```

---

## Feature Execution Flow

```
1. User → POST /features/summarize/execute { text, maxLength: 200 }
2. JwtAuthGuard + TraceInterceptor
3. FeaturesService:
   a. Look up "summarize" in FeatureRegistry
   b. Get handler, system prompt, output schema (Zod)
   c. Handler builds messages:
      [
        { role: 'system', content: summarizeSystemPrompt },
        { role: 'user', content: text }
      ]
   d. Build ExecutionRequest with outputSchema (Zod → JSON Schema string)
   e. Call CoreClientService.execute(request)
   f. nomi-core validates output against schema (Zod)
   g. Return parsed + validated result to user
```

---

## Environment Variables

| Variable                 | Required  | Default            | Description                                                |
| ------------------------ | --------- | ------------------ | ---------------------------------------------------------- |
| `DATABASE_URL`           | Yes       | —                  | PostgreSQL connection string                               |
| `JWT_SECRET`             | Yes       | —                  | Secret for signing JWT tokens                              |
| `JWT_EXPIRES_IN`         | No        | `15m`              | Access token TTL                                           |
| `JWT_REFRESH_EXPIRES_IN` | No        | `7d`               | Refresh token TTL                                          |
| `CORE_GRPC_URL`          | No        | `localhost:4000`   | nomi-core gRPC endpoint                                    |
| `PORT`                   | No        | `3000`             | HTTP listening port                                        |
| `LOG_LEVEL`              | No        | `info`             | Logging level                                              |
| `NODE_ENV`               | No        | —                  | `production` → JSON logs                                   |
| `THROTTLE_TTL`           | No        | `60000`            | Rate limit window (ms)                                     |
| `THROTTLE_LIMIT`         | No        | `30`               | Max requests per window                                    |
| `DEFAULT_PROVIDER`       | No        | `gemini`           | Default LLM provider name                                  |
| `DEFAULT_MODEL`          | No        | `gemini-2.0-flash` | Default LLM model                                          |
| `KAKAO_REST_API_KEY`     | Yes (MVP) | —                  | Kakao Talk REST API key                                    |
| `KAKAO_BOT_SECRET`       | Yes (MVP) | —                  | Kakao Talk bot webhook secret (for signature verification) |
| `KAKAO_CHANNEL_ID`       | No        | —                  | Kakao Talk channel ID                                      |
| `LINE_CHANNEL_SECRET`    | No        | —                  | LINE channel secret (Post-MVP)                             |
| `LINE_ACCESS_TOKEN`      | No        | —                  | LINE channel access token (Post-MVP)                       |
| `TELEGRAM_BOT_TOKEN`     | No        | —                  | Telegram bot token (Post-MVP)                              |

---

## Dependencies

### Production

```json
{
  "@nestjs/common": "^11",
  "@nestjs/core": "^11",
  "@nestjs/platform-express": "^11",
  "@nestjs/microservices": "^11",
  "@nestjs/config": "^4",
  "@nestjs/passport": "^11",
  "@nestjs/jwt": "^11",
  "@nestjs/swagger": "^11",
  "@nestjs/throttler": "^6",
  "@grpc/grpc-js": "^1.14",
  "@grpc/proto-loader": "^0.8",
  "@prisma/client": "^6",
  "passport": "^0.7",
  "passport-jwt": "^4",
  "bcrypt": "^6",
  "class-validator": "^0.14",
  "class-transformer": "^0.5",
  "zod": "^4",
  "@nomi-labs/nomi-logger": "^1",
  "@nomi-labs/nomi-shared": "^1",
  "dotenv": "^17",
  "rxjs": "^7",
  "reflect-metadata": "^0.2",
  "uuid": "^11"
}
```

### Dev

```json
{
  "prisma": "^6",
  "vitest": "^4",
  "@vitest/coverage-v8": "^4",
  "unplugin-swc": "^1",
  "@swc/core": "^1",
  "@types/bcrypt": "^5",
  "@types/passport-jwt": "^4",
  "@types/express": "^5",
  "@types/node": "^25",
  "typescript": "^6",
  "eslint": "^10",
  "prettier": "^3"
}
```

---

## Build Checklist

### Stage 0 — Scaffold & Config

| #   | Task                                    | Details                                              |
| --- | --------------------------------------- | ---------------------------------------------------- |
| 0.1 | Scaffold project                        | `nest new nomi-biseo --package-manager npm --strict` |
| 0.2 | Install dependencies                    | Production + dev deps listed above                   |
| 0.3 | Remove Jest, add Vitest                 | Same pattern as nomi-core                            |
| 0.4 | Create directory structure              | As defined in Project Structure                      |
| 0.5 | Configure `.env.example`                | All env vars listed                                  |
| 0.6 | Setup `nest-cli.json`                   | Asset copy for proto files                           |
| 0.7 | Setup `.github/copilot-instructions.md` | Rules for this project                               |

### Stage 1 — Database & Prisma

| #   | Task                | Details                                  |
| --- | ------------------- | ---------------------------------------- |
| 1.1 | Init Prisma         | `npx prisma init` → configure PostgreSQL |
| 1.2 | Define schema       | User, Conversation, Message models       |
| 1.3 | Create PrismaModule | Global module with PrismaService         |
| 1.4 | Run first migration | `npx prisma migrate dev --name init`     |

### Stage 2 — Auth Module

| #   | Task                              | Details                                            |
| --- | --------------------------------- | -------------------------------------------------- |
| 2.1 | Create auth module                | Module, controller, service                        |
| 2.2 | Implement JWT strategy            | Passport + JWT with access/refresh tokens          |
| 2.3 | Implement register                | Hash password (bcrypt), create user, return tokens |
| 2.4 | Implement login                   | Verify password, return tokens                     |
| 2.5 | Implement refresh                 | Verify refresh token, issue new pair               |
| 2.6 | Create global JWT guard           | Apply to all routes, `@Public()` to opt out        |
| 2.7 | Create `@CurrentUser()` decorator | Extract user from request                          |
| 2.8 | Write auth tests                  | Register, login, refresh, guard                    |

### Stage 3 — Users Module

| #   | Task                | Details                         |
| --- | ------------------- | ------------------------------- |
| 3.1 | Create users module | Module, controller, service     |
| 3.2 | GET /users/me       | Return current user profile     |
| 3.3 | PATCH /users/me     | Update displayName, preferences |
| 3.4 | Write users tests   | Profile retrieval, update       |

### Stage 4 — Core Client (gRPC → nomi-core)

| #   | Task                      | Details                                                            |
| --- | ------------------------- | ------------------------------------------------------------------ |
| 4.1 | Create CoreClientModule   | gRPC client registration                                           |
| 4.2 | Create CoreClientService  | Typed wrapper for Execute, GetCostByUser, GetCostByFeature, Health |
| 4.3 | Copy/reference proto file | From `@nomi-labs/nomi-shared` or local copy                        |
| 4.4 | Write core-client tests   | Mock gRPC, verify request mapping                                  |

### Stage 5 — Channel Adapter Layer

| #   | Task                              | Details                                                                |
| --- | --------------------------------- | ---------------------------------------------------------------------- |
| 5.1 | Define channel types              | `IChannelAdapter`, `IncomingMessage`, `OutgoingMessage`, `ChannelType` |
| 5.2 | Create `ChannelsModule`           | Registers all adapters, exports `ChannelDispatcherService`             |
| 5.3 | Create `ChannelDispatcherService` | Normalize inbound → resolve user/identity → delegate to ChatService    |
| 5.4 | Create Kakao Talk adapter (MVP)   | `kakao.adapter.ts`, `kakao.controller.ts`, `kakao.service.ts`, types   |
| 5.5 | Webhook signature verification    | Verify Kakao `X-Kakao-Signature` header using HMAC-SHA256              |
| 5.6 | Auto-create user from platform    | `PlatformIdentity` → find-or-create `User` on first message            |
| 5.7 | Send reply via Kakao API          | `KakaoAdapter.sendReply()` calls Kakao Talk Messaging API              |
| 5.8 | Write channel tests               | Adapter, dispatcher, webhook verification, user linking                |

### Stage 6 — Conversations Module

| #   | Task                        | Details                                       |
| --- | --------------------------- | --------------------------------------------- |
| 6.1 | Create conversations module | Module, controller, service                   |
| 6.2 | CRUD endpoints              | Create, list (paginated), get, update, delete |
| 6.3 | MessagesService             | Append messages, load history with limit      |
| 6.4 | Ownership guard             | Users can only access their own conversations |
| 6.5 | Write conversations tests   | CRUD, pagination, ownership                   |

### Stage 7 — Chat Module

| #   | Task                      | Details                                                         |
| --- | ------------------------- | --------------------------------------------------------------- |
| 7.1 | Create chat module        | Module, controller, service                                     |
| 7.2 | PromptsService            | System prompt templates                                         |
| 7.3 | POST /chat/send           | Full flow: history → build request → call core → save → respond |
| 7.4 | sendFromChannel()         | Shared method used by ChannelDispatcher (no JWT, no HTTP)       |
| 7.5 | Context window management | Load last N messages (configurable)                             |
| 7.6 | Auto-create conversation  | If no conversationId provided                                   |
| 7.7 | Auto-generate title       | From first user message (via LLM or truncation)                 |
| 7.8 | Write chat tests          | Full flow with mocked CoreClientService                         |

### Stage 8 — Features Module

| #   | Task                          | Details                                          |
| --- | ----------------------------- | ------------------------------------------------ |
| 8.1 | Create features module        | Module, controller, service, registry            |
| 8.2 | Feature registry pattern      | Map featureId → handler + schema + system prompt |
| 8.3 | Implement `summarize` handler | Text in → summary out                            |
| 8.4 | Implement `translate` handler | Text + targetLanguage in → translated out        |
| 8.5 | Implement `extract` handler   | Text + schema in → validated JSON out            |
| 8.6 | GET /features                 | List available features                          |
| 8.7 | Write features tests          | Each handler, validation, registry               |

### Stage 9 — Cost Module

| #   | Task               | Details                         |
| --- | ------------------ | ------------------------------- |
| 9.1 | Create cost module | Module, controller, service     |
| 9.2 | GET /cost/me       | Call nomi-core GetCostByUser    |
| 9.3 | GET /cost/features | Call nomi-core GetCostByFeature |
| 9.4 | Write cost tests   | Mock gRPC responses             |

### Stage 10 — Health & Observability

| #    | Task                | Details                                      |
| ---- | ------------------- | -------------------------------------------- |
| 10.1 | Health controller   | Self health + nomi-core ping                 |
| 10.2 | TraceInterceptor    | Auto-generate traceId per request            |
| 10.3 | HttpExceptionFilter | Global error handler with structured logging |
| 10.4 | Request logging     | Log every inbound request with LogContext    |

### Stage 11 — API Docs & Rate Limiting

| #    | Task          | Details                              |
| ---- | ------------- | ------------------------------------ |
| 11.1 | Swagger setup | `@nestjs/swagger` with DTOs          |
| 11.2 | Rate limiting | `@nestjs/throttler` on all endpoints |
| 11.3 | CORS config   | Allow frontend origins               |

### Stage 12 — Integration Testing

| #    | Task              | Details                                        |
| ---- | ----------------- | ---------------------------------------------- |
| 12.1 | E2E test setup    | Test database, seed, cleanup                   |
| 12.2 | Auth flow E2E     | Register → login → access protected route      |
| 12.3 | Chat flow E2E     | Send message → get response (mocked nomi-core) |
| 12.4 | Feature flow E2E  | Execute feature → get structured response      |
| 12.5 | Kakao webhook E2E | Simulate Kakao webhook → verify reply sent     |

---

## Post-MVP

| Feature                    | Description                                                                       |
| -------------------------- | --------------------------------------------------------------------------------- |
| **LINE channel**           | LINE Messaging API adapter (same pattern as Kakao)                                |
| **Telegram channel**       | Telegram Bot API adapter                                                          |
| **Web chat widget**        | Embeddable web chat (WebSocket + REST)                                            |
| **WebSocket streaming**    | Real-time token streaming via `ExecuteStream` RPC (after nomi-core implements it) |
| **Conversation sharing**   | Share conversations via public links                                              |
| **File attachments**       | Upload documents for summarization/extraction                                     |
| **Multi-model comparison** | Run same prompt on multiple models, compare results                               |
| **Usage dashboard**        | Detailed cost analytics with charts                                               |
| **Prompt library**         | User-created and shared prompt templates                                          |
| **Admin module**           | User management, system-wide cost overview                                        |
| **OAuth providers**        | Google, GitHub login                                                              |
| **Redis caching**          | Cache frequent responses, rate limit state                                        |
| **Docker Compose**         | Full stack: nomi-biseo + nomi-core + PostgreSQL                                   |

---

## Architecture Rules (for copilot-instructions.md)

1. **Never call LLM providers directly** — always go through `CoreClientService` → nomi-core
2. **Never import from nomi-core source** — only use `@nomi-labs/nomi-shared` types or proto-generated types
3. **Every AI call includes a full trace** — `{ userId, featureId, traceId }`
4. **Use `NomiLoggerService` everywhere** — never `console.log`
5. **All endpoints require JWT** unless decorated with `@Public()`
6. **Users can only access their own data** — enforce ownership in every query
7. **Validate all input** — `class-validator` DTOs for HTTP, Zod schemas for AI output
8. **Never throw from chat/feature execution** — return error responses gracefully to the client
9. **Channel adapters are isolated** — platform-specific code stays inside `src/channels/adapters/<name>/`; business logic never imports from adapter directories
10. **System prompts live in `prompts/templates/`** — not hardcoded in services
11. **Test with mocked `CoreClientService`** — no real gRPC calls in unit tests

---

## Relationship with nomi-core

| Responsibility                | Owner          |
| ----------------------------- | -------------- |
| LLM provider abstraction      | nomi-core      |
| Retry & fallback logic        | nomi-core      |
| Zod output validation         | nomi-core      |
| Cost calculation & tracking   | nomi-core      |
| Token counting                | nomi-core      |
| User authentication           | **nomi-biseo** |
| Conversation management       | **nomi-biseo** |
| Message history & context     | **nomi-biseo** |
| System prompt design          | **nomi-biseo** |
| Feature business logic        | **nomi-biseo** |
| Which model/provider to use   | **nomi-biseo** |
| User preferences              | **nomi-biseo** |
| Channel adapters (Kakao etc.) | **nomi-biseo** |
| Platform user identity        | **nomi-biseo** |
| Webhook signature verify      | **nomi-biseo** |
| API for frontend clients      | **nomi-biseo** |

---

## Quick Start (after implementation)

```bash
# 1. Start PostgreSQL
docker run -d --name nomi-pg -e POSTGRES_PASSWORD=nomi -e POSTGRES_DB=nomi_biseo -p 5432:5432 postgres:16

# 2. Start nomi-core (must be running)
cd ../nomi-core && npm run start:dev

# 3. Setup nomi-biseo
cd ../nomi-biseo
cp .env.example .env           # Edit with your values
npx prisma migrate dev         # Run migrations
npm run start:dev              # Start on port 3000

# 4. Test
curl http://localhost:3000/health
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"test@nomi.dev\",\"password\":\"secret123\"}"
```
