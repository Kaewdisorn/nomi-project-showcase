# nomi-biseo — Build Checklist

A step-by-step checklist for building the nomi-biseo Personal AI Assistant.

---

## Stages

| Stage | Scope |
|-------|-------|
| **MVP** (Steps 1–16) | HTTP server, channel adapters (LINE + KakaoTalk), conversation orchestration, memory (in-memory), nomi-core TCP client, unit tests |
| **Post-MVP** (Steps 17+) | Web channel + Telegram channel, Prisma DB for memory persistence, vector memory (pgvector), proactive features, Nomi Company agent delegation |

> **Channel strategy:** LINE + KakaoTalk are the MVP channels targeting Korean/Asian users.
> Web (REST API) and Telegram are deferred to Post-MVP once the core assistant is validated.

---

## What is nomi-biseo?

**nomi-biseo** is the Personal AI Assistant — the user's single point of contact
in the Nomi ecosystem. It acts as the user's Chief of Staff: receiving messages
from any channel, classifying them, retrieving personalized memory context,
delegating AI execution to nomi-core over TCP, and delivering clear responses.

**Responsibilities:**
- Receive user messages from multiple channels (Web, LINE, Telegram, etc.)
- Classify requests (chat / simple task / workflow task)
- Maintain persistent user memory (profile, goals, habits, interactions)
- Compose LLM prompts with personalized context
- Delegate AI execution to nomi-core via TCP
- Deliver responses back through the originating channel
- Orchestrate multi-step workflow tasks (Post-MVP: via Nomi Company)

**Must NEVER:**
- Call LLM providers directly — always go through nomi-core
- Expose internal agent operations to the user
- Lose user context between conversations
- Return a silent failure — always respond with something

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     HTTP Server (NestJS)                  │
│              Webhooks + REST API (port 3000)              │
├────────────┬───────────────────────────────────────────┤
│  LINE      │  KakaoTalk              ← Channel (MVP)   │
│  Adapter   │  Adapter                  Adapters        │
├────────────┴────────────┴────────────────────────────────┤
│              Channel Gateway Service                      │
│         (normalize → route → respond)                    │
├──────────────────────────────────────────────────────────┤
│            Conversation Orchestrator                      │
│     (classify → build context → execute → respond)       │
├─────────────────────┬────────────────────────────────────┤
│   Memory Service    │    Core Client Service              │
│   (user context)    │    (TCP → nomi-core)                │
└─────────────────────┴────────────────────────────────────┘
                              │
                      TCP (port 4000)
                              │
                     ┌────────┴────────┐
                     │   nomi-core     │
                     │  (AI Execution) │
                     └─────────────────┘
```

---

## Project Structure (Target)

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
│   │   │   ├── line.adapter.ts            ← IChannelAdapter for LINE Messaging API
│   │   │   └── line.controller.ts         ← POST /webhook/line endpoint
│   │   ├── kakao/                         ← MVP
│   │   │   ├── kakao.adapter.ts           ← IChannelAdapter for KakaoTalk OpenBuilder
│   │   │   └── kakao.controller.ts        ← POST /webhook/kakao endpoint
│   │   ├── web/                           ← Post-MVP
│   │   │   ├── web.adapter.ts             ← IChannelAdapter for web client
│   │   │   └── web.controller.ts          ← POST /api/chat REST endpoint
│   │   ├── telegram/                      ← Post-MVP
│   │   │   ├── telegram.adapter.ts        ← IChannelAdapter for Telegram Bot API
│   │   │   └── telegram.controller.ts     ← POST /webhook/telegram endpoint
│   │   └── __tests__/
│   │       └── channel-gateway.service.spec.ts
│   │
│   ├── conversation/                      ← Conversation orchestration layer
│   │   ├── interfaces.ts                  ← RequestType, ClassifiedRequest, ConversationContext, ConversationResult
│   │   ├── conversation.service.ts        ← Classify → build context → call core → parse response
│   │   ├── conversation.module.ts         ← Module wiring
│   │   └── __tests__/
│   │       └── conversation.service.spec.ts
│   │
│   ├── memory/                            ← User memory layer
│   │   ├── interfaces.ts                  ← UserProfile, UserGoal, UserHabit, InteractionRecord, UserMemory
│   │   ├── memory.service.ts              ← In-memory store (MVP); query & update user memory
│   │   ├── memory.module.ts               ← Module wiring
│   │   └── __tests__/
│   │       └── memory.service.spec.ts
│   │
│   └── core-client/                       ← nomi-core TCP client layer
│       ├── core-client.service.ts         ← TCP ClientProxy wrapper for nomi-core
│       ├── core-client.module.ts          ← ClientsModule.register TCP config
│       └── __tests__/
│           └── core-client.service.spec.ts
│
├── test/
│   └── test-web-client.ts                 ← Manual HTTP test script
│
├── .env.example
├── .env
├── .gitignore
├── dev.ps1
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── README.md
└── todo-checklist.md                      ← you are here
```

---

## MVP Stage

### Step 1 — Project Setup

**What:** Initialize package.json, TypeScript config, NestJS config, Vitest config, .gitignore, .env.example, dev.ps1.

**Action:**
1. Create `package.json` with dependencies:
   - `@nestjs/common`, `@nestjs/core`, `@nestjs/config`, `@nestjs/platform-express` (HTTP)
   - `@nestjs/microservices` (TCP client to nomi-core)
   - `nestjs-pino`, `pino-http`, `pino-pretty` (logging)
   - `nomi-shared` (GitHub dependency)
   - `rxjs`, `reflect-metadata`, `uuid`
   - Dev: `@nestjs/cli`, `@nestjs/schematics`, `typescript`, `vitest`, `@types/node`, `@types/uuid`

