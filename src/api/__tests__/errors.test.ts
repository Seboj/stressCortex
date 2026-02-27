/**
 * TDD tests for error classification and Retry-After parsing.
 * RED phase: these tests must fail before implementation exists.
 */

import { classifyError, parseRetryAfter } from '../errors.js';
import type { ClassifiedError } from '../../types/api.js';

// Mock structures matching OpenAI SDK error shapes (duck typing)
function createAPIError(status: number, message: string, headers?: Record<string, string>) {
  return {
    status,
    message,
    headers: headers ?? {},
    name: 'APIError',
  };
}

function createConnectionError(message: string) {
  return {
    status: undefined,
    message,
    headers: {},
    name: 'APIConnectionError',
  };
}

describe('classifyError', () => {
  describe('rate_limited (429)', () => {
    it('should classify 429 as rate_limited', () => {
      const error = createAPIError(429, 'Rate limit exceeded');
      const result = classifyError(error);
      expect(result.type).toBe('rate_limited');
      expect(result.statusCode).toBe(429);
    });

    it('should parse Retry-After header from 429 error', () => {
      const error = createAPIError(429, 'Rate limit exceeded', { 'retry-after': '5' });
      const result = classifyError(error);
      expect(result.type).toBe('rate_limited');
      expect(result.retryAfterMs).toBe(5000);
    });

    it('should handle 429 without Retry-After header', () => {
      const error = createAPIError(429, 'Rate limit exceeded');
      const result = classifyError(error);
      expect(result.type).toBe('rate_limited');
      expect(result.retryAfterMs).toBeUndefined();
    });
  });

  describe('server_error (5xx)', () => {
    it('should classify 500 as server_error', () => {
      const error = createAPIError(500, 'Internal server error');
      const result = classifyError(error);
      expect(result.type).toBe('server_error');
      expect(result.statusCode).toBe(500);
    });

    it('should classify 502 as server_error', () => {
      const error = createAPIError(502, 'Bad gateway');
      const result = classifyError(error);
      expect(result.type).toBe('server_error');
      expect(result.statusCode).toBe(502);
    });

    it('should classify 503 as server_error', () => {
      const error = createAPIError(503, 'Service unavailable');
      const result = classifyError(error);
      expect(result.type).toBe('server_error');
      expect(result.statusCode).toBe(503);
    });
  });

  describe('client_error (4xx)', () => {
    it('should classify 400 as client_error', () => {
      const error = createAPIError(400, 'Bad request');
      const result = classifyError(error);
      expect(result.type).toBe('client_error');
      expect(result.statusCode).toBe(400);
    });

    it('should classify 401 as client_error', () => {
      const error = createAPIError(401, 'Unauthorized');
      const result = classifyError(error);
      expect(result.type).toBe('client_error');
      expect(result.statusCode).toBe(401);
    });

    it('should classify 403 as client_error', () => {
      const error = createAPIError(403, 'Forbidden');
      const result = classifyError(error);
      expect(result.type).toBe('client_error');
      expect(result.statusCode).toBe(403);
    });
  });

  describe('timeout', () => {
    it('should classify APIConnectionError as timeout', () => {
      const error = createConnectionError('Connection timed out');
      const result = classifyError(error);
      expect(result.type).toBe('timeout');
    });

    it('should classify error with "timeout" in message as timeout', () => {
      const error = new Error('Request timeout after 30000ms');
      const result = classifyError(error);
      expect(result.type).toBe('timeout');
    });

    it('should classify error with "ETIMEDOUT" in message as timeout', () => {
      const error = new Error('connect ETIMEDOUT 1.2.3.4:443');
      const result = classifyError(error);
      expect(result.type).toBe('timeout');
    });

    it('should classify error with "ECONNREFUSED" in message as timeout', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:443');
      const result = classifyError(error);
      expect(result.type).toBe('timeout');
    });
  });

  describe('unknown errors', () => {
    it('should classify unknown error as client_error', () => {
      const result = classifyError('some string error');
      expect(result.type).toBe('client_error');
      expect(result.message).toBe('some string error');
    });

    it('should classify generic Error without timeout as client_error', () => {
      const error = new Error('Something went wrong');
      const result = classifyError(error);
      expect(result.type).toBe('client_error');
    });
  });

  describe('result shape', () => {
    it('should always return a ClassifiedError with required fields', () => {
      const result = classifyError(new Error('test'));
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('message');
      expect(typeof result.type).toBe('string');
      expect(typeof result.message).toBe('string');
    });
  });
});

describe('parseRetryAfter', () => {
  it('should parse seconds string to milliseconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
  });

  it('should parse large seconds value', () => {
    expect(parseRetryAfter('120')).toBe(120000);
  });

  it('should parse "0" as 0ms', () => {
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('should return undefined for null', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('should return undefined for undefined', () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });

  it('should return fallback 1000ms for invalid string', () => {
    expect(parseRetryAfter('invalid')).toBe(1000);
  });

  it('should return fallback 1000ms for empty string', () => {
    expect(parseRetryAfter('')).toBe(1000);
  });

  it('should parse HTTP-date format to milliseconds from now', () => {
    // Future date should return positive milliseconds
    const futureDate = new Date(Date.now() + 60000).toUTCString();
    const result = parseRetryAfter(futureDate);
    expect(result).toBeDefined();
    expect(result!).toBeGreaterThan(0);
    expect(result!).toBeLessThanOrEqual(61000); // Allow some tolerance
  });

  it('should return 0 for past HTTP-date', () => {
    const pastDate = new Date(Date.now() - 60000).toUTCString();
    const result = parseRetryAfter(pastDate);
    expect(result).toBe(0);
  });
});
