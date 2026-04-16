# Plan: Real KakaoTalk ↔ nomi-core Integration

Connect a live KakaoTalk OpenBuilder chatbot to nomi-biseo so that every user
utterance flows through:

```
KakaoTalk App
  → KakaoTalk OpenBuilder Skill Server (POST /webhook/kakao)
    → nomi-biseo (NestJS HTTP, port 3000)
      → nomi-core (NestJS TCP, port 4000)
        → LLM provider (Gemini)
      ← ExecutionResponse
    ← ConversationResult
  ← KakaoTalk Skill Response JSON
KakaoTalk App (renders reply)
```

---

## Current State

| File | Status |
|------|--------|
| `src/main.ts` | ✅ Done |
| `src/app.module.ts` | ⚠️ Bare — ConfigModule + LoggerModule only |
| `src/channels/` | ❌ Empty |
| `src/conversation/` | ❌ Missing |
| `src/memory/` | ❌ Missing |
| `src/core-client/` | ❌ Missing |

---

## Phase 1 — Build nomi-biseo Layers

### 1-A  Channel Interfaces `src/channels/interfaces.ts`

Defines the canonical message shapes shared by all adapters.

```typescript
export const CHANNEL_ADAPTER = Symbol('CHANNEL_ADAPTER');

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

Checklist:
- [ ] Create `src/channels/interfaces.ts`
- [ ] `npx tsc --noEmit` — zero errors

---

### 1-B  KakaoTalk Adapter `src/channels/kakao/`

KakaoTalk OpenBuilder uses a **synchronous skill server** pattern:
- nomi-biseo receives POST, calls nomi-core, returns JSON **in the same HTTP response**
- No reply token — delivery is the response body itself
- Response must arrive within **5 seconds** (OpenBuilder timeout)

**`src/channels/kakao/kakao.adapter.ts`**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IChannelAdapter, OutgoingMessage } from '../interfaces';

@Injectable()
export class KakaoAdapter implements IChannelAdapter {
    readonly channelType = 'kakao' as const;
    private readonly logger = new Logger(KakaoAdapter.name);

    // KakaoTalk responses are returned as the HTTP response body.
    // The controller owns delivery; this method is a no-op for kakao.
    async sendMessage(message: OutgoingMessage): Promise<void> {
        this.logger.debug({
            channelUserId: message.channelUserId,
            msg: 'KakaoTalk response queued for HTTP delivery',
        });
    }
}
```

**`src/channels/kakao/kakao.controller.ts`**
```typescript
import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { ChannelGatewayService } from '../channel-gateway.service';
import { IncomingMessage } from '../interfaces';

// KakaoTalk OpenBuilder Skill Request shape
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

        // KakaoTalk Skill Response (v2.0) — required shape
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

**Why synchronous?**
OpenBuilder calls your skill server and waits for the JSON reply. There is no
push/webhook-back mechanism. The entire nomi-core round-trip must complete
inside one HTTP request-response cycle.

Checklist:
- [ ] Create `src/channels/kakao/kakao.adapter.ts`
- [ ] Create `src/channels/kakao/kakao.controller.ts`
- [ ] `npx tsc --noEmit` — zero errors

---

### 1-C  Memory Layer `src/memory/`

In-memory store (MVP) — holds user profile, goals, habits, recent interactions.
Used by ConversationService to build personalised system prompts.

Files to create:
- `src/memory/interfaces.ts` — `UserProfile`, `UserGoal`, `UserHabit`, `InteractionRecord`, `UserMemory`, `MemorySummary`
- `src/memory/memory.service.ts` — `getOrCreateMemory`, `updateProfile`, `addGoal`, `addInteraction`, `getSummary`
- `src/memory/memory.module.ts` — exports `MemoryService`

Checklist:
- [ ] Create the three memory files
- [ ] `MemoryService.getSummary()` returns `MemorySummary` with `profileSummary`, `activeGoals`, `recentInteractions`

---

### 1-D  Core Client `src/core-client/`

TCP client that speaks to nomi-core on port 4000 using the contracts from
`nomi-shared`.

**`src/core-client/core-client.service.ts`**
```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { CORE_PATTERNS, ExecutionRequest, ExecutionResponse } from 'nomi-shared';