2. Create `tsconfig.json` — strict mode, CommonJS, ES2021, decorators enabled (match nomi-core)
3. Create `tsconfig.build.json` — extends tsconfig, incremental, excludes specs
4. Create `nest-cli.json` — source root `src`
5. Create `vitest.config.ts` — globals, node environment
6. Create `.gitignore` — node_modules, dist, .env, coverage
7. Create `.env.example` — document all env vars
8. Create `dev.ps1` — kill port 3000 + `npm run start:dev`

**Verify:** `npm install` → `npx tsc --noEmit` — zero errors.

- [ ] Done

---

### Step 2 — Bootstrap `src/main.ts` + `src/app.module.ts`

**What:** HTTP server on port 3000 with global config and structured logging.

**Action 2a:** Create `src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.enableCors();

    const port = process.env.BISEO_HTTP_PORT ?? 3000;
    await app.listen(port);
}
bootstrap();
```

**Action 2b:** Create `src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        LoggerModule.forRoot({
            pinoHttp: {
                level: process.env.LOG_LEVEL ?? 'info',
                transport:
                    process.env.NODE_ENV !== 'production'
                        ? { target: 'pino-pretty' }
                        : undefined,
            },
        }),
        // ChannelsModule,       ← Step 7
        // ConversationModule,   ← Step 10
        // MemoryModule,         ← Step 12
        // CoreClientModule,     ← Step 14
    ],
})
export class AppModule {}
```

**Verify:** `npm run build` → `npm start` — server starts on port 3000.

- [ ] Done

---

### Step 3 — Channel Interfaces `src/channels/interfaces.ts`

**What:** Define all channel adapter contracts. Every channel (Web, LINE, Telegram) produces a standardized `IncomingMessage` and consumes an `OutgoingMessage`.

**Action:** Create `src/channels/interfaces.ts`:

```typescript
export const CHANNEL_ADAPTER = Symbol('CHANNEL_ADAPTER');

// MVP channels: 'line' | 'kakao'
// Post-MVP: extend with 'web' | 'telegram' as needed
export type ChannelType = 'line' | 'kakao';

export interface IncomingMessage {
    channelType: ChannelType;
    channelUserId: string;
    text: string;
    replyToken?: string;
    rawEvent?: unknown;
    timestamp: Date;
}

export interface OutgoingMessage {
    channelType: ChannelType;
    channelUserId: string;
    text: string;
    replyToken?: string;
}

export interface IChannelAdapter {
    readonly channelType: ChannelType;
    sendMessage(message: OutgoingMessage): Promise<void>;
    validateWebhook?(request: unknown): boolean;
}
```

**Design decisions:**
- `CHANNEL_ADAPTER` is a Symbol — same DI pattern as nomi-core's `PROVIDER_ADAPTER`
- `ChannelType` is a union, not enum — simpler, extensible
- `rawEvent` preserves original webhook payload for channel-specific logic
- `replyToken` is optional — LINE needs it, others don't
- `validateWebhook` is optional — only channels with webhook signature verification need it

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 4 — KakaoTalk Channel Adapter `src/channels/kakao/` _(MVP)_

**What:** KakaoTalk OpenBuilder (카카오 i 오픈빌더) adapter. Receives skill server webhook requests from KakaoTalk Channel chatbot, parses utterance, replies via KakaoTalk skill response format.

**KakaoTalk OpenBuilder request shape:**
```json
{
  "userRequest": {
    "user": { "id": "<botUserKey>" },
    "utterance": "user typed text"
  }
}
```

**KakaoTalk skill response shape:**
```json
{
  "version": "2.0",
  "template": {
    "outputs": [{ "simpleText": { "text": "response text" } }]
  }
}
```

**Action 4a:** Create `src/channels/kakao/kakao.adapter.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IChannelAdapter, OutgoingMessage } from '../interfaces';

@Injectable()
export class KakaoAdapter implements IChannelAdapter {
    readonly channelType = 'kakao' as const;
    private readonly logger = new Logger(KakaoAdapter.name);

    // KakaoTalk OpenBuilder responses are returned directly via HTTP response
    // in the skill server format. The controller handles delivery.
    async sendMessage(message: OutgoingMessage): Promise<void> {
        this.logger.debug({ channelUserId: message.channelUserId, msg: 'KakaoTalk message sent' });
    }
}
```

**Action 4b:** Create `src/channels/kakao/kakao.controller.ts`:

```typescript
import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { ChannelGatewayService } from '../channel-gateway.service';
import { IncomingMessage } from '../interfaces';

interface KakaoSkillRequest {
    userRequest: {
        user: { id: string };
        utterance: string;
    };
}

@Controller('webhook')
export class KakaoController {
    constructor(private readonly gateway: ChannelGatewayService) {}

    @Post('kakao')
    @HttpCode(200)
    async handleSkill(@Body() body: KakaoSkillRequest) {
        const incoming: IncomingMessage = {
            channelType: 'kakao',
            channelUserId: body.userRequest.user.id,
            text: body.userRequest.utterance,
            rawEvent: body,
            timestamp: new Date(),
        };

        const result = await this.gateway.handleIncoming(incoming);

        // KakaoTalk skill server response format
        return {
            version: '2.0',
            template: {
                outputs: [
                    { simpleText: { text: result.response } },
                ],
            },
        };
    }
}
```

**Env vars to add to `.env.example`:**
```
# KakaoTalk OpenBuilder (카카오 i 오픈빌더)
KAKAO_APP_KEY=          # App key from KakaoTalk Developers console (optional: for push API)
```

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 5 — LINE Channel Adapter `src/channels/line/`

