/**
 * Metric types for latency and token tracking.
 * These will be expanded in Phase 3 (Metrics and Aggregation).
 */

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
