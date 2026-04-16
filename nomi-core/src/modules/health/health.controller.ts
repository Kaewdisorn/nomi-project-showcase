import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class HealthController {
  @GrpcMethod('CoreService', 'Health')
  health() {
    return { status: 'ok', timestampMs: Date.now() }; // int64 epoch ms — matches proto
  }
}
