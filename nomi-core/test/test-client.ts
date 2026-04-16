import 'dotenv/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { join } from 'path';

async function main() {
  const client = ClientProxyFactory.create({
    transport: Transport.GRPC,
    options: {
      package: 'nomi.core',
      protoPath: join(__dirname, '../src/proto/core.proto'),
      url: '127.0.0.1:4000',
    },
  });

  const coreService = client.getService<any>('CoreService');

  // 1. Health check
  console.log('--- Health Check ---');

  const health = await firstValueFrom<{
    status: string;
    timestampMs: { toNumber(): number } | number;
  }>(coreService.health({}));

  const timestampMs =
    typeof health.timestampMs === 'object'
      ? health.timestampMs.toNumber()
      : health.timestampMs;

  console.log('Health:', {
    status: health.status,
    timestampMs,
    time: new Date(timestampMs).toISOString(),
  });

  // 2. Execute
  console.log('\n--- Execute ---');
  const response = await firstValueFrom<{
    raw: string;
    valid: boolean;
    error?: string;
    provider: string;
    model: string;
    durationMs: number;
    attempt: number;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  }>(
    coreService.execute({
      messages: [
        { role: 1 /* CHAT_ROLE_USER */, content: 'Say hello in one sentence.' },
      ],
      provider: {
        name: 'gemini',
        model: 'gemini-3.1-flash-lite-preview',
        temperature: 0.0,
        maxOutputTokens: 64,
      },
      trace: {
        userId: 'test-user',
        featureId: 'test-feature',
        traceId: 'test-trace-001',
      },
    }),
  );
  console.log('Execute:', {
    valid: response.valid,
    provider: response.provider,
    model: response.model,
    durationMs: response.durationMs,
    attempt: response.attempt,
    usage: response.usage,
    raw: response.raw,
    error: response.error,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
