/**
 * StressCortex entry point.
 * Makes a single test call to the Cortex API to verify the foundation works.
 * Demonstrates: config validation, API client, latency measurement, token parsing,
 * error classification, event bus, and structured logging.
 */

import { validateConfig } from './core/config.js';
import { createCortexClient } from './api/client.js';
import { eventBus } from './core/event-bus.js';
import { logger } from './core/logger.js';
import type { ClassifiedError } from './types/api.js';

async function main(): Promise<void> {
  // Validate environment — exits with clear error if API key missing
  const config = validateConfig();

  // Create instrumented API client
  const cortex = createCortexClient(config);

  // Set up event bus listeners for demonstration
  eventBus.on('api:request', (evt) => {
    logger.debug({ event: 'bus:api_request', ...evt }, 'API request event');
  });

  eventBus.on('api:response', (evt) => {
    logger.debug({ event: 'bus:api_response', ...evt }, 'API response event');
  });

  eventBus.on('api:error', (evt) => {
    logger.debug({ event: 'bus:api_error', ...evt }, 'API error event');
  });

  logger.info('StressCortex starting — making single test call to Cortex API');

  // Make a single test call
  const result = await cortex.makeRequest([
    { role: 'system', content: 'You are a helpful assistant. Respond briefly.' },
    { role: 'user', content: 'Say "Hello from StressCortex" and nothing else.' },
  ]);

  // Log structured result
  logger.info(
    {
      event: 'test_call_complete',
      content: result.content,
      latencyMs: result.latencyMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      model: result.model,
    },
    'Single-turn test call succeeded',
  );

  // Human-readable summary
  const summary = [
    '',
    '  ✓ Cortex API call succeeded',
    `    Response: "${result.content}"`,
    `    Latency:  ${result.latencyMs}ms`,
    `    Tokens:   ${result.promptTokens} prompt + ${result.completionTokens} completion`,
    `    Model:    ${result.model}`,
    '',
  ].join('\n');

  process.stdout.write(summary);
}

// Run with proper error handling — no stack traces
main().catch((error: unknown) => {
  if (isClassifiedError(error)) {
    logger.error(
      {
        event: 'fatal_error',
        errorType: error.type,
        statusCode: error.statusCode,
        message: error.message,
      },
      `API call failed: ${error.type}`,
    );
  } else if (error instanceof Error) {
    logger.fatal({ event: 'fatal_error', message: error.message }, 'Unexpected error');
  } else {
    logger.fatal({ event: 'fatal_error', message: String(error) }, 'Unexpected error');
  }
  process.exit(1);
});

/** Type guard for ClassifiedError */
function isClassifiedError(error: unknown): error is ClassifiedError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'message' in error &&
    typeof (error as ClassifiedError).type === 'string'
  );
}
