/**
 * StressCortex entry point.
 * Runs N concurrent multi-turn medical conversations against the Cortex API
 * with staggered ramp-up and graceful shutdown.
 *
 * Configuration via environment variables:
 *   CORTEX_API_KEY     - Required: API key for Cortex
 *   STRESS_CONVERSATIONS - Number of concurrent conversations (default: 5)
 *   STRESS_TURNS        - Turns per conversation (default: 3)
 *   STRESS_RAMP_DELAY   - Base ramp-up delay in ms (default: 200)
 */

import { validateConfig } from './core/config.js';
import { createCortexClient } from './api/client.js';
import { createConversationManager } from './conversation/index.js';
import { eventBus } from './core/event-bus.js';
import { logger } from './core/logger.js';

async function main(): Promise<void> {
  // Validate environment — exits with clear error if API key missing
  const config = validateConfig();

  // Create instrumented API client
  const cortex = createCortexClient(config);

  // Parse configuration from environment
  const numConversations = parseInt(process.env.STRESS_CONVERSATIONS ?? '5', 10);
  const turnsPerConversation = parseInt(process.env.STRESS_TURNS ?? '3', 10);
  const rampUpDelayMs = parseInt(process.env.STRESS_RAMP_DELAY ?? '200', 10);

  // Set up event listeners for visibility
  eventBus.on('conversation:start', (evt) => {
    logger.info(
      { conversationId: evt.conversationId, turnsTotal: evt.turnsTotal },
      `Conversation ${evt.conversationId} started`,
    );
  });

  eventBus.on('conversation:turn:complete', (evt) => {
    logger.info(
      {
        conversationId: evt.conversationId,
        turn: `${evt.turnNumber}/${evt.turnsTotal}`,
        role: evt.role,
        latencyMs: evt.latencyMs,
        tokens: evt.promptTokens + evt.completionTokens,
        messageCount: evt.messageCount,
      },
      `Conv ${evt.conversationId} turn ${evt.turnNumber}/${evt.turnsTotal} (${evt.role})`,
    );
  });

  eventBus.on('conversation:complete', (evt) => {
    const status = evt.status === 'completed' ? 'ok' : 'ERRORED';
    logger.info(
      {
        conversationId: evt.conversationId,
        status: evt.status,
        turnsCompleted: evt.turnsCompleted,
      },
      `Conversation ${evt.conversationId} ${status}`,
    );
  });

  eventBus.on('test:lifecycle', (evt) => {
    logger.info(
      {
        type: evt.type,
        total: evt.conversationsTotal,
        active: evt.conversationsActive,
      },
      `Test lifecycle: ${evt.type}`,
    );
  });

  // Create conversation manager
  // Type cast: ConversationRunner builds messages as {role, content} which is a subset
  // of OpenAI's ChatCompletionMessageParam. The cast is safe because the runner
  // only sends valid role+content messages.
  const manager = createConversationManager({
    numConversations,
    turnsPerConversation,
    rampUpDelayMs,
    makeRequest: cortex.makeRequest as unknown as (
      messages: Array<{ role: string; content: string }>,
    ) => Promise<import('./types/api.js').CortexResponse>,
  });

  // Register signal handlers for graceful shutdown
  const handleSignal = (signal: string) => {
    logger.info({ signal }, `Received ${signal}, initiating graceful shutdown...`);
    manager.stop();
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  // Log start banner
  logger.info(
    {
      event: 'test_start',
      numConversations,
      turnsPerConversation,
      rampUpDelayMs,
      expectedApiCalls: numConversations * turnsPerConversation,
    },
    `Starting stress test: ${numConversations} conversations x ${turnsPerConversation} turns`,
  );

  // Run the test
  const result = await manager.start();

  // Print summary
  const summary = [
    '',
    '  ======================================================',
    '  StressCortex Test Summary',
    '  ======================================================',
    `    Conversations:  ${result.completedConversations}/${result.totalConversations} completed, ${result.erroredConversations} errored`,
    `    Total turns:    ${result.totalTurns}`,
    `    Total time:     ${Math.round(result.totalLatencyMs)}ms`,
    `    Stopped early:  ${result.stoppedEarly ? 'yes' : 'no'}`,
    '  ======================================================',
    '',
  ].join('\n');

  process.stdout.write(summary);

  // Exit with appropriate code
  if (result.erroredConversations === result.totalConversations) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    logger.fatal({ event: 'fatal_error', message: error.message }, 'Unexpected error');
  } else {
    logger.fatal({ event: 'fatal_error', message: String(error) }, 'Unexpected error');
  }
  process.exit(1);
});
