# Roadmap: StressCortex

**Project:** StressCortex
**Depth:** Quick (4 phases)
**Total v1 Requirements:** 34
**Coverage:** 34/34 ✓
**Created:** 2026-02-26

---

## Phases

- [x] **Phase 1: Foundation and API Client** - TypeScript scaffolding, event bus, and a verified single-turn call to Cortex with correct latency measurement and error classification (completed 2026-02-26)
- [x] **Phase 2: Conversation Engine and Concurrency** - Multi-turn self-talking medical dialogues running N concurrent conversations with staggered ramp-up and per-conversation error isolation (completed 2026-02-26)
- [x] **Phase 3: Metrics and Aggregation** - Rolling latency percentiles, token tracking, throughput, error rates, and a test completion summary report (completed 2026-02-27)
- [ ] **Phase 4: Server and Dashboard** - Fastify REST+SSE backend and React dashboard giving a live view of test progress, charts, config, and start/stop controls

---

## Phase Details

### Phase 1: Foundation and API Client

**Goal**: The project scaffolding exists and a single-turn call to the Cortex API succeeds with correct latency measurement, token parsing, and error classification.

**Depends on**: Nothing

**Requirements**: FOUN-01, FOUN-02, FOUN-03, API-01, API-02, API-03, API-04, API-05

**Success Criteria** (what must be TRUE):
  1. Running `npm start` with `CORTEX_API_KEY` unset prints a clear error and exits — not a stack trace
  2. A single-turn request to `/v1/chat/completions` succeeds and the raw response content is visible in structured logs
  3. Per-request latency is captured using `performance.now()` and appears in the log output alongside `prompt_tokens` and `completion_tokens`
  4. A 429 response is logged as `rate_limited` (not `error`), and a 5xx response is logged as `server_error` — each classified distinctly
  5. A 429 response with a `Retry-After` header causes the client to wait that duration before any retry attempt

**Plans**: 01-01, 01-02, 01-03 (3/3 complete)

---

### Phase 2: Conversation Engine and Concurrency

**Goal**: N concurrent multi-turn medical conversations run end-to-end against the Cortex API, with full message history sent each turn, staggered ramp-up, and no cross-conversation failure propagation.

**Depends on**: Phase 1

**Requirements**: CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, CONC-01, CONC-02, CONC-03, CONC-04

**Success Criteria** (what must be TRUE):
  1. A conversation starts with the medical professional sending "How are you feeling today?" and each subsequent turn includes the full prior message history in the messages array
  2. Running 5 concurrent conversations for 3 turns each produces 15 distinct API calls with no conversation sharing context from another conversation
  3. Conversations launch with visible stagger (not all at t=0 in the logs) and the ramp-up delay is configurable
  4. Deliberately killing one conversation mid-run (simulated error injection) does not stop or corrupt any other conversation
  5. Issuing a stop command drains in-flight requests to completion before the process exits — no orphaned connections

**Plans**: 02-01, 02-02, 02-03 (3/3 complete)

---

### Phase 3: Metrics and Aggregation

**Goal**: All performance data is collected, aggregated, and summarized — latency percentiles, token counts, throughput, and error breakdown are accurate and verifiable before any UI is built.

**Depends on**: Phase 2

**Requirements**: METR-01, METR-02, METR-03, METR-04, METR-05, METR-06

**Success Criteria** (what must be TRUE):
  1. After a test run, per-turn latency for every conversation is available as an array (e.g., `[210ms, 340ms, 890ms]`) with the growth trend visible across turns
  2. Aggregate p50, p95, and p99 latency values appear in the console summary at test completion and are computed from all turn measurements
  3. The test summary shows requests/second throughput and tokens/second, both derived from measured data (not estimates)
  4. The test summary shows error counts broken down by type: `rate_limited`, `server_error`, `client_error`, `timeout`
  5. Token usage per turn (`prompt_tokens` + `completion_tokens`) is tracked individually, making the quadratic growth of prompt tokens visible in the output

**Plans**: 03-01, 03-02 (2/2 complete)

---

### Phase 4: Server and Dashboard

**Goal**: A local web UI at `http://localhost:3001` gives real-time visibility into test progress, allows configuration and test control, and displays all metrics live — making the tool complete and usable.

**Depends on**: Phase 3

**Requirements**: SERV-01, SERV-02, SERV-03, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08

**Success Criteria** (what must be TRUE):
  1. Opening `http://localhost:3001` in a browser shows the dashboard; the user can enter test parameters (number of conversations, turns, concurrency) and start a test without touching the terminal
  2. While a test runs, each conversation's row updates in real-time showing current turn number and status (active / completed / errored) without a page refresh
  3. The latency chart updates live during the test showing p50, p95, and p99 trend lines; the token usage chart updates showing prompt and completion token growth per turn
  4. The error rate panel shows a live breakdown of error types while the test is in progress
  5. Clicking Stop mid-test triggers a graceful drain; the dashboard shows a test completion summary panel with all aggregate metrics once the run finishes
  6. At high concurrency (20+ conversations), the dashboard remains responsive — SSE updates are batched and the browser does not freeze

**Plans**: 4 plans
- [x] 04-01-PLAN.md — Fastify server backend: TestController, REST routes, SSE bridge with batching
- [ ] 04-02-PLAN.md — React client scaffold: Vite 7, Tailwind v4, Zustand store, SSE hook
- [ ] 04-03-PLAN.md — Dashboard UI components: ConfigPanel, charts, tables, summary panel, App layout
- [ ] 04-04-PLAN.md — Production build, integration verification, user checkpoint

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and API Client | 3/3 | Complete | 2026-02-26 |
| 2. Conversation Engine and Concurrency | 3/3 | Complete | 2026-02-26 |
| 3. Metrics and Aggregation | 2/2 | Complete | 2026-02-27 |
| 4. Server and Dashboard | 3/4 | In Progress|  |

---

*Roadmap created: 2026-02-26*
*Last updated: 2026-02-26 after Phase 2 completion*
