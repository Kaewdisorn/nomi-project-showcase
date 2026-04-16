import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NomiLoggerModule } from '@nomi-labs/nomi-logger';
import { HealthModule } from '@modules/health/health.module';
import { ExecutionModule } from '@modules/execution/execution.module';
import { DatabaseModule } from '@src/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NomiLoggerModule,
    DatabaseModule,
    ExecutionModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