**What:** LINE Messaging API adapter. Receives webhook events, validates signatures, sends reply messages via LINE API.

**Action 5a:** Create `src/channels/line/line.adapter.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IChannelAdapter, OutgoingMessage } from '../interfaces';

@Injectable()
export class LineAdapter implements IChannelAdapter {
    readonly channelType = 'line' as const;
    private readonly logger = new Logger(LineAdapter.name);
    private readonly channelAccessToken: string;
    private readonly channelSecret: string;

    constructor(private readonly config: ConfigService) {
        this.channelAccessToken = this.config.get<string>('LINE_CHANNEL_ACCESS_TOKEN', '');
        this.channelSecret = this.config.get<string>('LINE_CHANNEL_SECRET', '');
    }

    async sendMessage(message: OutgoingMessage): Promise<void> {
        if (!message.replyToken) {
            this.logger.warn({ msg: 'No replyToken for LINE message — using push message' });
            await this.pushMessage(message.channelUserId, message.text);
            return;
        }
        await this.replyMessage(message.replyToken, message.text);
    }

    private async replyMessage(replyToken: string, text: string): Promise<void> {
        const response = await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.channelAccessToken}`,
            },
            body: JSON.stringify({
                replyToken,
                messages: [{ type: 'text', text }],
            }),
        });
        if (!response.ok) {
            this.logger.error({ msg: 'LINE reply failed', status: response.status });
        }
    }

    private async pushMessage(userId: string, text: string): Promise<void> {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.channelAccessToken}`,
            },
            body: JSON.stringify({
                to: userId,
                messages: [{ type: 'text', text }],
            }),
        });
        if (!response.ok) {
            this.logger.error({ msg: 'LINE push failed', status: response.status });
        }
    }

    validateWebhook(signature: string, body: string): boolean {
        const crypto = require('crypto');
        const hash = crypto
            .createHmac('SHA256', this.channelSecret)
            .update(body)
            .digest('base64');
        return hash === signature;
    }
}
```

**Action 5b:** Create `src/channels/line/line.controller.ts`:

```typescript
import { Body, Controller, Headers, Post, RawBodyRequest, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { ChannelGatewayService } from '../channel-gateway.service';
import { LineAdapter } from './line.adapter';
import { IncomingMessage } from '../interfaces';

@Controller('webhook')
export class LineController {
    constructor(
        private readonly gateway: ChannelGatewayService,
        private readonly lineAdapter: LineAdapter,
    ) {}

    @Post('line')
    @HttpCode(200)
    async handleWebhook(
        @Headers('x-line-signature') signature: string,
        @Body() body: any,
    ) {
        // Process each event from the webhook
        const events = body.events ?? [];
        for (const event of events) {
            if (event.type !== 'message' || event.message?.type !== 'text') {
                continue;
            }

            const incoming: IncomingMessage = {
                channelType: 'line',
                channelUserId: event.source?.userId ?? '',
                text: event.message.text,
                replyToken: event.replyToken,
                rawEvent: event,
                timestamp: new Date(event.timestamp),
            };

            // Fire-and-forget — LINE requires 200 within 1 second
            this.gateway.handleIncoming(incoming).catch((err) => {
                // Logged inside gateway — no silent failure
            });
        }

        return 'OK';
    }
}
```

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 6 — Telegram Channel Adapter _(Post-MVP — defer until after MVP launch)_

> **MVP NOTE:** Telegram is deferred to Post-MVP (see Step 24). Skip this step during MVP.
> Full implementation is documented here for reference. Add Telegram after LINE + KakaoTalk are live.

**What:** Telegram Bot API adapter. Receives webhook updates, sends messages via `sendMessage` API.

**Action 6a:** Create `src/channels/telegram/telegram.adapter.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IChannelAdapter, OutgoingMessage } from '../interfaces';

@Injectable()
export class TelegramAdapter implements IChannelAdapter {
    readonly channelType = 'telegram' as const;
    private readonly logger = new Logger(TelegramAdapter.name);
    private readonly botToken: string;

    constructor(private readonly config: ConfigService) {
        this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    }

    async sendMessage(message: OutgoingMessage): Promise<void> {
        const response = await fetch(
            `https://api.telegram.org/bot${this.botToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: message.channelUserId,
                    text: message.text,
                }),
            },
        );
        if (!response.ok) {
            this.logger.error({ msg: 'Telegram send failed', status: response.status });
        }
    }
}
```

**Action 6b:** Create `src/channels/telegram/telegram.controller.ts`:

```typescript
import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { ChannelGatewayService } from '../channel-gateway.service';
import { IncomingMessage } from '../interfaces';

@Controller('webhook')
export class TelegramController {
    constructor(private readonly gateway: ChannelGatewayService) {}

    @Post('telegram')
    @HttpCode(200)
    async handleWebhook(@Body() body: any) {
        const message = body.message;
        if (!message?.text) return 'OK';

        const incoming: IncomingMessage = {
            channelType: 'telegram',
            channelUserId: String(message.chat.id),
            text: message.text,
            rawEvent: body,
            timestamp: new Date(message.date * 1000),
        };

        await this.gateway.handleIncoming(incoming);
        return 'OK';
    }
}
```

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 7 — Channel Gateway Service + Channels Module

**What:** The central hub that normalizes incoming messages from any channel, routes them to the conversation orchestrator, and dispatches outgoing responses back through the correct channel adapter.

**Action 7a:** Create `src/channels/channel-gateway.service.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
    CHANNEL_ADAPTER,
    IChannelAdapter,
    IncomingMessage,
    OutgoingMessage,
} from './interfaces';
import { ConversationService } from '../conversation/conversation.service';
import { ConversationResult } from '../conversation/interfaces';

