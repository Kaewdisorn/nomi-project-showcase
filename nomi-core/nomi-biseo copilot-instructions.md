# GitHub Copilot Instructions — nomi-biseo

nomi-biseo is the **Personal AI Assistant** for the Nomi platform.
It is a NestJS REST API that receives messages from multiple messaging channels
(Kakao Talk, LINE, Telegram, Web, etc.), owns all business logic, user management,
conversations, and AI features — delegating every LLM call to nomi-core over gRPC.

**MVP channel: Kakao Talk** — designed with a channel adapter pattern for easy expansion.

This file defines coding rules, patterns, and constraints that Copilot must follow
when assisting on this codebase.

---

## What nomi-biseo Is

- The business-logic layer of the Nomi ecosystem
- A REST API consumed by frontend clients (web/mobile)
- A multi-channel messaging gateway (Kakao Talk MVP; LINE, Telegram, Web Post-MVP)
- A gRPC client that calls nomi-core for all AI execution
- Responsible for: channel adapters, authentication, conversations, message history, AI features, user preferences, cost querying, structured logging

## What nomi-biseo Must NEVER Do

- Call LLM providers directly (OpenAI, Gemini, etc.) — always go through `CoreClientService` → nomi-core
- Import from nomi-core source code — only use `@nomi-labs/nomi-shared` or proto-generated types
- Skip authentication on non-public endpoints
- Return another user's data — enforce ownership in every query
- Log without a `LogContext` (traceId, userId, featureId, service)
- Import `nestjs-pino` or `PinoLogger` — use `NomiLoggerService` only
- Use `console.log` — use `NomiLoggerService`
- Hardcode system prompts in services — use `prompts/templates/`
- Put platform-specific code outside `src/channels/adapters/<name>/` — business logic must never import from adapter directories
- Handle webhook signature verification outside the channel adapter — each adapter owns its own auth

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
| Authentication           | JWT (access + refresh tokens) via `@nestjs/passport` + `@nestjs/jwt`     |
| Validation (HTTP)        | class-validator + class-transformer                                      |
| Validation (AI output)   | Zod v4 (schemas sent to nomi-core)                                       |
| Logging                  | `@nomi-labs/nomi-logger` (`NomiLoggerService`)                           |
| Shared Types             | `@nomi-labs/nomi-shared` (`LogContext`, proto definitions)               |
| Testing                  | Vitest                                                                   |
| API Docs                 | Swagger (`@nestjs/swagger`)                                              |
| Rate Limiting            | `@nestjs/throttler`                                                      |
| Config                   | `@nestjs/config` + `.env`                                                |

---

## Project Structure

