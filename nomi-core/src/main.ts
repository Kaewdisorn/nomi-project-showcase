import 'dotenv/config';

import { join } from 'path';

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { AppModule } from './app.module';
import { NomiLoggerService } from '@nomi-labs/nomi-logger';

async function bootstrap() {
  const grpcPort = process.env.CORE_GRPC_PORT;
  const env = process.env.NODE_ENV;
  const logLevel = process.env.LOG_LEVEL;

  if (!grpcPort) {
    throw new Error('CORE_GRPC_PORT environment variable is not defined');
  }

  if (!env) {
    throw new Error('NODE_ENV environment variable is not defined');
  }

  if (!logLevel) {
    throw new Error('LOG_LEVEL environment variable is not defined');
  }

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'nomi.core',
        protoPath: join(__dirname, 'proto/core.proto'),
        url: `0.0.0.0:${grpcPort}`,
      },
    },
  );

  await app.listen();

  const logger = app.get(NomiLoggerService);
  const ctx = {
    traceId: 'bootstrap',
    userId: 'system',
    featureId: 'startup',
    service: 'nomi-core',
  };

  logger.info('gRPC microservice is listening', ctx, {
    env,
    logLevel,
    grpcPort,
  });
}

bootstrap();