@Injectable()
export class ChannelGatewayService {
    private readonly logger = new Logger(ChannelGatewayService.name);
    private readonly adapterMap: Map<string, IChannelAdapter>;

    constructor(
        @Inject(CHANNEL_ADAPTER)
        private readonly adapters: IChannelAdapter[],
        private readonly conversationService: ConversationService,
    ) {
        this.adapterMap = new Map(adapters.map((a) => [a.channelType, a]));
    }

    async handleIncoming(message: IncomingMessage): Promise<ConversationResult> {
        this.logger.log({
            msg: 'Incoming message',
            channel: message.channelType,
            userId: message.channelUserId,
        });

        // Orchestrate conversation
        const result = await this.conversationService.process({
            userId: message.channelUserId,
            channelUserId: message.channelUserId,
            channelType: message.channelType,
            replyToken: message.replyToken,
            message: message.text,
            timestamp: message.timestamp,
        });

        // Send response back through the originating channel
        const adapter = this.adapterMap.get(message.channelType);
        if (adapter) {
            const outgoing: OutgoingMessage = {
                channelType: message.channelType,
                channelUserId: message.channelUserId,
                text: result.response,
                replyToken: message.replyToken,
            };
            await adapter.sendMessage(outgoing);
        }

        return result;
    }
}
```

**Action 7b:** Create `src/channels/channels.module.ts`:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { CHANNEL_ADAPTER } from './interfaces';
import { ChannelGatewayService } from './channel-gateway.service';
import { LineAdapter } from './line/line.adapter';
import { LineController } from './line/line.controller';
import { KakaoAdapter } from './kakao/kakao.adapter';
import { KakaoController } from './kakao/kakao.controller';
import { ConversationModule } from '../conversation/conversation.module';

// Post-MVP: import WebAdapter, WebController, TelegramAdapter, TelegramController

@Module({
    imports: [ConversationModule],
    providers: [
        LineAdapter,
        KakaoAdapter,
        {
            provide: CHANNEL_ADAPTER,
            useFactory: (
                line: LineAdapter,
                kakao: KakaoAdapter,
            ) => [line, kakao],
            inject: [LineAdapter, KakaoAdapter],
        },
        ChannelGatewayService,
    ],
    controllers: [LineController, KakaoController],
    // Post-MVP: add WebController, TelegramController
    exports: [ChannelGatewayService],
})
export class ChannelsModule {}
```

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 8 — Conversation Interfaces `src/conversation/interfaces.ts`

**What:** Types for request classification and conversation orchestration.

**Action:** Create `src/conversation/interfaces.ts`:

```typescript
export type RequestType = 'chat' | 'simple_task' | 'workflow_task';

export interface ClassifiedRequest {
    type: RequestType;
    intent: string;
    confidence: number;
}

export interface ConversationContext {
    userId: string;
    channelUserId: string;
    channelType: string;
    replyToken?: string;
    message: string;
    timestamp: Date;
}

export interface ConversationResult {
    response: string;
    requestType: RequestType;
}
```

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 9 — Memory Interfaces + Memory Service

**What:** Define the four-layer memory model (profile, goals, habits, interactions) and create an in-memory store for MVP.

**Action 9a:** Create `src/memory/interfaces.ts`:

```typescript
export interface UserProfile {
    userId: string;
    name?: string;
    timezone?: string;
    occupation?: string;
    communicationPreference?: string;
    metadata: Record<string, string>;
}

export interface UserGoal {
    id: string;
    userId: string;
    description: string;
    type: 'short_term' | 'long_term';
    status: 'active' | 'completed' | 'paused';
    createdAt: Date;
    updatedAt: Date;
}

export interface UserHabit {
    id: string;
    userId: string;
    description: string;
    frequency: string;
    lastObserved: Date;
}

export interface InteractionRecord {
    id: string;
    userId: string;
    summary: string;
    requestType: string;
    timestamp: Date;
}

export interface UserMemory {
    profile: UserProfile;
    goals: UserGoal[];
    habits: UserHabit[];
    interactions: InteractionRecord[];
}

export interface MemorySummary {
    profileSummary: string;
    activeGoals: string[];
    recentInteractions: string[];
}
```

**Action 9b:** Create `src/memory/memory.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
    InteractionRecord,
    MemorySummary,
    UserGoal,
    UserMemory,
    UserProfile,
} from './interfaces';

@Injectable()
export class MemoryService {
    private readonly logger = new Logger(MemoryService.name);
    private readonly store = new Map<string, UserMemory>();

    getOrCreateMemory(userId: string): UserMemory {
        let memory = this.store.get(userId);
        if (!memory) {
            memory = {
                profile: { userId, metadata: {} },
                goals: [],
                habits: [],
                interactions: [],
            };
            this.store.set(userId, memory);
        }
        return memory;
    }

    updateProfile(userId: string, updates: Partial<UserProfile>): UserProfile {
        const memory = this.getOrCreateMemory(userId);
        Object.assign(memory.profile, updates);
        return memory.profile;
    }

    addGoal(userId: string, goal: Omit<UserGoal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): UserGoal {
        const memory = this.getOrCreateMemory(userId);
        const newGoal: UserGoal = {
            ...goal,
            id: crypto.randomUUID(),
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        memory.goals.push(newGoal);
        return newGoal;
    }

    addInteraction(userId: string, summary: string, requestType: string): InteractionRecord {
        const memory = this.getOrCreateMemory(userId);
        const record: InteractionRecord = {
            id: crypto.randomUUID(),
            userId,
            summary,
            requestType,
            timestamp: new Date(),
        };
        memory.interactions.push(record);

        // Keep only last 100 interactions in memory (MVP)
        if (memory.interactions.length > 100) {
            memory.interactions = memory.interactions.slice(-100);
        }

        return record;
    }

    getSummary(userId: string): MemorySummary {
        const memory = this.getOrCreateMemory(userId);
        const profile = memory.profile;

        const profileParts: string[] = [];
        if (profile.name) profileParts.push(`Name: ${profile.name}`);
        if (profile.timezone) profileParts.push(`Timezone: ${profile.timezone}`);
        if (profile.occupation) profileParts.push(`Occupation: ${profile.occupation}`);

        return {
            profileSummary: profileParts.join(', ') || 'No profile data yet',
            activeGoals: memory.goals
                .filter((g) => g.status === 'active')
                .map((g) => g.description),
            recentInteractions: memory.interactions
                .slice(-5)
                .map((i) => `[${i.requestType}] ${i.summary}`),
        };
    }
}
```

