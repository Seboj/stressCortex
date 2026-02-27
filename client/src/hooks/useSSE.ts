import { useEffect } from 'react';
import { useTestStore } from '../store/useTestStore';
import type { LatencyPoint, TokenPoint } from '../store/useTestStore';

// Module-level accumulators — reset when a new test starts
let allLatencies: number[] = [];
let totalPrompt = 0;
let totalCompletion = 0;
let sequenceCounter = 0;

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function resetAccumulators(): void {
  allLatencies = [];
  totalPrompt = 0;
  totalCompletion = 0;
  sequenceCounter = 0;
}

// SSE batch event — the server spreads event data over { type: 'eventName', ...eventData }
// For events whose data also has a 'type' field (TestLifecycleEvent, ApiErrorEvent),
// the data's type field OVERRIDES the wrapper type in the JSON object.
// So TestLifecycleEvent { type: 'starting' } arrives as { type: 'starting', ... }
// and ApiErrorEvent { type: 'rate_limited' } arrives as { type: 'rate_limited', ... }
type SseEvent = { type: string } & Record<string, unknown>;

// Error types from server src/types/api.ts
const ERROR_TYPES = new Set(['rate_limited', 'server_error', 'client_error', 'timeout']);

// Test lifecycle types from server src/types/events.ts
const LIFECYCLE_TYPES = new Set(['starting', 'running', 'stopping', 'draining', 'stopped']);

export function useSSE(): void {
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect(): void {
      es = new EventSource('/api/events');

      es.onmessage = (evt) => {
        let batch: SseEvent[];
        try {
          batch = JSON.parse(evt.data as string) as SseEvent[];
        } catch {
          return;
        }

        const store = useTestStore.getState();

        for (const event of batch) {
          const type = event.type;

          // Test lifecycle events — TestLifecycleEvent.type overrides 'test:lifecycle' wrapper
          if (LIFECYCLE_TYPES.has(type)) {
            if (type === 'starting') {
              resetAccumulators();
              store.reset();
              store.setTestStatus('running');
            } else if (type === 'running') {
              store.setTestStatus('running');
            } else if (type === 'stopping' || type === 'draining') {
              store.setTestStatus('stopping');
            } else if (type === 'stopped') {
              store.setTestStatus('stopped');
            }
            continue;
          }

          // API error events — ApiErrorEvent.type overrides 'api:error' wrapper
          if (ERROR_TYPES.has(type)) {
            store.incrementError(type);
            continue;
          }

          // Named conversation and metrics events
          switch (type) {
            case 'conversation:start': {
              store.upsertConversation({
                conversationId: event.conversationId as number,
                status: 'active',
                turnsTotal: event.turnsTotal as number,
                currentTurn: 0,
              });
              break;
            }

            case 'conversation:turn:complete': {
              const conversationId = event.conversationId as number;
              const turnNumber = event.turnNumber as number;
              const latencyMs = event.latencyMs as number;
              const promptTokens = event.promptTokens as number;
              const completionTokens = event.completionTokens as number;

              // Update conversation row with cumulative tokens
              const existing = store.conversations.get(conversationId);
              const existingTokens = existing?.totalTokens ?? 0;
              store.upsertConversation({
                conversationId,
                status: 'active',
                currentTurn: turnNumber,
                lastLatencyMs: latencyMs,
                totalTokens: existingTokens + promptTokens + completionTokens,
              });

              // Accumulate latency and compute running percentiles
              allLatencies.push(latencyMs);
              const sorted = [...allLatencies].sort((a, b) => a - b);
              sequenceCounter += 1;
              const latencyPoint: LatencyPoint = {
                time: sequenceCounter,
                p50: computePercentile(sorted, 50),
                p95: computePercentile(sorted, 95),
                p99: computePercentile(sorted, 99),
              };
              store.addLatencyPoint(latencyPoint);

              // Accumulate token totals for chart
              totalPrompt += promptTokens;
              totalCompletion += completionTokens;
              const tokenPoint: TokenPoint = {
                time: sequenceCounter,
                promptTokens: totalPrompt,
                completionTokens: totalCompletion,
              };
              store.addTokenPoint(tokenPoint);
              break;
            }

            case 'conversation:complete': {
              store.upsertConversation({
                conversationId: event.conversationId as number,
                status: event.status === 'completed' ? 'completed' : 'errored',
              });
              break;
            }

            case 'metrics:summary': {
              store.setSummary(event.summary);
              break;
            }

            default:
              // Unknown event type — ignore
              break;
          }
        }
      };

      es.onerror = () => {
        if (closed) return;
        es?.close();
        reconnectTimer = setTimeout(() => {
          if (!closed) connect();
        }, 2000);
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);
}
