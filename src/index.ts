/**
 * StressCortex entry point.
 *
 * Starts the Fastify server on port 6765, which provides:
 *   POST /api/test/start  — Start a stress test run
 *   POST /api/test/stop   — Stop a running test
 *   GET  /api/test/status — Query current test status
 *   GET  /api/events      — SSE stream of live test events (batched at 200ms)
 *   GET  /                — Serve compiled React dashboard SPA
 *
 * Tests are triggered via the REST API (not CLI args).
 * Connect the React dashboard at http://localhost:6765 to control tests
 * and view live metrics.
 */

import { createServer } from './server/index.js';
import { sseBridge } from './server/sse-bridge.js';
import { logger } from './core/logger.js';

async function main(): Promise<void> {
  // Build the Fastify app with all routes registered
  const server = await createServer();

  // Start the SSE bridge — subscribes to event bus and begins 200ms batch flush
  sseBridge.start();

  // Start listening on all interfaces (0.0.0.0 for container/network access)
  await server.listen({ port: 6765, host: '0.0.0.0' });
  logger.info({ port: 6765 }, 'StressCortex server listening on http://localhost:6765');

  // Graceful shutdown: stop SSE bridge flushing, close server (drains in-flight requests)
  const shutdown = async (signal: string) => {
    logger.info({ signal }, `Received ${signal}, initiating graceful shutdown...`);
    sseBridge.stop();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    logger.fatal({ event: 'fatal_error', message: error.message }, 'Unexpected error');
  } else {
    logger.fatal({ event: 'fatal_error', message: String(error) }, 'Unexpected error');
  }
  process.exit(1);
});