**Action 9c:** Create `src/memory/memory.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';

@Module({
    providers: [MemoryService],
    exports: [MemoryService],
})
export class MemoryModule {}
```

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 10 — Core Client Service `src/core-client/`

**What:** TCP client that connects to nomi-core on port 4000. Wraps NestJS `ClientProxy` and provides typed methods for each message pattern from `nomi-shared`.

**Action 10a:** Create `src/core-client/core-client.service.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
    CORE_PATTERNS,
    ExecutionRequest,
    ExecutionResponse,
} from 'nomi-shared';

export const CORE_CLIENT = Symbol('CORE_CLIENT');

@Injectable()
export class CoreClientService {
    private readonly logger = new Logger(CoreClientService.name);

    constructor(
        @Inject(CORE_CLIENT)
        private readonly client: ClientProxy,
    ) {}

    async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
        return firstValueFrom(
            this.client.send<ExecutionResponse>(CORE_PATTERNS.EXECUTE, request),
        );
    }

    async health(): Promise<{ status: string }> {
        return firstValueFrom(
            this.client.send<{ status: string }>(CORE_PATTERNS.HEALTH, {}),
        );
    }
}
```

**Action 10b:** Create `src/core-client/core-client.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { CoreClientService, CORE_CLIENT } from './core-client.service';

@Module({
    imports: [
        ClientsModule.registerAsync([
            {
                name: CORE_CLIENT,
                useFactory: (config: ConfigService) => ({
                    transport: Transport.TCP,
                    options: {
                        host: config.get<string>('CORE_TCP_HOST', 'localhost'),
                        port: config.get<number>('CORE_TCP_PORT', 4000),
                    },
                }),
                inject: [ConfigService],
            },
        ]),
    ],
    providers: [CoreClientService],
    exports: [CoreClientService],
})
export class CoreClientModule {}
```

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 11 — Conversation Service `src/conversation/`

**What:** The brain of Biseo. Classifies requests, builds LLM prompt with user memory context, calls nomi-core via TCP, returns conversational response.

**Action 11a:** Create `src/conversation/conversation.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ConversationContext, ConversationResult } from './interfaces';
import { MemoryService } from '../memory/memory.service';
import { CoreClientService } from '../core-client/core-client.service';

@Injectable()
export class ConversationService {
    private readonly logger = new Logger(ConversationService.name);
    private readonly defaultProvider: { name: string; model: string };

    constructor(
        private readonly memoryService: MemoryService,
        private readonly coreClient: CoreClientService,
        private readonly config: ConfigService,
    ) {
        this.defaultProvider = {
            name: this.config.get<string>('DEFAULT_PROVIDER_NAME', 'gemini'),
            model: this.config.get<string>('DEFAULT_PROVIDER_MODEL', 'gemini-2.0-flash'),
        };
    }

    async process(context: ConversationContext): Promise<ConversationResult> {
        const { userId, message } = context;

        // Build memory context
        const memorySummary = this.memoryService.getSummary(userId);

        // Build system prompt with user context
        const systemPrompt = this.buildSystemPrompt(memorySummary);

        // Call nomi-core
        const response = await this.coreClient.execute({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message },
            ],
            provider: this.defaultProvider,
            trace: {
                userId,
                featureId: 'biseo.conversation',
                traceId: uuidv4(),
            },
        });

        // Record interaction in memory
        this.memoryService.addInteraction(
            userId,
            message.substring(0, 200),
            'chat',
        );

        if (!response.valid || response.error) {
            this.logger.warn({
                msg: 'Core execution failed',
                error: response.error,
                traceId: response.traceId,
            });
            return {
                response: 'I apologize, but I encountered an issue processing your request. Please try again.',
                requestType: 'chat',
            };
        }

        return {
            response: response.raw,
            requestType: 'chat',
        };
    }

    private buildSystemPrompt(memory: { profileSummary: string; activeGoals: string[]; recentInteractions: string[] }): string {
        const parts = [
            'You are Biseo, a personal AI assistant and Chief of Staff.',
            'You know the user deeply and provide personalized, helpful responses.',
            'Be concise, warm, and proactive.',
        ];

        if (memory.profileSummary !== 'No profile data yet') {
            parts.push(`\nUser profile: ${memory.profileSummary}`);
        }

        if (memory.activeGoals.length > 0) {
            parts.push(`\nUser goals: ${memory.activeGoals.join('; ')}`);
        }

        if (memory.recentInteractions.length > 0) {
            parts.push(`\nRecent context: ${memory.recentInteractions.join(' | ')}`);
        }

        return parts.join('\n');
    }
}
```

