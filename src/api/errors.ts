/**
 * Error classification for Cortex API responses.
 * Classifies errors into four types: rate_limited, server_error, client_error, timeout.
 * Parses Retry-After headers for rate limit backoff.
 *
 * Uses duck-typing (checking .status property) rather than instanceof checks
 * to support both OpenAI SDK errors and Cortex-specific errors.
 */

import type { ClassifiedError } from '../types/api.js';

/** Shape of an API error with status and headers (matches OpenAI SDK error classes) */
interface ApiErrorLike {
  status?: number;
  message: string;
  headers?: Record<string, string>;
  name?: string;
}

/**
 * Check if an error looks like an API error (has status and message).
 */
function isApiErrorLike(error: unknown): error is ApiErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiErrorLike).message === 'string'
  );
}

/**
 * Classify an API error into one of four types.
 *
 * Classification priority:
 * 1. API errors with status codes (429, 5xx, 4xx)
 * 2. Connection errors (APIConnectionError name)
 * 3. Timeout patterns in error messages
 * 4. Fallback: client_error
 */
export function classifyError(error: unknown): ClassifiedError {
  // Handle API errors with status codes
  if (isApiErrorLike(error) && typeof error.status === 'number') {
    const status = error.status;

    if (status === 429) {
      const retryAfterMs = parseRetryAfter(error.headers?.['retry-after'] ?? null);
      return {
        type: 'rate_limited',
        statusCode: status,
        retryAfterMs,
        message: error.message,
      };
    }

    if (status >= 500) {
      return {
        type: 'server_error',
        statusCode: status,
        message: error.message,
      };
    }

    // All other status codes (4xx, etc.)
    return {
      type: 'client_error',
      statusCode: status,
      message: error.message,
    };
  }

  // Handle connection errors (APIConnectionError from OpenAI SDK)
  if (isApiErrorLike(error) && error.name === 'APIConnectionError') {
    return {
      type: 'timeout',
      message: error.message,
    };
  }

  // Handle timeout patterns in error messages
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('timeout') ||
      msg.includes('etimedout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset')
    ) {
      return {
        type: 'timeout',
        message: error.message,
      };
    }

    return {
      type: 'client_error',
      message: error.message,
    };
  }

  // Fallback for non-Error values
  return {
    type: 'client_error',
    message: String(error),
  };
}

/**
 * Parse a Retry-After header value to milliseconds.
 *
 * Supports:
 * - Seconds: "5" -> 5000
 * - HTTP-date: "Thu, 01 Jan 2099 00:00:00 GMT" -> ms from now
 * - null/undefined: returns undefined
 * - Invalid: returns 1000 (1 second fallback)
 */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }

  if (value === '') {
    return 1000; // Fallback for empty string
  }

  // Try parsing as seconds (integer or float)
  const seconds = Number(value);
  if (!isNaN(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  // Try parsing as HTTP-date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const msFromNow = date.getTime() - Date.now();
    return Math.max(0, Math.round(msFromNow));
  }

  // Fallback for unrecognized format
  return 1000;
}
