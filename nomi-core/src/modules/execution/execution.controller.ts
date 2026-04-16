import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ExecutionRequest, ExecutionResponse } from './types/execution.types';
import { ExecutionService } from './execution.service';

@Controller()
export class ExecutionController {
  constructor(
    private readonly engine: ExecutionService,
    // private readonly costTracker: CostTrackerService,
  ) {}

  @GrpcMethod('CoreService', 'Execute')
  execute(data: ExecutionRequest): Promise<ExecutionResponse> {
    return this.engine.execute(data);
  }
}