**Action 11b:** Create `src/conversation/conversation.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { MemoryModule } from '../memory/memory.module';
import { CoreClientModule } from '../core-client/core-client.module';

@Module({
    imports: [MemoryModule, CoreClientModule],
    providers: [ConversationService],
    exports: [ConversationService],
})
export class ConversationModule {}
```

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 12 — Wire Everything in `src/app.module.ts`

**What:** Uncomment all module imports. The full dependency graph is now complete.

**Action:** Update `src/app.module.ts` imports:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ChannelsModule } from './channels/channels.module';
import { ConversationModule } from './conversation/conversation.module';
import { MemoryModule } from './memory/memory.module';
import { CoreClientModule } from './core-client/core-client.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        LoggerModule.forRoot({
            pinoHttp: {
                level: process.env.LOG_LEVEL ?? 'info',
                transport:
                    process.env.NODE_ENV !== 'production'
                        ? { target: 'pino-pretty' }
                        : undefined,
            },
        }),
        ChannelsModule,
        ConversationModule,
        MemoryModule,
        CoreClientModule,
    ],
})
export class AppModule {}
```

**Verify:** `npm run build` — zero errors.

- [ ] Done

---

### Step 13 — Unit Test: MemoryService

**What:** Test memory creation, profile updates, interaction recording, and summary generation.

**Action:** Create `src/memory/__tests__/memory.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryService } from '../memory.service';

describe('MemoryService', () => {
    let service: MemoryService;

    beforeEach(() => {
        service = new MemoryService();
    });

    it('creates new memory for unknown user', () => {
        const memory = service.getOrCreateMemory('user-1');
        expect(memory.profile.userId).toBe('user-1');
        expect(memory.goals).toHaveLength(0);
        expect(memory.interactions).toHaveLength(0);
    });

    it('updates profile fields', () => {
        service.updateProfile('user-1', { name: 'Alice', timezone: 'Asia/Bangkok' });
        const memory = service.getOrCreateMemory('user-1');
        expect(memory.profile.name).toBe('Alice');
        expect(memory.profile.timezone).toBe('Asia/Bangkok');
    });

    it('adds goals', () => {
        const goal = service.addGoal('user-1', {
            description: 'Launch product',
            type: 'short_term',
            status: 'active',
        });
        expect(goal.userId).toBe('user-1');
        expect(goal.id).toBeDefined();
        const memory = service.getOrCreateMemory('user-1');
        expect(memory.goals).toHaveLength(1);
    });

    it('records interactions and caps at 100', () => {
        for (let i = 0; i < 110; i++) {
            service.addInteraction('user-1', `msg-${i}`, 'chat');
        }
        const memory = service.getOrCreateMemory('user-1');
        expect(memory.interactions).toHaveLength(100);
    });

    it('builds summary with profile and goals', () => {
        service.updateProfile('user-1', { name: 'Bob', occupation: 'Engineer' });
        service.addGoal('user-1', {
            description: 'Read more',
            type: 'long_term',
            status: 'active',
        });
        service.addInteraction('user-1', 'Asked about weather', 'chat');

        const summary = service.getSummary('user-1');
        expect(summary.profileSummary).toContain('Bob');
        expect(summary.activeGoals).toContain('Read more');
        expect(summary.recentInteractions).toHaveLength(1);
    });
});
```

**Run:** `npx vitest run src/memory`.

- [ ] Done

---

### Step 14 — Unit Test: ChannelGatewayService

**What:** Test that incoming messages are routed to the conversation service and responses are dispatched back through the correct channel adapter.

**Action:** Create `src/channels/__tests__/channel-gateway.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelGatewayService } from '../channel-gateway.service';
import { IChannelAdapter, IncomingMessage } from '../interfaces';
import { ConversationService } from '../../conversation/conversation.service';

function makeAdapter(channelType: string): IChannelAdapter {
    return {
        channelType: channelType as any,
        sendMessage: vi.fn().mockResolvedValue(undefined),
    };
}

describe('ChannelGatewayService', () => {
    let gateway: ChannelGatewayService;
    let webAdapter: IChannelAdapter;
    let mockConversation: ConversationService;

    beforeEach(() => {
        webAdapter = makeAdapter('web');
        mockConversation = {
            process: vi.fn().mockResolvedValue({
                response: 'Hello!',
                requestType: 'chat',
            }),
        } as any;

        gateway = new ChannelGatewayService([webAdapter], mockConversation);
    });

    it('routes incoming message to conversation service', async () => {
        const incoming: IncomingMessage = {
            channelType: 'web',
            channelUserId: 'user-1',
            text: 'hi',
            timestamp: new Date(),
        };

        const result = await gateway.handleIncoming(incoming);

        expect(mockConversation.process).toHaveBeenCalledOnce();
        expect(result.response).toBe('Hello!');
    });

    it('sends response back through the correct adapter', async () => {
        const incoming: IncomingMessage = {
            channelType: 'web',
            channelUserId: 'user-1',
            text: 'hi',
            timestamp: new Date(),
        };

        await gateway.handleIncoming(incoming);

        expect(webAdapter.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channelType: 'web',
                text: 'Hello!',
            }),
        );
    });
});
```

**Run:** `npx vitest run src/channels`.

- [ ] Done

---

### Step 15 — Unit Test: ConversationService

**What:** Test that conversation service builds context from memory, calls nomi-core, and handles failures gracefully.

**Action:** Create `src/conversation/__tests__/conversation.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationService } from '../conversation.service';
import { MemoryService } from '../../memory/memory.service';
import { CoreClientService } from '../../core-client/core-client.service';

