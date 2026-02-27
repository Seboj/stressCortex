/**
 * Cortex API client with full instrumentation.
 * - Latency measurement with performance.now()
 * - Token parsing from usage field
 * - Error classification via classifyError()
 * - Event bus emissions for all API interactions
 * - Structured pino logging
 */

import OpenAI from 'openai';
import { performance } from 'perf_hooks';
import { eventBus } from '../core/event-bus.js';
import { logger } from '../core/logger.js';
import { classifyError } from './errors.js';
import type { AppConfig, CortexResponse, ClassifiedError } from '../types/api.js';

/**
 * Create an instrumented Cortex API client.
 * Returns an object with makeRequest bound to the given config.
 */
export function createCortexClient(config: AppConfig) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 0, // CRITICAL: disable auto-retry so we classify errors ourselves
    timeout: 30_000, // 30s timeout
  });

  /**
   * Make an instrumented API request to Cortex.
   *
   * 1. Emits api:request event before the call
   * 2. Measures latency with performance.now()
   * 3. Parses usage.prompt_tokens and usage.completion_tokens
   * 4. Emits api:response event on success
   * 5. Classifies and emits api:error on failure
   * 6. Logs everything with pino
   */
  async function makeRequest(
    messages: OpenAI.ChatCompletionMessageParam[],
  ): Promise<CortexResponse> {
    // Emit request event
    eventBus.emit('api:request', {
      model: config.model,
      messageCount: messages.length,
      timestamp: Date.now(),
    });

    // Capture start time IMMEDIATELY before API call
    const startMs = performance.now();

    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages,
      });

      // Capture end time IMMEDIATELY after response (before any processing)
      const latencyMs = Math.round((performance.now() - startMs) * 100) / 100;

      const usage = response.usage;
      const promptTokens = usage?.prompt_tokens ?? 0;
      const completionTokens = usage?.completion_tokens ?? 0;
      const content = response.choices[0]?.message?.content ?? '';
      const model = response.model;

      const result: CortexResponse = {
        content,
        model,
        promptTokens,
        completionTokens,
        latencyMs,
      };

      // Emit response event
      eventBus.emit('api:response', {
        latencyMs,
        promptTokens,
        completionTokens,
        model,
        content,
      });

      // Log structured response
      logger.info({
        event: 'api_response',
        latencyMs,
        promptTokens,
        completionTokens,
        model,
      });

      return result;
    } catch (error) {
      // Capture latency even on error
      const latencyMs = Math.round((performance.now() - startMs) * 100) / 100;

      // Classify the error
      const classified: ClassifiedError = classifyError(error);

      // Emit error event
      eventBus.emit('api:error', {
        type: classified.type,
        statusCode: classified.statusCode,
        retryAfterMs: classified.retryAfterMs,
        message: classified.message,
        latencyMs,
      });

      // Log structured error
      logger.warn({
        event: 'api_error',
        errorType: classified.type,
        statusCode: classified.statusCode,
        retryAfterMs: classified.retryAfterMs,
        latencyMs,
        message: classified.message,
      });

      // Re-throw classified error — caller decides retry strategy
      throw classified;
    }
  }

  return { makeRequest };
}
