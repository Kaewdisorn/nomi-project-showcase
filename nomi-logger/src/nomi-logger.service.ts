// nomi-logger.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import pino, { Logger } from 'pino';
import { LogContext } from '@nomi-labs/nomi-shared';
import { createPinoConfig } from './nomi-logger.config';

@Injectable()
export class NomiLoggerService implements OnModuleInit {
    private logger!: Logger;

    onModuleInit(): void {
        const level = process.env.LOG_LEVEL;
        if (!level) throw new Error('LOG_LEVEL env var is required');
        this.logger = pino(createPinoConfig(level));
    }

    debug(message: string, context: LogContext, meta?: Record<string, unknown>): void {
        this.logger.debug({ ...context, ...meta }, message);
    }

    info(message: string, context: LogContext, meta?: Record<string, unknown>): void {
        this.logger.info({ ...context, ...meta }, message);
    }

    warn(message: string, context: LogContext, meta?: Record<string, unknown>): void {
        this.logger.warn({ ...context, ...meta }, message);
    }

    error(message: string, context: LogContext, error?: Error, meta?: Record<string, unknown>): void {
        this.logger.error(
            {
                ...context,
                ...meta,
                ...(error && {
                    err: {
                        type: error.constructor.name,
                        message: error.message,
                        stack: error.stack,
                    },
                }),
            },
            message,
        );
    }
}