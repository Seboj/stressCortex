/**
 * ConversationManager — orchestrates N concurrent conversations.
 *
 * Launches conversations with staggered ramp-up, tracks all results,
 * supports graceful stop with drain timeout.
 *
 * Uses Promise.allSettled for concurrent execution — each conversation
 * runs as its own promise. Failures are isolated: one conversation
 * erroring does not affect others.
 */

import { setTimeout as delay } from 'timers/promises';
import { createConversationRunner } from './runner.js';
import { eventBus } from '../core/event-bus.js';
import { logger } from '../core/logger.js';
import type { ManagerConfig, TestRunResult, ConversationResult } from '../types/conversation.js';

/**
 * Create a conversation manager for running N concurrent conversations.
 *
 * @param config - Manager configuration
 * @returns Object with start() and stop() methods
 */
export function createConversationManager(config: ManagerConfig) {
  const {
    numConversations,
    turnsPerConversation,
    makeRequest,
    rampUpDelayMs = 200,
    drainTimeoutMs = 30_000,
  } = config;

  let stopping = false;
  let stoppedEarly = false;

  // Resolve function for the stop drain — set when stop() is called
  let resolveStop: (() => void) | null = null;

  // Track the main execution promise so stop() can race against it
  let runPromise: Promise<ConversationResult[]> | null = null;

  /**
   * Start the test run: launch N conversations with staggered ramp-up.
   */
  async function start(): Promise<TestRunResult> {
    stopping = false;
    stoppedEarly = false;

    // Emit lifecycle: starting
    eventBus.emit('test:lifecycle', {
      type: 'starting',
      conversationsTotal: numConversations,
      conversationsActive: 0,
      timestamp: Date.now(),
    });

    // Emit lifecycle: running
    eventBus.emit('test:lifecycle', {
      type: 'running',
      conversationsTotal: numConversations,
      conversationsActive: numConversations,
      timestamp: Date.now(),
    });

    // Launch conversations with stagger
    const promises: Promise<ConversationResult>[] = [];

    for (let i = 0; i < numConversations; i++) {
      const conversationId = i + 1;

      const runner = createConversationRunner({
        conversationId,
        turnsPerConversation,
        makeRequest,
        shouldStop: () => stopping,
      });

      promises.push(runner.run());

      logger.debug({
        conversationId,
        timestamp: Date.now(),
      }, `Launched conversation ${conversationId}`);

      // Stagger delay between launches (skip after last conversation)
      if (i < numConversations - 1 && rampUpDelayMs > 0) {
        const jitter = Math.random() * 0.5 * rampUpDelayMs;
        await delay(rampUpDelayMs + jitter);
      }
    }

    // Store the run promise for stop() to reference
    runPromise = Promise.allSettled(promises).then((settled) =>
      settled.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        // Should not happen — runners catch internally and return ConversationResult
        return {
          conversationId: 0,
          turnsCompleted: 0,
          status: 'errored' as const,
          errorMessage: 'Unexpected rejection: ' + String(result.reason),
          totalLatencyMs: 0,
          turns: [],
        };
      }),
    );

    // Wait for all conversations to complete
    const results = await runPromise;
    runPromise = null;

    // Build summary
    const completedConversations = results.filter((r) => r.status === 'completed').length;
    const erroredConversations = results.filter((r) => r.status === 'errored').length;
    const totalTurns = results.reduce((sum, r) => sum + r.turnsCompleted, 0);
    const totalLatencyMs = results.reduce((sum, r) => sum + r.totalLatencyMs, 0);

    const runResult: TestRunResult = {
      conversations: results,
      totalConversations: numConversations,
      completedConversations,
      erroredConversations,
      totalTurns,
      totalLatencyMs,
      stoppedEarly,
    };

    // Emit lifecycle: stopped
    eventBus.emit('test:lifecycle', {
      type: 'stopped',
      conversationsTotal: numConversations,
      conversationsActive: 0,
      timestamp: Date.now(),
    });

    // Resolve the stop promise if someone is waiting
    if (resolveStop) {
      resolveStop();
      resolveStop = null;
    }

    return runResult;
  }

  /**
   * Stop the test run gracefully.
   * Sets the stopping flag so runners skip new turns.
   * In-flight API requests complete naturally.
   * Resolves after drain timeout even if requests are still pending.
   */
  async function stop(): Promise<void> {
    stopping = true;
    stoppedEarly = true;

    eventBus.emit('test:lifecycle', {
      type: 'stopping',
      conversationsTotal: numConversations,
      conversationsActive: 0, // approximate — we don't track exact active count
      timestamp: Date.now(),
    });

    eventBus.emit('test:lifecycle', {
      type: 'draining',
      conversationsTotal: numConversations,
      conversationsActive: 0,
      timestamp: Date.now(),
    });

    // Wait for either: all conversations to finish OR drain timeout
    // Use AbortController to cancel the timeout timer when drain completes
    const drainAbort = new AbortController();
    const drainPromise = new Promise<void>((resolve) => {
      resolveStop = () => {
        drainAbort.abort();
        resolve();
      };
    });

    await Promise.race([
      drainPromise,
      delay(drainTimeoutMs, undefined, { signal: drainAbort.signal }).catch(() => {
        // AbortError is expected when drain completes before timeout
      }).then(() => {
        if (!drainAbort.signal.aborted) {
          logger.warn({ event: 'drain_timeout', drainTimeoutMs }, 'Drain timeout reached');
        }
      }),
    ]);
  }

  return { start, stop };
}
