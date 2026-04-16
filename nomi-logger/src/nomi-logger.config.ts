import type { LoggerOptions } from 'pino';

export function createPinoConfig(level: string): LoggerOptions {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        return { level };
    }

    return {
        level,
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        },
    };
}