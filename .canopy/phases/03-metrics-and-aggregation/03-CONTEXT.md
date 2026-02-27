# Phase 3: Metrics and Aggregation - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Collect all per-turn performance data, aggregate it into percentiles and rates, and produce a console summary report at test completion. No UI, no persistence, no charts — just accurate numbers computed from measured data and printed to the terminal. Phase 4 will consume these metrics for the dashboard.

</domain>

<decisions>
## Implementation Decisions

### Summary report format
- Print a structured console summary at test completion using the existing pino logger for consistency
- Section layout: Latency Percentiles → Throughput → Token Usage → Error Breakdown → Per-Conversation Detail
- Latency percentiles displayed as a compact table: `p50: 210ms | p95: 890ms | p99: 1240ms`
- Throughput shown as `requests/sec` and `tokens/sec` with total counts
- Error breakdown as counts by type: `rate_limited: 3 | server_error: 1 | client_error: 0 | timeout: 0`
- Per-conversation latency arrays printed to show per-turn growth (e.g., `conv-1: [210, 340, 890, 1240]ms`)
- No color codes or fancy formatting — keep it parseable and clean for CI pipelines

### Aggregation approach
- Event-driven collection: subscribe to existing `conversation:turn:complete` and `api:error` events via the typed `eventBus`
- Store all raw measurements in memory during the test run (arrays of latency, token counts, error events)
- Compute aggregates (percentiles, rates) at test completion — not rolling windows
- Percentile calculation: sort-based approach (no streaming approximation needed — dataset is small enough for exact computation)
- Throughput: total requests / total wall-clock time, total tokens / total wall-clock time

### Token growth visibility
- Track `prompt_tokens` and `completion_tokens` separately per turn per conversation
- Display per-conversation token arrays showing turn-by-turn growth: `conv-1 tokens: [120/50, 250/55, 510/60, 1030/65]` (prompt/completion)
- The quadratic growth of prompt tokens becomes visible in the array pattern — each prompt roughly doubles as context accumulates
- Include total token count at the bottom of the summary

### Metrics architecture
- Single `MetricsCollector` class that subscribes to events and stores raw data
- Expose a `getSummary()` method that computes and returns all aggregates as a typed object
- Summary object typed as an interface (e.g., `TestSummary`) so Phase 4 can consume it directly via import
- Emit a `metrics:summary` event with the full summary object when the test completes — Phase 4's SSE layer can listen for this
- Store per-turn data indexed by `conversationId` and `turnNumber` for drill-down capability

### Claude's Discretion
- Exact percentile calculation algorithm (sort-based interpolation method)
- Internal data structure shape for raw metric storage
- Whether to use a separate module for percentile math or inline it
- Log level choices for metric collection events (debug vs info)
- Exact formatting of the summary output (column widths, alignment)

</decisions>

<specifics>
## Specific Ideas

- The summary should work in CI: no interactive elements, no ANSI colors, clean structured output that can be piped or redirected
- Token arrays should make quadratic growth obvious at a glance — this is the core insight of the stress test
- Keep the MetricsCollector decoupled from the conversation engine — it should only listen to events, never import from conversation modules
- The `TestSummary` interface is the handoff contract to Phase 4 — design it to be SSE-friendly (serializable, no circular refs)

</specifics>

<deferred>
## Deferred Ideas

- JSON/CSV export of results — v2 requirements (EXPO-01, EXPO-02)
- Historical run comparison — out of scope
- Context window growth chart (tokens vs latency per turn) — Phase 4 visualization (VISU-01)
- Streaming time-to-first-token measurement — v2 (ADVN-01)

</deferred>

---

*Phase: 03-metrics-and-aggregation*
*Context gathered: 2026-02-26*
