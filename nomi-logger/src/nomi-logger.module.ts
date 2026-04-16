import { Global, Module } from '@nestjs/common';
import { NomiLoggerService } from './nomi-logger.service';

@Global()
@Module({
    providers: [NomiLoggerService],
    exports: [NomiLoggerService],
})
export class NomiLoggerModule { }