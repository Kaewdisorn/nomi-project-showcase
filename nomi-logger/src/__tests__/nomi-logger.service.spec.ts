import { LogContext } from '@nomi-labs/nomi-shared';
import { NomiLoggerService } from '../nomi-logger.service';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPinoInstance = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

vi.mock('pino', () => ({
    default: vi.fn(() => mockPinoInstance),
}));

vi.mock('../nomi-logger.config', () => ({
    createPinoConfig: vi.fn(() => ({ level: 'debug' })),
}));

const baseContext: LogContext = {
    traceId: 'trace-001',
    userId: 'user-001',
    featureId: 'daily-briefing',
    service: 'nomi-core',
};

describe('NomiLoggerService', () => {
    let service: NomiLoggerService;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.LOG_LEVEL = 'debug';
        service = new NomiLoggerService();
        service.onModuleInit();
    });

    afterEach(() => {
        delete process.env.LOG_LEVEL;
    });

    describe('onModuleInit()', () => {
        it('throws if LOG_LEVEL env var is missing', () => {
            delete process.env.LOG_LEVEL;
            const s = new NomiLoggerService();
            expect(() => s.onModuleInit()).toThrow('LOG_LEVEL env var is required');
        });
    });

    describe('debug()', () => {
        it('calls pino.debug with merged context and message', () => {
            service.debug('debug message', baseContext, { extra: 'data' });

            expect(mockPinoInstance.debug).toHaveBeenCalledWith(
                { ...baseContext, extra: 'data' },
                'debug message',
            );
        });

        it('calls pino.debug with only context when no meta provided', () => {
            service.debug('debug message', baseContext);

            expect(mockPinoInstance.debug).toHaveBeenCalledWith(
                { ...baseContext },
                'debug message',
            );
        });
    });

    describe('info()', () => {
        it('calls pino.info with merged context and message', () => {
            service.info('execution started', baseContext, { model: 'gemini-1.5-pro' });

            expect(mockPinoInstance.info).toHaveBeenCalledWith(
                { ...baseContext, model: 'gemini-1.5-pro' },
                'execution started',
            );
        });

        it('calls pino.info with only context when no meta provided', () => {
            service.info('execution started', baseContext);

            expect(mockPinoInstance.info).toHaveBeenCalledWith(
                { ...baseContext },
                'execution started',
            );
        });
    });

    describe('warn()', () => {
        it('calls pino.warn with merged context and message', () => {
            service.warn('retry attempt', baseContext, { attempt: 2, delayMs: 2000 });

            expect(mockPinoInstance.warn).toHaveBeenCalledWith(
                { ...baseContext, attempt: 2, delayMs: 2000 },
                'retry attempt',
            );
        });
    });

    describe('error()', () => {
        it('calls pino.error with serialized error when error is provided', () => {
            const error = new Error('something went wrong');

            service.error('execution failed', baseContext, error, { attempt: 1 });

            expect(mockPinoInstance.error).toHaveBeenCalledWith(
                {
                    ...baseContext,
                    attempt: 1,
                    err: {
                        type: 'Error',
                        message: 'something went wrong',
                        stack: error.stack,
                    },
                },
                'execution failed',
            );
        });

        it('calls pino.error without err field when no error is provided', () => {
            service.error('execution failed', baseContext, undefined, { attempt: 1 });

            const call = mockPinoInstance.error.mock.calls[0][0];
            expect(call).not.toHaveProperty('err');
            expect(call).toMatchObject({ ...baseContext, attempt: 1 });
        });

        it('serializes custom error types correctly', () => {
            class CustomError extends Error {
                constructor(message: string) {
                    super(message);
                    this.name = 'CustomError';
                }
            }

            const error = new CustomError('custom failure');
            service.error('custom error occurred', baseContext, error);

            const call = mockPinoInstance.error.mock.calls[0][0];
            expect(call.err.type).toBe('CustomError');
            expect(call.err.message).toBe('custom failure');
        });

        it('calls pino.error with only context and message when no error or meta', () => {
            service.error('execution failed', baseContext);

            expect(mockPinoInstance.error).toHaveBeenCalledWith(
                { ...baseContext },
                'execution failed',
            );
        });
    });

    describe('LogContext enforcement', () => {
        it('includes all required context fields in every log', () => {
            service.info('test message', baseContext);

            const call = mockPinoInstance.info.mock.calls[0][0];
            expect(call).toHaveProperty('traceId', 'trace-001');
            expect(call).toHaveProperty('userId', 'user-001');
            expect(call).toHaveProperty('featureId', 'daily-briefing');
            expect(call).toHaveProperty('service', 'nomi-core');
        });
    });
});