/**
 * LLM prompt builder and response parser for PDF report generation.
 *
 * Formats a TestSummary into a readable prompt, asks the LLM for structured
 * JSON analysis, and parses the response with graceful fallback.
 */

import type { TestSummary } from '../types/metrics.js';

export interface ReportAnalysis {
  executiveSummary: string;
  performanceAnalysis: string;
  latencyTrends: string;
  tokenGrowth: string;
  errorAnalysis: string;
  recommendations: string;
}

const FALLBACK_ANALYSIS: ReportAnalysis = {
  executiveSummary: 'Analysis could not be generated. Review the metrics below for details.',
  performanceAnalysis: 'See key metrics table for performance data.',
  latencyTrends: 'See latency percentiles for trend data.',
  tokenGrowth: 'See token usage table for growth data.',
  errorAnalysis: 'See error breakdown for details.',
  recommendations: 'Review the raw metrics to identify areas for improvement.',
};

/**
 * Build a prompt that asks the LLM to analyze the test summary
 * and return structured JSON with 6 narrative sections.
 */
export function buildReportPrompt(summary: TestSummary): string {
  const durationSec = (summary.durationMs / 1000).toFixed(1);
  const errorRate = summary.throughput.totalRequests > 0
    ? ((summary.totalErrors / summary.throughput.totalRequests) * 100).toFixed(1)
    : '0.0';

  const errorBreakdownLines = Object.entries(summary.errorBreakdown)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `  - ${type}: ${count}`)
    .join('\n') || '  (none)';

  const perConvLatencyLines = summary.perConversationLatency
    .slice(0, 20)
    .map((c) => {
      const avg = c.latencies.length > 0
        ? (c.latencies.reduce((a, b) => a + b, 0) / c.latencies.length).toFixed(0)
        : 'N/A';
      return `  Conv ${c.conversationId}: avg ${avg}ms over ${c.latencies.length} turns`;
    })
    .join('\n');

  const perConvTokenLines = summary.perConversationTokens
    .slice(0, 20)
    .map((c) => {
      const totalP = c.turns.reduce((a, t) => a + t.promptTokens, 0);
      const totalC = c.turns.reduce((a, t) => a + t.completionTokens, 0);
      return `  Conv ${c.conversationId}: ${totalP} prompt + ${totalC} completion = ${totalP + totalC} total tokens over ${c.turns.length} turns`;
    })
    .join('\n');

  return `You are a performance engineering analyst. Analyze the following stress test results from a Cortex LLM API load test and provide a professional report.

TEST RESULTS:
- Duration: ${durationSec}s
- Conversations: ${summary.conversationsTotal} total, ${summary.conversationsCompleted} completed, ${summary.conversationsErrored} errored
- Throughput: ${summary.throughput.requestsPerSecond.toFixed(2)} req/s, ${summary.throughput.tokensPerSecond.toFixed(0)} tokens/s
- Total requests: ${summary.throughput.totalRequests}
- Total tokens: ${summary.totalPromptTokens} prompt + ${summary.totalCompletionTokens} completion = ${summary.totalPromptTokens + summary.totalCompletionTokens} total

LATENCY PERCENTILES:
- P50: ${summary.latencyPercentiles.p50.toFixed(0)}ms
- P95: ${summary.latencyPercentiles.p95.toFixed(0)}ms
- P99: ${summary.latencyPercentiles.p99.toFixed(0)}ms

PER-CONVERSATION LATENCY:
${perConvLatencyLines}

PER-CONVERSATION TOKEN USAGE:
${perConvTokenLines}

ERROR BREAKDOWN:
- Total errors: ${summary.totalErrors} (${errorRate}% error rate)
${errorBreakdownLines}

Respond with ONLY a JSON object (no markdown fences, no extra text) with these 6 keys, each containing 2-4 sentences of professional analysis:

{
  "executiveSummary": "High-level overview of test results and system health",
  "performanceAnalysis": "Analysis of throughput, request rates, and overall capacity",
  "latencyTrends": "Analysis of latency percentiles and per-conversation patterns",
  "tokenGrowth": "Analysis of token usage patterns across conversations",
  "errorAnalysis": "Analysis of error types, rates, and potential causes",
  "recommendations": "Actionable recommendations for improving performance"
}`;
}

/**
 * Parse the LLM response into a ReportAnalysis.
 * Strips markdown fences if present, falls back gracefully on parse failure.
 */
export function parseReportResponse(content: string): ReportAnalysis {
  try {
    // Strip markdown code fences if the LLM wrapped the response
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    return {
      executiveSummary: typeof parsed.executiveSummary === 'string'
        ? parsed.executiveSummary : FALLBACK_ANALYSIS.executiveSummary,
      performanceAnalysis: typeof parsed.performanceAnalysis === 'string'
        ? parsed.performanceAnalysis : FALLBACK_ANALYSIS.performanceAnalysis,
      latencyTrends: typeof parsed.latencyTrends === 'string'
        ? parsed.latencyTrends : FALLBACK_ANALYSIS.latencyTrends,
      tokenGrowth: typeof parsed.tokenGrowth === 'string'
        ? parsed.tokenGrowth : FALLBACK_ANALYSIS.tokenGrowth,
      errorAnalysis: typeof parsed.errorAnalysis === 'string'
        ? parsed.errorAnalysis : FALLBACK_ANALYSIS.errorAnalysis,
      recommendations: typeof parsed.recommendations === 'string'
        ? parsed.recommendations : FALLBACK_ANALYSIS.recommendations,
    };
  } catch {
    // If JSON parsing fails entirely, try to use the raw text as executive summary
    if (content.trim().length > 0) {
      return {
        ...FALLBACK_ANALYSIS,
        executiveSummary: content.trim().slice(0, 500),
      };
    }
    return FALLBACK_ANALYSIS;
  }
}
