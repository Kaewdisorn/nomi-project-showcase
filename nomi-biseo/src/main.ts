import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors();

  const port = process.env.BISEO_HTTP_PORT;
  if (!port) {
    throw new Error('Missing required environment variable: BISEO_HTTP_PORT');
  }

  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`Biseo running on port ${port}`, 'Bootstrap');
}
bootstrap();