describe('ConversationService', () => {
    let service: ConversationService;
    let memoryService: MemoryService;
    let coreClient: CoreClientService;

    beforeEach(() => {
        memoryService = new MemoryService();
        coreClient = {
            execute: vi.fn().mockResolvedValue({
                raw: 'I can help with that!',
                valid: true,
                usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
                cost: { totalCost: 0.001 },
                durationMs: 500,
                attempt: 1,
                traceId: 'trace-1',
            }),
        } as any;

        const mockConfig = {
            get: vi.fn((key: string, defaultValue: string) => defaultValue),
        } as any;

        service = new ConversationService(memoryService, coreClient, mockConfig);
    });

    it('processes a chat message and returns response', async () => {
        const result = await service.process({
            userId: 'user-1',
            channelUserId: 'user-1',
            channelType: 'web',
            message: 'Hello Biseo!',
            timestamp: new Date(),
        });

        expect(result.response).toBe('I can help with that!');
        expect(result.requestType).toBe('chat');
        expect(coreClient.execute).toHaveBeenCalledOnce();
    });

    it('includes memory context in system prompt', async () => {
        memoryService.updateProfile('user-1', { name: 'Alice' });

        await service.process({
            userId: 'user-1',
            channelUserId: 'user-1',
            channelType: 'web',
            message: 'Hi',
            timestamp: new Date(),
        });

        const callArgs = (coreClient.execute as any).mock.calls[0][0];
        const systemMessage = callArgs.messages[0];
        expect(systemMessage.content).toContain('Alice');
    });

    it('returns fallback message on core failure', async () => {
        (coreClient.execute as any).mockResolvedValueOnce({
            raw: '',
            valid: false,
            error: 'All retries exhausted',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            cost: { totalCost: 0 },
            durationMs: 3000,
            attempt: 3,
            traceId: 'trace-err',
        });

        const result = await service.process({
            userId: 'user-1',
            channelUserId: 'user-1',
            channelType: 'web',
            message: 'Hello',
            timestamp: new Date(),
        });

        expect(result.response).toContain('apologize');
    });

    it('records interaction in memory after processing', async () => {
        await service.process({
            userId: 'user-1',
            channelUserId: 'user-1',
            channelType: 'web',
            message: 'What should I focus on?',
            timestamp: new Date(),
        });

        const memory = memoryService.getOrCreateMemory('user-1');
        expect(memory.interactions).toHaveLength(1);
        expect(memory.interactions[0].summary).toContain('What should I focus on?');
    });
});
```

**Run:** `npx vitest run src/conversation`.

- [ ] Done

---

### Step 16 — Manual Test Client + End-to-End Verification

**What:** Create a test script and verify the full flow: HTTP request → channel → conversation → nomi-core TCP → response.

**Action:** Create `test/test-web-client.ts`:

```typescript
async function main() {
    const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: 'test-user-1',
            message: 'Hello Biseo! What can you help me with?',
        }),
    });
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
}
main().catch(console.error);
```

**Prerequisites:**
1. nomi-core must be running on TCP port 4000
2. nomi-biseo must be running on HTTP port 3000

**Verify:**
1. Start nomi-core: `cd ../nomi-core && npm run start:dev`
2. Start nomi-biseo: `npm run start:dev`
3. Run test: `npx tsx test/test-web-client.ts`
4. Expect a JSON response with `{ response: "..." }`

- [ ] Done

---

## Post-MVP Stage

### Step 17 — Prisma Integration for Memory Persistence

**What:** Replace in-memory `Map` store with PostgreSQL via Prisma. Same pattern as nomi-core's post-MVP.

**Action:**
1. Install `prisma` + `@prisma/client`
2. Create `prisma/schema.prisma` with `UserProfile`, `UserGoal`, `UserHabit`, `InteractionRecord` models
3. Create `src/prisma/prisma.service.ts` + `src/prisma/prisma.module.ts`
4. Update `MemoryService` to use `PrismaService` instead of `Map`
5. Run `npx prisma migrate dev --name init`

- [ ] Done

---

### Step 18 — Vector Memory with pgvector

**What:** Replace the flat interaction history (capped at 100, last-5 retrieval) with semantic retrieval using pgvector on the same PostgreSQL instance. Biseo retrieves the most contextually relevant past interactions for the current message — not just the most recent.

This is the upgrade that makes memory a genuine competitive advantage: Biseo can recall "you mentioned wanting to learn Spanish 3 months ago" when the current message is about language learning.

**Why pgvector over a separate vector service (Pinecone, Weaviate):**
- Same PostgreSQL instance as Step 17 — no extra infrastructure
- Transactions across relational and vector data
- `IVFFlat` index is production-capable for personal-scale data volumes

**Action:**
1. Enable `pgvector` extension in PostgreSQL: `CREATE EXTENSION IF NOT EXISTS vector`
2. Install `pgvector` npm package: `npm install pgvector`
3. Add `embedding` column to `InteractionRecord` in `prisma/schema.prisma`:
   ```prisma
   model InteractionRecord {
       id         String   @id @default(uuid())
       userId     String
       summary    String
       requestType String
       timestamp  DateTime @default(now())
       embedding  Unsupported("vector(768)")?
   }
   ```
4. Create `src/memory/embedding.service.ts` — calls nomi-core `EXECUTE` with an embedding model to generate `float[]` vectors for interaction summaries
5. Create `src/memory/vector-memory.service.ts` — `upsert(record, embedding)` and `findRelevant(userId, queryEmbedding, topK)` using raw SQL with `<=>` cosine distance operator
6. Update `MemoryService.addInteraction()` to generate and store an embedding after saving to Prisma
7. Update `MemoryService.getSummary()` to retrieve the top-K semantically relevant interactions instead of last-5

**New memory layer structure after this step:**
```
src/memory/
├── interfaces.ts
├── memory.service.ts              ← orchestrates both stores
├── memory.module.ts
├── relational/
│   └── prisma-memory.service.ts   ← profile, goals, habits (structured)
└── vector/
    ├── vector-memory.service.ts   ← interaction retrieval by similarity
    └── embedding.service.ts       ← generates embeddings via nomi-core
