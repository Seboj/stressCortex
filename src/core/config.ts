/**
 * Environment validation and application configuration.
 * Fail-fast: if CORTEX_API_KEY is missing, print a clear error and exit.
 * No stack traces — just a human-readable message.
 */

import 'dotenv/config';
import type { AppConfig } from '../types/api.js';

/**
 * Validate required environment variables and return application config.
 * Exits the process with code 1 and a clear error message if API key is missing.
 */
export function validateConfig(): AppConfig {
  const apiKey = process.env.CORTEX_API_KEY;

  if (!apiKey) {
    process.stderr.write(
      'Error: CORTEX_API_KEY environment variable is not set.\n' +
      'Set it in your .env file or export it in your shell:\n' +
      '  export CORTEX_API_KEY=your-key-here\n'
    );
    process.exit(1);
  }

  return {
    apiKey,
    baseUrl: 'https://cortex.nfinitmonkeys.com/v1',
    model: 'default',
  };
}