```
src/
  main.ts                              ← HTTP bootstrap (port 3000)
  app.module.ts                        ← Root module: ConfigModule, NomiLoggerModule, PrismaModule, feature modules

  common/
    decorators/
      current-user.decorator.ts        ← @CurrentUser() param decorator
      public.decorator.ts              ← @Public() skip auth guard
    guards/
      jwt-auth.guard.ts                ← Global JWT guard
    interceptors/
      trace.interceptor.ts             ← Auto-generates traceId per request
    filters/
      http-exception.filter.ts         ← Global error handler with logging
    utils/
      trace.util.ts                    ← buildTrace(user, featureId) helper

  channels/
    channels.module.ts                 ← Registers all channel adapters
    channel-dispatcher.service.ts      ← Receives IncomingMessage → resolve user → delegate to ChatService
    types/
      channel.types.ts                 ← IChannelAdapter, IncomingMessage, OutgoingMessage, ChannelType
    adapters/
      kakao/
        kakao.adapter.ts               ← IChannelAdapter for Kakao Talk (MVP)
        kakao.controller.ts            ← POST /webhooks/kakao (webhook receiver)
        kakao.service.ts               ← Kakao Talk API client (send replies, verify tokens)
        kakao.types.ts                 ← Kakao-specific webhook payload types
      line/                            ← (Post-MVP)
      telegram/                        ← (Post-MVP)

  core-client/
    core-client.module.ts              ← gRPC client registration to nomi-core
    core-client.service.ts             ← Typed wrapper: execute(), getCostByUser(), health()
    types/
      core-client.types.ts             ← Request/response types matching core.proto

  modules/
    auth/
      auth.module.ts
      auth.controller.ts               ← POST /auth/register, /auth/login, /auth/refresh
      auth.service.ts                  ← JWT sign/verify, password hash (bcrypt)
      strategies/
        jwt.strategy.ts                ← Passport JWT strategy
      dto/
        register.dto.ts
        login.dto.ts
        auth-response.dto.ts

    users/
      users.module.ts
      users.controller.ts              ← GET /users/me, PATCH /users/me
      users.service.ts                 ← CRUD, preferences
      dto/
        update-user.dto.ts

    conversations/
      conversations.module.ts
      conversations.controller.ts      ← CRUD /conversations
      conversations.service.ts         ← Create, list, get, delete threads
      messages.service.ts              ← Append/query messages within a conversation
      dto/
        create-conversation.dto.ts
        send-message.dto.ts

    chat/
      chat.module.ts
      chat.controller.ts               ← POST /chat/send
      chat.service.ts                  ← Orchestrates: history → messages → core → save → respond

    features/
      features.module.ts
      features.controller.ts           ← POST /features/:featureId/execute
      features.service.ts              ← Routes to feature handlers
      registry/
        feature.registry.ts            ← Maps featureId → handler + schema + system prompt
      handlers/
        summarize.handler.ts
        translate.handler.ts
        extract.handler.ts

    cost/
      cost.module.ts
      cost.controller.ts               ← GET /cost/me, GET /cost/features
      cost.service.ts                  ← Calls nomi-core GetCostByUser/GetCostByFeature RPCs

    prompts/
      prompts.module.ts
      prompts.service.ts               ← System prompt templates per feature
      templates/
        chat.system.ts
        summarize.system.ts
        translate.system.ts

    health/
      health.module.ts
      health.controller.ts             ← GET /health (self + nomi-core connectivity)

  prisma/
    prisma.module.ts                   ← Global Prisma module
    prisma.service.ts                  ← PrismaClient wrapper

test/
  app.e2e-spec.ts
  helpers/
    test-utils.ts                      ← Test factories, mock gRPC client

prisma/
  schema.prisma                        ← Database schema (source of truth)
  migrations/
```

---

## Architecture Rules

### 1. Request Flow — Every AI Call

```
Channel webhook (Kakao, LINE, etc.) OR REST client
  → Channel Adapter (webhook verify + parse) OR Controller (JWT-protected)
  → ChannelDispatcherService (resolve user) OR direct service call
  → ChatService / FeaturesService (business logic)
  → CoreClientService.execute()     ← gRPC call to nomi-core
  → nomi-core handles LLM + retry + cost
  → Response saved to DB
  → ChannelAdapter.sendReply() OR HTTP response to client
```

### 2. Authentication & Authorization

- **Global JWT guard** applied to all routes by default
- Use `@Public()` decorator to opt out (health, auth/register, auth/login)
- Use `@CurrentUser()` decorator to extract the authenticated user
- **Every database query** must filter by `userId` — users can only access their own data

```typescript
// ✅ Correct — ownership enforced
const conversations = await this.prisma.conversation.findMany({
  where: { userId: user.id },
});

// ❌ Wrong — no ownership check
const conversations = await this.prisma.conversation.findMany();
```

### 3. Calling nomi-core — Always Through CoreClientService

- **Never** import AI SDK packages (`ai`, `@ai-sdk/google`, etc.)
- **Never** call LLM providers directly
- **Always** include a full `ExecutionTrace` with every request

```typescript
// ✅ Correct
const response = await this.coreClient.execute({
  messages: [
    { role: ChatRole.SYSTEM, content: systemPrompt },
    ...history,
    { role: ChatRole.USER, content: userMessage },
  ],
  provider: { name: 'gemini', model: 'gemini-2.0-flash' },
  trace: { userId: user.id, featureId: 'chat', traceId },
  policy: { maxRetries: 3, timeoutMs: 30000 },
});

// ❌ Wrong — calling LLM directly
import { generateText } from 'ai';
const result = await generateText({ model, prompt });
```

### 4. Logging Rules

- **Always** inject `NomiLoggerService` via standard NestJS DI
- **Always** pass `LogContext` as the second argument: `{ traceId, userId, featureId, service: 'nomi-biseo' }`
- Use `meta` (third argument) for structured data
- Never use `console.log` anywhere

