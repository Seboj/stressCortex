/**
 * SseBridge — subscribes to the event bus and batches updates to SSE clients.
 *
 * Architecture:
 *   eventBus → SseBridge.queue → flush() every 200ms → connected SSE clients
 *
 * Batching at 200ms prevents overwhelming the browser with individual events
 * during high-concurrency test runs. The dashboard receives arrays of events
 * per SSE message, not one event per message.
 *
 * Each SSE message format:
 *   data: [{"type":"conversation:turn:complete",...},{"type":"test:lifecycle",...}]\n\n
 *
 * Note on event shape: some event types (TestLifecycleEvent, ApiErrorEvent) have their own
 * `type` field with different semantics. These are preserved as `lifecycleType` and `errorType`
 * respectively, while `type` is always the SSE event discriminator.
 */

import { eventBus } from '../core/event-bus.js';
import type { ServerResponse, IncomingMessage } from 'http';
import type {
  ConversationStartEvent,
  ConversationTurnCompleteEvent,
  ConversationCompleteEvent,
  TestLifecycleEvent,
  MetricsSummaryEvent,
  ApiErrorEvent,
} from '../types/events.js';

type SseEvent = { type: string; [key: string]: unknown };

export class SseBridge {
  private clients = new Set<ServerResponse<IncomingMessage>>();
  private queue: SseEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  // Bound handlers for cleanup via off()
  private handleConversationStart: (evt: ConversationStartEvent) => void;
  private handleTurnComplete: (evt: ConversationTurnCompleteEvent) => void;
  private handleConversationComplete: (evt: ConversationCompleteEvent) => void;
  private handleLifecycle: (evt: TestLifecycleEvent) => void;
  private handleMetricsSummary: (evt: MetricsSummaryEvent) => void;
  private handleApiError: (evt: ApiErrorEvent) => void;

  constructor() {
    // Bind all handlers so we can cleanly remove them in destroy()
    // For events with their own 'type' field, rename to avoid collision with SSE discriminator

    this.handleConversationStart = (evt: ConversationStartEvent) =>
      this.queue.push({ type: 'conversation:start', ...evt });

    this.handleTurnComplete = (evt: ConversationTurnCompleteEvent) =>
      this.queue.push({ type: 'conversation:turn:complete', ...evt });

    this.handleConversationComplete = (evt: ConversationCompleteEvent) =>
      this.queue.push({ type: 'conversation:complete', ...evt });

    // TestLifecycleEvent has its own 'type' field (lifecycle state) — rename to 'lifecycleType'
    this.handleLifecycle = (evt: TestLifecycleEvent) => {
      const { type: lifecycleType, ...rest } = evt;
      this.queue.push({ type: 'test:lifecycle', lifecycleType, ...rest });
    };

    this.handleMetricsSummary = (evt: MetricsSummaryEvent) =>
      this.queue.push({ type: 'metrics:summary', ...evt });

    // ApiErrorEvent has its own 'type' field (error classification) — rename to 'errorType'
    this.handleApiError = (evt: ApiErrorEvent) => {
      const { type: errorType, ...rest } = evt;
      this.queue.push({ type: 'api:error', errorType, ...rest });
    };
  }

  /**
   * Subscribe to event bus and start the 200ms batch flush interval.
   * Call once at server startup.
   */
  start(): void {
    eventBus.on('conversation:start', this.handleConversationStart);
    eventBus.on('conversation:turn:complete', this.handleTurnComplete);
    eventBus.on('conversation:complete', this.handleConversationComplete);
    eventBus.on('test:lifecycle', this.handleLifecycle);
    eventBus.on('metrics:summary', this.handleMetricsSummary);
    eventBus.on('api:error', this.handleApiError);

    this.flushInterval = setInterval(() => {
      this.flush();
    }, 200);
  }

  /**
   * Add a new SSE client response stream.
   * Automatically removes itself when the connection closes.
   */
  addClient(res: ServerResponse<IncomingMessage>): void {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  /**
   * Flush queued events to all connected clients atomically.
   * Skips if queue is empty or no clients connected.
   */
  private flush(): void {
    if (this.queue.length === 0 || this.clients.size === 0) {
      return;
    }

    // Drain queue atomically — prevents events added during iteration from being flushed twice
    const batch = this.queue.splice(0);
    const payload = 'data: ' + JSON.stringify(batch) + '\n\n';

    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        // Client disconnected mid-write — remove from set
        this.clients.delete(client);
      }
    }
  }

  /**
   * Stop the flush interval.
   * Events stop being sent but subscriptions remain (use destroy() for full cleanup).
   */
  stop(): void {
    if (this.flushInterval !== null) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Full cleanup: stop interval and remove all event bus subscriptions.
   * Call on server shutdown.
   */
  destroy(): void {
    this.stop();
    eventBus.off('conversation:start', this.handleConversationStart);
    eventBus.off('conversation:turn:complete', this.handleTurnComplete);
    eventBus.off('conversation:complete', this.handleConversationComplete);
    eventBus.off('test:lifecycle', this.handleLifecycle);
    eventBus.off('metrics:summary', this.handleMetricsSummary);
    eventBus.off('api:error', this.handleApiError);
  }
}

/** Singleton SseBridge instance — used by entry point and SSE route */
export const sseBridge = new SseBridge();
