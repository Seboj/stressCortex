# Requirements: StressCortex

**Defined:** 2026-02-26
**Core Value:** Validate that the Cortex conversation API handles high concurrency with multi-turn, context-heavy conversations without degradation

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUN-01**: System uses TypeScript with strict types for all API contracts, events, and metrics
- [x] **FOUN-02**: System reads API key from `CORTEX_API_KEY` environment variable and fails fast with clear error if missing
- [x] **FOUN-03**: System emits typed events via EventEmitter bus for all conversation and metric updates

### API Client

- [x] **API-01**: User can make a single-turn chat completion request to Cortex `/v1/chat/completions` endpoint
- [x] **API-02**: System captures per-request latency using high-resolution timestamps (`performance.now()`)
- [x] **API-03**: System parses `usage.prompt_tokens` and `usage.completion_tokens` from each API response
- [x] **API-04**: System classifies errors into four types: `rate_limited` (429), `server_error` (5xx), `client_error` (4xx), `timeout`
- [x] **API-05**: System respects `Retry-After` header on 429 responses and backs off accordingly

### Conversation Engine

- [x] **CONV-01**: User can run multi-turn conversations where full message history is sent as JSON context each turn
- [x] **CONV-02**: System uses role-based system prompts — medical professional on one side, patient on the other
- [x] **CONV-03**: Medical professional initiates with "How are you feeling today?" and follows up based on patient responses
- [x] **CONV-04**: Each API response becomes the next turn's input message (self-talking loop)
- [x] **CONV-05**: User can configure number of turns per conversation (M)

### Concurrency

- [x] **CONC-01**: User can spin up N concurrent conversations simultaneously
- [x] **CONC-02**: System uses staggered ramp-up with jitter to avoid thundering-herd pattern at test start
- [x] **CONC-03**: One failed conversation does not kill others — errors are isolated per conversation
- [x] **CONC-04**: User can stop a running test gracefully (in-flight requests drain, no orphaned connections)

### Metrics

- [x] **METR-01**: System tracks per-turn latency for each conversation (latency array indexed by turn number)
- [x] **METR-02**: System calculates aggregate latency percentiles: p50, p95, p99
- [x] **METR-03**: System tracks throughput in requests/second and tokens/second
- [x] **METR-04**: System tracks error rates by error type (rate_limited, server_error, client_error, timeout)
- [x] **METR-05**: System tracks token usage per turn (prompt_tokens + completion_tokens) to reveal quadratic growth
- [x] **METR-06**: System produces a test completion summary report with all aggregate metrics

### Server

- [x] **SERV-01**: System runs a local Fastify server exposing REST API for test control (start/stop/status)
- [x] **SERV-02**: System exposes SSE endpoint (`GET /api/events`) pushing real-time metric updates to browser
- [x] **SERV-03**: Server batches SSE updates (100-250ms intervals) to prevent browser overload at high concurrency

### Dashboard

- [x] **DASH-01**: User can view a local web UI dashboard showing live test progress in real-time
- [x] **DASH-02**: Dashboard shows per-conversation status (active/completed/errored) with current turn number
- [x] **DASH-03**: Dashboard shows live latency chart (p50/p95/p99 over time)
- [x] **DASH-04**: Dashboard shows token usage chart (prompt + completion tokens over time)
- [x] **DASH-05**: Dashboard shows error rate and error type breakdown
- [x] **DASH-06**: User can configure test parameters in the UI (number of conversations, turns per conversation, concurrency level)
- [x] **DASH-07**: User can start and stop tests from the UI
- [x] **DASH-08**: Dashboard shows test completion summary after run finishes

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Configuration

- **CONF-01**: User can define test parameters in a JSON/YAML config file
- **CONF-02**: User can use named test presets ("smoke", "soak", "spike")
- **CONF-03**: User can configure inter-turn delay (think time) for realistic pacing

### Export

- **EXPO-01**: User can export test results to JSON file
- **EXPO-02**: User can export test results to CSV file

### Visualization

- **VISU-01**: Dashboard shows context window growth chart (tokens vs. latency per turn number)

### Advanced

- **ADVN-01**: System supports streaming responses with time-to-first-token (TTFT) measurement
- **ADVN-02**: User can replay recorded conversation transcripts instead of synthetic generation
- **ADVN-03**: User can define custom conversation scenarios (non-medical) via plugin system

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Persistent database / historical run storage | Local CLI tool — export to JSON for comparison |
| Authentication / user management | Single-user local tool by design |
| Testing non-`/v1/chat/completions` endpoints | Focused scope per project constraint |
| Automatic LLM response quality scoring | Load tester, not eval framework — log transcripts for manual review |
| Grafana / Prometheus integration | Adds infrastructure deps to local-only tool |
| Distributed multi-machine load generation | Node.js async handles LLM-scale concurrency on single machine |
| Interactive mid-test prompt editing | Introduces confounding variables; configure before run |
| Production deployment | Runs locally only |
| Mobile / responsive design | Local desktop browser tool |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUN-01 | Phase 1 | Complete |
| FOUN-02 | Phase 1 | Complete |
| FOUN-03 | Phase 1 | Complete |
| API-01 | Phase 1 | Complete |
| API-02 | Phase 1 | Complete |
| API-03 | Phase 1 | Complete |
| API-04 | Phase 1 | Complete |
| API-05 | Phase 1 | Complete |
| CONV-01 | Phase 2 | Complete |
| CONV-02 | Phase 2 | Complete |
| CONV-03 | Phase 2 | Complete |
| CONV-04 | Phase 2 | Complete |
| CONV-05 | Phase 2 | Complete |
| CONC-01 | Phase 2 | Complete |
| CONC-02 | Phase 2 | Complete |
| CONC-03 | Phase 2 | Complete |
| CONC-04 | Phase 2 | Complete |
| METR-01 | Phase 3 | Complete |
| METR-02 | Phase 3 | Complete |
| METR-03 | Phase 3 | Complete |
| METR-04 | Phase 3 | Complete |
| METR-05 | Phase 3 | Complete |
| METR-06 | Phase 3 | Complete |
| SERV-01 | Phase 4 | Complete |
| SERV-02 | Phase 4 | Complete |
| SERV-03 | Phase 4 | Complete |
| DASH-01 | Phase 4 | Complete |
| DASH-02 | Phase 4 | Complete |
| DASH-03 | Phase 4 | Complete |
| DASH-04 | Phase 4 | Complete |
| DASH-05 | Phase 4 | Complete |
| DASH-06 | Phase 4 | Complete |
| DASH-07 | Phase 4 | Complete |
| DASH-08 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-27 after Phase 3 completion (23/34 requirements complete)*
