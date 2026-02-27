/**
 * Typed event definitions for the EventEmitter bus.
 * Maps event names to their argument tuples for compile-time safety.
 *
 * Phase 1: api:request, api:response, api:error
 * Phase 2: conversation:start, conversation:turn:complete, conversation:complete, test:lifecycle
 * Phase 3: metrics:summary
 */

import type { ErrorType } from './api.js';
import type { TestSummary } from './metrics.js';

// ── Phase 1: API Events ──────────────────────────────────────────────

/** Emitted before an API request is made */
export interface ApiRequestEvent {
  model: string;
  messageCount: number;
  timestamp: number;
}

/** Emitted after a successful API response */
export interface ApiResponseEvent {
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
  content: string;
}

/** Emitted when an API call fails */
export interface ApiErrorEvent {
  type: ErrorType;
  statusCode?: number;
  retryAfterMs?: number;
  message: string;
  latencyMs: number;
}

// ── Phase 2: Conversation Events ─────────────────────────────────────

/** Emitted when a conversation begins */
export interface ConversationStartEvent {
  conversationId: number;
  turnsTotal: number;
  timestamp: number;
}

/** Emitted after each turn (API call) in a conversation */
export interface ConversationTurnCompleteEvent {
  conversationId: number;
  turnNumber: number;
  turnsTotal: number;
  role: 'doctor' | 'patient';
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  messageCount: number;
  timestamp: number;
}

/** Emitted when a conversation finishes (completed or errored) */
export interface ConversationCompleteEvent {
  conversationId: number;
  turnsCompleted: number;
  status: 'completed' | 'errored';
  errorMessage?: string;
  totalLatencyMs: number;
  timestamp: number;
}

// ── Phase 2: Test Lifecycle Events ───────────────────────────────────

/** Emitted at each stage of the test run lifecycle */
export interface TestLifecycleEvent {
  type: 'starting' | 'running' | 'stopping' | 'draining' | 'stopped';
  conversationsTotal: number;
  conversationsActive: number;
  timestamp: number;
}

// ── Phase 3: Metrics Events ─────────────────────────────────────────

/** Emitted when the test summary is computed at test completion */
export interface MetricsSummaryEvent {
  summary: TestSummary;
  timestamp: number;
}

// ── Event Map ────────────────────────────────────────────────────────

/**
 * Event map for the typed EventEmitter bus.
 * Each key is an event name, each value is the argument tuple.
 */
export interface EventMap {
  // Phase 1: API events
  'api:request': [ApiRequestEvent];
  'api:response': [ApiResponseEvent];
  'api:error': [ApiErrorEvent];

  // Phase 2: Conversation events
  'conversation:start': [ConversationStartEvent];
  'conversation:turn:complete': [ConversationTurnCompleteEvent];
  'conversation:complete': [ConversationCompleteEvent];

  // Phase 2: Test lifecycle events
  'test:lifecycle': [TestLifecycleEvent];

  // Phase 3: Metrics events
  'metrics:summary': [MetricsSummaryEvent];
}
