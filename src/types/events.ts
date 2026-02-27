/**
 * Typed event definitions for the EventEmitter bus.
 * Maps event names to their argument tuples for compile-time safety.
 */

import type { ErrorType } from './api.js';

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

/**
 * Event map for the typed EventEmitter bus.
 * Each key is an event name, each value is the argument tuple.
 * Phase 1 events: api:request, api:response, api:error
 * Additional events will be added in Phase 2+ (conversation, test lifecycle).
 */
export interface EventMap {
  'api:request': [ApiRequestEvent];
  'api:response': [ApiResponseEvent];
  'api:error': [ApiErrorEvent];
}
