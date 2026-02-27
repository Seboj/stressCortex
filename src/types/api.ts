/**
 * API types — error classification, request/response contracts.
 * These types are the foundation for all API interactions with Cortex.
 */

/** Four distinct error classifications for API failures */
export type ErrorType = 'rate_limited' | 'server_error' | 'client_error' | 'timeout';

/** Classified error with optional retry metadata */
export interface ClassifiedError {
  type: ErrorType;
  statusCode?: number;
  retryAfterMs?: number;
  message: string;
}

/** Successful Cortex API response with instrumentation data */
export interface CortexResponse {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

/** Application configuration derived from environment */
export interface AppConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}