```

**Future extensions of the vector store:**
- **Personal knowledge base** — user uploads documents/notes; stored as chunks with embeddings; retrieved via RAG
- **Agent result cache** — Research/News Agent outputs embedded and stored; prevents duplicate work across sessions

**Verify:** Add an interaction, confirm embedding is stored, run a semantic query and confirm relevant (not just recent) results are returned.

- [ ] Done

---

### Step 19 — Request Classification (LLM-based)

**What:** Use nomi-core to classify incoming messages into `chat`, `simple_task`, or `workflow_task` with structured output.

**Action:**
1. Add classification prompt template in `ConversationService`
2. Call nomi-core with Zod schema for `ClassifiedRequest`
3. Route differently based on classification result

- [ ] Done

---

### Step 20 — Task Planning for Workflow Tasks

**What:** Implement the UNDERSTAND → DECOMPOSE → ASSIGN → EXECUTE → AGGREGATE → DELIVER pipeline for complex requests.

**Action:**
1. Create `src/task-planning/` module
2. Implement task decomposition via LLM
3. Implement capability-based agent routing (prerequisite: Nomi Company)

- [ ] Done

---

### Step 21 — Proactive Features

**What:** Biseo initiates conversations — morning briefings, reminders, follow-ups.

**Action:**
1. Create `src/scheduler/` module with cron-based triggers
2. Implement morning news summary (requires News Agent from Nomi Company)
3. Implement task reminders based on user goals

- [ ] Done

---

### Step 22 — Nomi Company Integration

**What:** Connect Biseo to Nomi Company's agent workforce for delegated task execution.

**Action:**
1. Create `src/company-client/` module (TCP client to Nomi Company)
2. Implement capability-based routing: `goal → capability → agent`
3. Aggregate multi-agent results into coherent user responses

- [ ] Done

---

### Step 23 — User Identity Mapping

**What:** Map channel-specific user IDs (LINE userId, KakaoTalk botUserKey, Telegram chatId, web sessionId) to a single Nomi user identity.

**Action:**
1. Create `src/identity/` module
2. Implement user linking: same user across multiple channels shares one memory
3. Prisma model: `UserIdentity { id, nomiUserId, channelType, channelUserId }`

- [ ] Done

---

### Step 24 — Web Channel Adapter `src/channels/web/` _(Post-MVP)_

**What:** REST API channel for web-based clients. The simplest channel — no webhook signature, no external API. Returns response directly via HTTP.

**Action 24a:** Create `src/channels/web/web.adapter.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IChannelAdapter, OutgoingMessage } from '../interfaces';

@Injectable()
export class WebAdapter implements IChannelAdapter {
    readonly channelType = 'web' as const;
    private readonly logger = new Logger(WebAdapter.name);

    async sendMessage(message: OutgoingMessage): Promise<void> {
        this.logger.debug({ channelUserId: message.channelUserId, msg: 'Web message sent' });
    }
}
```

**Action 24b:** Create `src/channels/web/web.controller.ts`:

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { ChannelGatewayService } from '../channel-gateway.service';
import { IncomingMessage } from '../interfaces';

@Controller('api')
export class WebController {
    constructor(private readonly gateway: ChannelGatewayService) {}

    @Post('chat')
    async chat(@Body() body: { userId: string; message: string }) {
        const incoming: IncomingMessage = {
            channelType: 'web' as any,
            channelUserId: body.userId,
            text: body.message,
            timestamp: new Date(),
        };
        const result = await this.gateway.handleIncoming(incoming);
        return { response: result.response };
    }
}
```

**Action 24c:** Extend `ChannelType` in `src/channels/interfaces.ts`:
```typescript
export type ChannelType = 'line' | 'kakao' | 'web';
```

**Action 24d:** Register `WebAdapter` and `WebController` in `channels.module.ts`.

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

### Step 25 — Telegram Channel Adapter `src/channels/telegram/` _(Post-MVP)_

**What:** Telegram Bot API adapter. Receives webhook updates, sends messages via `sendMessage` API. Full implementation is already documented in Step 6.

**Action:**
1. Implement `src/channels/telegram/telegram.adapter.ts` and `telegram.controller.ts` (see Step 6 for code)
2. Extend `ChannelType` in interfaces: add `'telegram'`
3. Register `TelegramAdapter` and `TelegramController` in `channels.module.ts`
4. Add `TELEGRAM_BOT_TOKEN` to `.env.example`

**Verify:** `npx tsc --noEmit`.

- [ ] Done

---

To add a new channel (e.g., Discord, Slack, WhatsApp):

1. Create `src/channels/<channel>/` folder
2. Create `<channel>.adapter.ts` implementing `IChannelAdapter`
3. Create `<channel>.controller.ts` with webhook endpoint
4. Register the adapter in `channels.module.ts` under `CHANNEL_ADAPTER` token
5. Add env vars for API credentials in `.env.example`

No changes to the conversation, memory, or core-client layers are required.
