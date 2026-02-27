/**
 * TestController — wraps ConversationManager and MetricsCollector for server-driven test runs.
 *
 * Allows starting and stopping load tests via REST API without restarting the process.
 * Enforces single-run semantics: only one test can run at a time.
 *
 * Lifecycle:
 *   idle → start() → running → (test completes) → idle
 *   idle → start() → running → stop() → stopping → idle
 */

import { createConversationManager } from '../conversation/index.js';
import { MetricsCollector } from '../metrics/index.js';
import { validateConfig } from '../core/config.js';
import { createCortexClient } from '../api/client.js';
import { eventBus } from '../core/event-bus.js';
import { logger } from '../core/logger.js';
import type { CortexResponse } from '../types/api.js';

export type ControllerStatus = 'idle' | 'running' | 'stopping';

export class TestController {
  private status: ControllerStatus = 'idle';
  private manager: ReturnType<typeof createConversationManager> | null = null;
  private collector: MetricsCollector | null = null;

  /** Returns the current lifecycle status. */
  getStatus(): ControllerStatus {
    return this.status;
  }

  /**
   * Start a test run with the given parameters.
   * Throws if a test is already running or stopping.
   * Returns 202-style immediately — the test runs in background.
   */
  async start(params: {
    numConversations: number;
    turnsPerConversation: number;
    concurrency: number;
  }): Promise<void> {
    if (this.status !== 'idle') {
      throw new Error(`Cannot start test: current status is '${this.status}'`);
    }

    this.status = 'running';

    // Create fresh collector and manager for each test run
    this.collector = new MetricsCollector();

    const config = validateConfig();
    const cortex = createCortexClient(config);

    // Type cast: ConversationRunner builds messages as {role, content} which is a subset
    // of OpenAI's ChatCompletionMessageParam. The cast is safe because the runner
    // only sends valid role+content messages.
    this.manager = createConversationManager({
      numConversations: params.numConversations,
      turnsPerConversation: params.turnsPerConversation,
      makeRequest: cortex.makeRequest as unknown as (
        messages: Array<{ role: string; content: string }>,
      ) => Promise<CortexResponse>,
    });

    // Fire-and-forget: start() resolves immediately; test runs in background
    void this.manager
      .start()
      .then(() => {
        // Test completed — collect metrics, emit summary, clean up
        if (this.collector) {
          const summary = this.collector.getSummary();
          eventBus.emit('metrics:summary', {
            summary,
            timestamp: Date.now(),
          });
          this.collector.destroy();
          this.collector = null;
        }
        this.manager = null;
        this.status = 'idle';
        logger.info({ event: 'test_complete' }, 'Test run completed');
      })
      .catch((error: unknown) => {
        logger.error(
          { event: 'test_error', message: error instanceof Error ? error.message : String(error) },
          'Test run failed unexpectedly',
        );
        if (this.collector) {
          this.collector.destroy();
          this.collector = null;
        }
        this.manager = null;
        this.status = 'idle';
      });
  }

  /**
   * Stop a running test gracefully.
   * If no test is running, returns silently.
   */
  async stop(): Promise<void> {
    if (this.status !== 'running' || !this.manager) {
      return;
    }
    this.status = 'stopping';
    await this.manager.stop();
  }
}

/** Singleton TestController instance — used by REST routes */
export const testController = new TestController();