```typescript
// ✅ Correct
this.logger.info(
  'Chat message sent',
  {
    traceId,
    userId: user.id,
    featureId: 'chat',
    service: 'nomi-biseo',
  },
  { conversationId, model: provider.model },
);

// ❌ Wrong — no LogContext
this.logger.info('Chat message sent');
console.log('sent message');
```

### 5. Controller Rules

- Controllers only handle HTTP concerns: parse request, validate DTO, delegate to service, return response
- No business logic in controllers
- Use `class-validator` decorators on DTOs for input validation
- Use `@nestjs/swagger` decorators for API documentation

```typescript
// ✅ Correct
@Post('send')
async sendMessage(
  @CurrentUser() user: User,
  @Body() dto: SendMessageDto,
) {
  return this.chatService.send(user, dto);
}

// ❌ Wrong — business logic in controller
@Post('send')
async sendMessage(@CurrentUser() user: User, @Body() dto: SendMessageDto) {
  const conversation = await this.prisma.conversation.findFirst({ ... });
  const messages = await this.prisma.message.findMany({ ... });
  const response = await this.coreClient.execute({ ... });
  // ... too much logic here
}
```

### 6. Error Handling Rules

- Chat and feature services should **not throw on AI execution failure** — return error info gracefully
- Auth failures → throw `UnauthorizedException`
- Not found → throw `NotFoundException`
- Validation failures → handled automatically by `class-validator` (400)
- `HttpExceptionFilter` catches all exceptions, logs with `LogContext`, returns structured error

### 7. Database Rules

- **Prisma is the only way to access the database** — no raw SQL unless absolutely necessary
- **PrismaService** is provided by a global `PrismaModule`
- **All queries filter by userId** for user-owned resources
- Use Prisma transactions for operations that must be atomic (e.g., create conversation + first message)

### 8. System Prompts

- All system prompts live in `src/modules/prompts/templates/`
- Each template exports a function that accepts parameters and returns a string
- Never hardcode prompts in service files

```typescript
// src/modules/prompts/templates/summarize.system.ts
export const summarizeSystemPrompt = (maxLength?: number): string =>
  `You are a summarization assistant. ${maxLength ? `Keep the summary under ${maxLength} characters.` : ''}`;
```

### 9. Channel Adapter Rules

- Every messaging platform is isolated behind `IChannelAdapter` in `src/channels/adapters/<name>/`
- Platform-specific code (webhook parsing, signature verification, API calls) **never** leaks into `ChatService`, `FeaturesService`, or any business logic module
- Each adapter directory contains: `<name>.adapter.ts`, `<name>.controller.ts`, `<name>.service.ts`, `<name>.types.ts`
- Webhook endpoints are `@Public()` — they use platform-specific signature verification, not JWT
- Channel adapters convert platform payloads into a normalized `IncomingMessage` format
- `ChannelDispatcherService` handles user identity resolution (find-or-create via `PlatformIdentity`)
- `ChatService` exposes a `sendFromChannel()` method that channel dispatchers call — this method has no HTTP/JWT dependencies
- Adding a new channel adapter **never** requires changes to `ChatService` or any business logic

```typescript
// ✅ Correct — channel adapter is isolated
// src/channels/adapters/kakao/kakao.controller.ts
@Public()
@Post('kakao')
async handleWebhook(@Req() req: Request, @Body() body: KakaoWebhookPayload) {
  this.kakaoService.verifySignature(req.headers['x-kakao-signature'], body);
  const incoming = this.kakaoService.parseToIncomingMessage(body);
  await this.dispatcher.handleIncoming(incoming, this.kakaoAdapter);
}

// ❌ Wrong — Kakao-specific logic in ChatService
async send(user, dto) {
  if (dto.channel === 'kakao') { /* kakao-specific handling */ }
}
```

### 10. Adding a New Channel

1. Create `src/channels/adapters/<name>/` directory
2. Implement `<name>.adapter.ts` (`IChannelAdapter`) — `sendReply()`
3. Implement `<name>.controller.ts` — webhook endpoint + signature verification
4. Implement `<name>.service.ts` — platform API client
5. Implement `<name>.types.ts` — platform-specific types
6. Register in `channels.module.ts`
7. No changes to `ChatService`, `ChannelDispatcherService`, or any business logic