export const CORE_CLIENT = Symbol('CORE_CLIENT');

@Injectable()
export class CoreClientService {
    private readonly logger = new Logger(CoreClientService.name);

    constructor(@Inject(CORE_CLIENT) private readonly client: ClientProxy) {}

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

**`src/core-client/core-client.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { CoreClientService, CORE_CLIENT } from './core-client.service';

@Module({
    imports: [
        ClientsModule.registerAsync([{
            name: CORE_CLIENT,
            useFactory: (config: ConfigService) => ({
                transport: Transport.TCP,
                options: {
                    host: config.get<string>('CORE_TCP_HOST', 'localhost'),
                    port: config.get<number>('CORE_TCP_PORT', 4000),
                },
            }),
            inject: [ConfigService],
        }]),
    ],
    providers: [CoreClientService],
    exports: [CoreClientService],
})
export class CoreClientModule {}
```

Checklist:
- [ ] Create `src/core-client/core-client.service.ts`
- [ ] Create `src/core-client/core-client.module.ts`
- [ ] Verify `CORE_TCP_HOST` and `CORE_TCP_PORT` exist in `.env`

---

### 1-E  Conversation Service `src/conversation/`

The orchestration brain: build LLM prompt from memory, call nomi-core, return text.

**`src/conversation/conversation.service.ts`** — key logic:

```typescript
async process(context: ConversationContext): Promise<ConversationResult> {
    const memorySummary = this.memoryService.getSummary(context.userId);
    const systemPrompt   = this.buildSystemPrompt(memorySummary);

    const response = await this.coreClient.execute({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: context.message },
        ],
        provider: {
            name:  this.config.get('DEFAULT_PROVIDER_NAME',  'gemini'),
            model: this.config.get('DEFAULT_PROVIDER_MODEL', 'gemini-2.0-flash'),
        },
        trace: {
            userId:    context.userId,
            featureId: 'biseo.conversation',
            traceId:   randomUUID(),
        },
    });

    this.memoryService.addInteraction(context.userId, context.message.slice(0, 200), 'chat');

    if (!response.valid || response.error) {
        return { response: 'Sorry, I ran into an issue. Please try again.', requestType: 'chat' };
    }

    return { response: response.raw, requestType: 'chat' };
}
```

Checklist:
- [ ] Create `src/conversation/interfaces.ts`
- [ ] Create `src/conversation/conversation.service.ts`
- [ ] Create `src/conversation/conversation.module.ts` (imports MemoryModule + CoreClientModule)

---

### 1-F  Channel Gateway Service `src/channels/channel-gateway.service.ts`

Routes any normalised `IncomingMessage` → `ConversationService` → correct adapter.

```typescript
async handleIncoming(message: IncomingMessage): Promise<ConversationResult> {
    const result = await this.conversationService.process({
        userId:        message.channelUserId,
        channelUserId: message.channelUserId,
        channelType:   message.channelType,
        replyToken:    message.replyToken,
        message:       message.text,
        timestamp:     message.timestamp,
    });

    const adapter = this.adapterMap.get(message.channelType);
    if (adapter) {
        await adapter.sendMessage({
            channelType:   message.channelType,
            channelUserId: message.channelUserId,
            text:          result.response,
            replyToken:    message.replyToken,
        });
    }

    return result;
}
```

Checklist:
- [ ] Create `src/channels/channel-gateway.service.ts`
- [ ] Create `src/channels/channels.module.ts` (provides KakaoAdapter, CHANNEL_ADAPTER token, imports ConversationModule)

---

### 1-G  Wire `src/app.module.ts`

```typescript
imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateConfig }),
    LoggerModule.forRoot({ ... }),
    ChannelsModule,       // adds KakaoController, ChannelGatewayService
    ConversationModule,   // adds ConversationService
    MemoryModule,         // adds MemoryService
    CoreClientModule,     // adds TCP client to nomi-core
]
```

Required `.env` keys to add:
```
CORE_TCP_HOST=localhost
CORE_TCP_PORT=4000
DEFAULT_PROVIDER_NAME=gemini
DEFAULT_PROVIDER_MODEL=gemini-2.0-flash
```

Checklist:
- [ ] Add env keys to `.env` and `.env.example`
- [ ] Update `app.module.ts` imports
- [ ] `npm run build` — zero errors
- [ ] `npm run start:dev` — server starts, logs "Biseo running on port 3000"

---

## Phase 2 — Start nomi-core

nomi-core must be running before any KakaoTalk message can get a real AI response.

```powershell
# In a separate terminal, from nomi-core directory
cd ..\nomi-core
npm run start:dev
```

Expected log: `Nomi Core TCP microservice running on port 4000`

Verify from nomi-biseo:

```typescript
// Quick smoke test — add a temporary GET /health/core endpoint
@Get('health/core')
async coreHealth() {
    return this.coreClientService.health();
    // Expected: { status: 'ok', timestamp: '...' }
}
```

Checklist:
- [ ] nomi-core starts on port 4000 with zero errors
- [ ] `/health/core` returns `{ status: 'ok' }`
- [ ] Remove the temporary health endpoint after verification

---

## Phase 3 — KakaoTalk OpenBuilder Setup (External)

### 3-A  KakaoTalk Developers Console

1. Go to [https://developers.kakao.com](https://developers.kakao.com)
2. **My Applications → Add application**
   - App name: `Nomi Biseo` (or your chosen name)
   - Platform: Web (add your domain later)
3. Note the **App key** (REST API key) from the app summary page

### 3-B  Create a KakaoTalk Channel

1. Go to [https://business.kakao.com](https://business.kakao.com) → **KakaoTalk Channel → Create channel**
2. Set profile name, profile image, category
3. Note the **Channel ID** (`@your-channel-name`)

### 3-C  Create an OpenBuilder Chatbot

1. Go to [https://i.kakao.com](https://i.kakao.com) (카카오 i 오픈빌더)
2. **Create chatbot → Link to your KakaoTalk Channel**
3. Under **Settings → Skill Server**:
   - Skill Name: `nomi-biseo-skill`
   - URL: `https://<your-public-url>/webhook/kakao`  ← set in Phase 4
   - Method: POST
   - Content-Type: application/json
4. Under **Scenario (시나리오)**:
   - Create a scenario (e.g., "Default Fallback")
   - Add a block with **Fallback** condition
   - Block action: **Skill** → select `nomi-biseo-skill`
   - This makes every unmatched utterance route to your skill server

### 3-D  Bot Configuration Tips

| Setting | Value |
|---------|-------|
| Skill server timeout | Default 5 s — nomi-core must respond within ~4 s |
| Test mode | Enable "Test mode" in OpenBuilder to use the chatbot before deployment |
| Deployment | Requires KakaoTalk Channel approval for public release; test mode works immediately |

---

## Phase 4 — Expose nomi-biseo Publicly (Local Dev)

KakaoTalk OpenBuilder's skill server calls your webhook over the internet.
Use a tunnel to expose `localhost:3000` during development.

### Option A — ngrok (recommended)

```powershell
# Install ngrok: https://ngrok.com/download
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` URL.
Set it in OpenBuilder → Skill Server URL:
```
https://xxxx.ngrok-free.app/webhook/kakao
```

> ⚠️ Free ngrok URLs change each restart. Use `--domain` with a paid plan or
> use Option B for a stable URL.

### Option B — Cloudflare Tunnel (free, stable)

```powershell
# Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:3000
```

Gives a stable `*.trycloudflare.com` URL (no account needed for temporary tunnels).

### Verify the Tunnel

```powershell
# Send a test payload manually
$body = @{
    userRequest = @{
        user = @{ id = "test-user-001" }
        utterance = "Hello, Biseo!"
    }
} | ConvertTo-Json

Invoke-RestMethod -Method POST `
    -Uri "https://<your-tunnel>/webhook/kakao" `
    -ContentType "application/json" `
    -Body $body
```

Expected response:
```json
{
  "version": "2.0",
  "template": {
    "outputs": [{ "simpleText": { "text": "..." } }]
  }
}
```

---

## Phase 5 — End-to-End Test

### 5-A  Flow Verification Checklist

- [ ] nomi-core is running on port 4000
- [ ] nomi-biseo is running on port 3000 (`npm run start:dev`)
- [ ] Tunnel is active and URL is set in OpenBuilder Skill Server
- [ ] OpenBuilder Test → send "안녕" → response appears in KakaoTalk simulator
- [ ] nomi-biseo logs show `Incoming message channel=kakao`
- [ ] nomi-core logs show `core.execute` pattern received
- [ ] Response text from LLM appears in KakaoTalk simulator

### 5-B  Postman / Manual cURL Test

```powershell
curl -X POST http://localhost:3000/webhook/kakao `
  -H "Content-Type: application/json" `
  -d '{\"userRequest\":{\"user\":{\"id\":\"local-test\"},\"utterance\":\"What can you help me with?\"}}'
```

### 5-C  Timeout Guard

If nomi-core takes > 4 s, OpenBuilder shows an error to the user.

Mitigation: add timeout in `CoreClientService.execute()`:

```typescript
import { timeout } from 'rxjs/operators';

async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    return firstValueFrom(
        this.client
            .send<ExecutionResponse>(CORE_PATTERNS.EXECUTE, request)
            .pipe(timeout(4000)),
    );
}
```

And return a graceful fallback in `ConversationService` when timeout throws.

---

## Phase 6 — Production Checklist

- [ ] Deploy nomi-biseo to a server with a stable public HTTPS URL
- [ ] Deploy nomi-core on the same network (internal TCP, not exposed publicly)
- [ ] Set `CORE_TCP_HOST` to the internal hostname of nomi-core
- [ ] Update OpenBuilder Skill Server URL to the production URL
- [ ] Submit KakaoTalk Channel for public deployment review
- [ ] Set `LOG_LEVEL=info` and `NODE_ENV=production` in production `.env`
- [ ] Monitor logs for timeout errors (`response.error` from nomi-core)

---

## Data Flow Summary

```
1. User sends message in KakaoTalk app
2. KakaoTalk OpenBuilder POSTs to POST /webhook/kakao
   Body: { userRequest: { user: { id }, utterance } }

3. KakaoController → builds IncomingMessage
4. ChannelGatewayService.handleIncoming()
5. ConversationService.process()
   a. MemoryService.getSummary(userId) → builds system prompt
   b. CoreClientService.execute({ messages, provider, trace })
      → TCP send CORE_PATTERNS.EXECUTE to nomi-core:4000
      → nomi-core calls Gemini API
      ← ExecutionResponse { raw, valid, usage, cost }
   c. MemoryService.addInteraction()
   d. Returns ConversationResult { response: raw, requestType: 'chat' }
6. KakaoController returns skill response JSON:
   { version: "2.0", template: { outputs: [{ simpleText: { text: response } }] } }
7. KakaoTalk renders the text in the chat
```

---

## Key Constraints

| Constraint | Value | Mitigation |
|-----------|-------|-----------|
| Skill server timeout | 5 s | TCP timeout 4 s + fallback message |
| Response format | Must be v2.0 skill JSON | Fixed in KakaoController |
| User ID | `body.userRequest.user.id` (botUserKey) | Persisted per-user in MemoryService |
| No push API needed | Synchronous reply via HTTP response | No async delivery needed for MVP |
| KakaoTalk Channel approval | Required for public users | Test mode works immediately |
