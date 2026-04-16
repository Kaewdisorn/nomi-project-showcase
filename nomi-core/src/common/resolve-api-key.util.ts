import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function resolveApiKey(envKey: string): string {
    // 1. Docker secret (mounted at /run/secrets/<lowercase-key>)
    const secretPath = join('/run/secrets', envKey.toLowerCase());

    if (existsSync(secretPath)) {
        return readFileSync(secretPath, 'utf-8').trim();
    }

    // 2. Environment variable
    const value = process.env[envKey];

    if (value) {
        return value;
    }

    throw new Error(
        `API key "${envKey}" not found in Docker secrets or environment variables`,
    );
}