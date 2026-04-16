import { Module } from '@nestjs/common';
import { ExecutionController } from '@modules/execution/execution.controller';
import { ExecutionService } from '@modules/execution/execution.service';
import { ProvidersModule } from '@modules/providers/providers.module';
import { CostModule } from '@modules/cost/cost.module';

@Module({
  imports: [ProvidersModule, CostModule],
  controllers: [ExecutionController],
  providers: [ExecutionService],
})
export class ExecutionModule {}
