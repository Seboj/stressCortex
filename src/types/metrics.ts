/**
 * Metric types for latency, token tracking, and test summaries.
 * Phase 1: LatencyMetric, TokenUsage
 * Phase 3: LatencyPercentiles, ThroughputMetrics, TurnTokens,
 *           PerConversationLatency, PerConversationTokens, TestSummary
 */

import type { ErrorType } from './api.js';

/** A single latency measurement with timestamp */
export interface LatencyMetric {
  latencyMs: number;
  timestamp: number;
}

/** Token usage from a single API call */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

// ── Phase 3: Aggregation Types ──────────────────────────────────────

/** Latency percentiles computed from all turn measurements */
export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

/** Throughput metrics derived from measured data */
export interface ThroughputMetrics {
  requestsPerSecond: number;
  tokensPerSecond: number;
  totalRequests: number;
  totalTokens: number;
  durationMs: number;
}

/** Token usage for a single turn */
export interface TurnTokens {
  turnNumber: number;
  promptTokens: number;
  completionTokens: number;
}

/** Per-conversation latency array */
export interface PerConversationLatency {
  conversationId: number;
  latencies: number[];
}

/** Per-conversation token tracking */
export interface PerConversationTokens {
  conversationId: number;
  turns: TurnTokens[];
}

/** Complete test summary — Phase 4 handoff contract. JSON-serializable. */
export interface TestSummary {
  latencyPercentiles: LatencyPercentiles;
  perConversationLatency: PerConversationLatency[];
  throughput: ThroughputMetrics;
  errorBreakdown: Record<ErrorType, number>;
  totalErrors: number;
  perConversationTokens: PerConversationTokens[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  conversationsTotal: number;
  conversationsCompleted: number;
  conversationsErrored: number;
}
