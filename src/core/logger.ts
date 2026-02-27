/**
 * Pino logger configuration.
 * - Development: human-readable output via pino-pretty
 * - Production: raw JSON for structured log processing
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
        },
      }
    : undefined,
});