### 11. Feature Handler Pattern

- Each feature is registered in `FeatureRegistry` with: `featureId`, `handler`, `systemPrompt`, `outputSchema`
- Handlers implement a common interface — they receive input and return messages for nomi-core
- Output schemas are Zod schemas passed to nomi-core for validation

```typescript
interface FeatureHandler {
  readonly featureId: string;
  buildMessages(input: unknown): ChatMessage[];
  getOutputSchema?(): ZodSchema;
}
```

### 12. Adding a New Feature

1. Create handler in `src/modules/features/handlers/<name>.handler.ts`
2. Create system prompt template in `src/modules/prompts/templates/<name>.system.ts`
3. Register in `FeatureRegistry`
4. No changes to controller or service needed

---

## Testing Rules

- Test framework: **Vitest** — use `vi.fn()`, `vi.mock()`
- **No real gRPC calls** — always mock `CoreClientService`
- **No real database calls in unit tests** — mock `PrismaService`
- **No NestJS TestingModule** in unit tests — instantiate services directly
- Mock `NomiLoggerService` as a plain object: `{ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }`
- E2E tests use a test PostgreSQL database with Prisma migrations

```typescript
// ✅ Correct mock patterns
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as NomiLoggerService;

const mockCoreClient = {
  execute: vi.fn(),
  getCostByUser: vi.fn(),
  getCostByFeature: vi.fn(),
  health: vi.fn(),
} as unknown as CoreClientService;

const mockPrisma = {
  conversation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  message: { findMany: vi.fn(), create: vi.fn() },
} as unknown as PrismaService;

service = new ChatService(
  mockCoreClient,
  mockPrisma,
  mockLogger,
  mockPromptsService,
);
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
| `LOG_LEVEL`              | No        | `info`             | `debug` / `info` / `warn` / `error`                        |
| `NODE_ENV`               | No        | —                  | `production` → JSON logs; otherwise pretty-printed         |
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

## REST API — Endpoints

| Method | Endpoint                       | Auth                  | Module        |
| ------ | ------------------------------ | --------------------- | ------------- |
| POST   | `/auth/register`               | Public                | Auth          |
| POST   | `/auth/login`                  | Public                | Auth          |
| POST   | `/auth/refresh`                | Refresh token         | Auth          |
| GET    | `/users/me`                    | JWT                   | Users         |
| PATCH  | `/users/me`                    | JWT                   | Users         |
| POST   | `/conversations`               | JWT                   | Conversations |
| GET    | `/conversations`               | JWT                   | Conversations |
| GET    | `/conversations/:id`           | JWT                   | Conversations |
| PATCH  | `/conversations/:id`           | JWT                   | Conversations |
| DELETE | `/conversations/:id`           | JWT                   | Conversations |
| POST   | `/chat/send`                   | JWT                   | Chat          |
| GET    | `/features`                    | JWT                   | Features      |
| POST   | `/features/:featureId/execute` | JWT                   | Features      |
| GET    | `/cost/me`                     | JWT                   | Cost          |
| GET    | `/cost/features`               | JWT                   | Cost          |
| GET    | `/health`                      | Public                | Health        |
| POST   | `/webhooks/kakao`              | Kakao signature (MVP) | Channels      |
| POST   | `/webhooks/line`               | LINE signature        | Channels      |
| POST   | `/webhooks/telegram`           | Telegram token        | Channels      |

---

## What Copilot Should NOT Suggest

- `console.log` — use `NomiLoggerService`
- `@InjectPinoLogger` or `PinoLogger` — use `NomiLoggerService`
- Direct LLM SDK imports (`ai`, `@ai-sdk/google`, `openai`, etc.)
- Imports from nomi-core source code — use `@nomi-labs/nomi-shared` only
- Database queries without `userId` filter on user-owned resources
- Business logic in controllers
- Hardcoded system prompts in service files
- `jest` or `@nestjs/testing` — use Vitest
- Raw SQL queries — use Prisma
- Platform-specific code outside `src/channels/adapters/<name>/`
- Importing from a channel adapter directory in business logic modules
- Kakao/LINE/Telegram SDK calls in `ChatService` or `FeaturesService`
