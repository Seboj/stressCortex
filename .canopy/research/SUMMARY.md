# Project Research Summary

**Project:** StressCortex
**Domain:** Local LLM API stress testing tool with real-time web dashboard
**Researched:** 2026-02-26
**Confidence:** MEDIUM (stack HIGH; features/architecture/pitfalls MEDIUM — web search unavailable during research)

## Executive Summary

StressCortex is a local, single-machine tool for stress testing an OpenAI-compatible LLM gateway (Cortex at `cortex.nfinitmonkeys.com`) by simulating multi-turn medical professional/patient conversations at configurable concurrency levels. Unlike generic load testers (k6, Locust, Artillery) or single-turn LLM benchmarkers (LLMPerf), it fills an unoccupied niche: running N parallel conversations where each conversation sends its full, growing history on every turn, deliberately stressing context window handling and exposing latency degradation over turns. The recommended stack is Node.js 24 + TypeScript + Fastify for the backend engine, React + Zustand + Recharts for the browser dashboard, with SSE as the real-time push mechanism between them.

The recommended architecture is a layered event-driven design: a ConversationWorker pool emits typed events onto a singleton EventEmitter bus; a MetricsAggregator subscribes to derive rolling latency percentiles, throughput, and token counts; an SSE bridge subscribes independently to push live events to the browser; and a Fastify server ties it together while serving the static React dashboard. This decoupled design is non-negotiable — tight coupling between workers and the HTTP layer is the primary architectural anti-pattern that creates test and maintenance problems. The component build order (types → event bus → HTTP client → workers → metrics → orchestrator → server → UI) must be followed strictly because each layer depends on the one below.

The most dangerous risk class for this project is subtle measurement correctness: Node.js event loop lag silently inflates latency at high concurrency; failing to separate time-to-first-token (TTFT) from total completion time renders metrics diagnostically useless; and treating 429 rate limit responses as errors rather than backpressure signals obscures actual gateway capacity. All three of these measurement decisions are nearly impossible to retrofit — they must be built correctly from the first HTTP call. A secondary risk is the quadratic growth in prompt token count per conversation (turn N sends N prior messages), which makes token cost estimation non-obvious and can trigger unexpected TPM rate limits.

## Key Findings

### Recommended Stack

The stack is fully resolved with current version numbers (confirmed from npm registry, 2026-02-26). Node.js 24 LTS (Krypton) is the runtime; `tsx` replaces the problematic `ts-node` for TypeScript execution. The openai SDK v6 handles Cortex API calls with its built-in streaming, retry, and typed responses — no manual HTTP wiring needed. Fastify v5 serves the backend (REST + SSE + static files); React 19 + Vite 7 + Tailwind CSS v4 build the dashboard. `p-queue` manages concurrency with pause/resume support; Zustand handles frontend state without Redux overhead; Recharts provides declarative live charts. All version compatibility constraints are verified (notably: p-queue 9 is ESM-only, Tailwind v4 uses the Vite plugin instead of PostCSS config, Fastify v5 requires plugin versions ≥10).

**Core technologies:**
- Node.js 24 LTS + TypeScript 5.9 + tsx: runtime and type-safe execution — tsx replaces ts-node due to ESM/CJS reliability
- openai SDK v6.25: Cortex API client — handles streaming, retries, and typed responses; `baseURL` points to Cortex
- Fastify v5.7: backend server — REST API + SSE endpoint + static file serving in one process
- p-queue v9.1: concurrency control — supports dynamic concurrency changes and pause/resume mid-test
- React 19 + Vite 7 + Recharts 3.7 + Zustand 5: dashboard stack — concurrent rendering, declarative charts, selector-based state
- pino v10 + zod v4: structured logging and runtime validation — critical under concurrent load

### Expected Features

StressCortex's core value proposition is multi-turn conversation simulation with growing context. No existing tool does this natively. The feature set has a clear two-tier structure.

**Must have (table stakes — without these the tool is not viable):**
- Core HTTP client to `/v1/chat/completions` with OpenAI message format
- Multi-turn conversation loop sending full history every turn
- Concurrent conversation spawning with configurable N
- Per-turn latency tracking (p50/p95/p99, TTFT separate from total time)
- Token usage tracking (`usage.prompt_tokens` + `usage.completion_tokens` per turn)
- Error isolation per conversation — one failure must not kill others
- Test summary report at completion
- API key via environment variable (`CORTEX_API_KEY`)
- Live web UI dashboard (terminal output is insufficient for 20+ concurrent conversations)
- Role-based system prompts (medical professional + patient, hardcoded for v1)

**Should have (v1.x — adds significant value, safe to defer past initial launch):**
- Config file support (JSON/YAML) replacing hardcoded defaults
- Export to JSON/CSV for external analysis
- Configurable turn delay (inter-turn "think time")
- Context window growth chart (tokens vs. latency per turn number)
- Test presets ("smoke", "soak", "spike" named scenarios)

**Defer (v2+):**
- Streaming response support with TTFT measurement (architecture change; only add if Cortex streaming is a real use case)
- Replay of recorded conversation transcripts
- Custom scenario plugins (non-medical)
- Prometheus/Grafana push integration

### Architecture Approach

The architecture is a four-layer event-driven system within a single Node.js process. The core engine (TestOrchestrator + ConversationWorker pool) is deliberately isolated from the HTTP server layer — workers emit typed events onto a singleton Node.js EventEmitter; the MetricsAggregator and SSE bridge subscribe independently. This means workers have zero knowledge of browsers, SSE, or HTTP responses. The Fastify server layer sits above, exposing REST routes (`POST /api/start`, `POST /api/stop`, `GET /api/status`) and a `GET /api/events` SSE endpoint. The React dashboard connects via SSE for live pushes and REST for the initial state snapshot on load. For production use (local), `npm run build` compiles React to `dist/` and Fastify serves it via `@fastify/static` — one process, one port.

**Major components:**
1. ConversationWorker — owns one conversation's full message history array; loops M turns; emits `turn:complete` events
2. TestOrchestrator — spawns N workers; manages lifecycle (start/stop/drain); uses p-queue for concurrency control
3. MetricsAggregator — subscribes to event bus; maintains rolling latency histograms, throughput, token counts
4. SSE Bridge — subscribes to event bus; holds open browser connections; broadcasts events as `text/event-stream`
5. Fastify Server — REST API + SSE endpoint + static serving; bridges HTTP layer to core engine via direct method calls
6. React Dashboard — Zustand store fed by SSE; Recharts for latency/token charts; conversation status grid

### Critical Pitfalls

1. **Event loop lag inflating latency measurements** — Capture timestamps inside stream callbacks using `performance.now()`, not outside them. Use `perf_hooks.monitorEventLoopDelay()` as a continuous metric. Establish this in the first HTTP client commit — it cannot be retrofitted without invalidating all prior measurements.

2. **Single "latency" metric conflating TTFT and total completion time** — Define three separate per-call metrics before writing any HTTP code: time-to-first-token (TTFT), inter-token latency (mean/P95), and total completion time. TTFT is the primary signal for gateway saturation. This is a metrics design decision, not a feature addition.

3. **Request avalanche — spawning all N conversations at t=0** — Implement a configurable ramp-up (`rampUpSeconds`) with jitter from day one. `Promise.all()` firing N requests simultaneously is a thundering herd. All early errors will be rate limit artifacts, not capacity signals.

4. **Treating 429s as errors instead of backpressure** — Classify errors into four types: `rate_limited` (429), `server_error` (5xx), `client_error` (4xx), `timeout`. Read `Retry-After` header and back off. Track `rate_limited` as its own dashboard metric — the throttle rate IS the data.

5. **Quadratic token cost surprise from growing context** — Token consumption is `sum(1..N) × avg_tokens`, not `N × avg_tokens`. At 20 turns, the last turn sends 10x the context of the first. Show a pre-test token estimate in the UI and track `usage.prompt_tokens` per turn to make the growth curve visible before it triggers unexpected TPM rate limits.

## Implications for Roadmap

Based on the component build order in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md, the recommended phase structure follows strict dependency ordering. Measurement correctness is the most important early decision — it must precede all other work.

### Phase 1: Foundation — Types, Event Bus, and HTTP Client

**Rationale:** Types and the event bus are the dependency root of everything else. The HTTP client (Cortex API call) is the first externally-verifiable thing. Getting it right early — including TTFT measurement, error classification, and connection pooling — prevents the highest-severity pitfalls from propagating into later phases.
**Delivers:** Working single-turn call to Cortex with correct latency measurement (TTFT + total time, using `performance.now()` inside stream callbacks), error classification (429/5xx/timeout), and structured pino logging.
**Addresses:** API key config, single-turn request/response, graceful error handling
**Avoids:** Event loop latency inflation (Pitfall 1), missing TTFT metric (Pitfall 2), 429 misclassification (Pitfall 5), SSE parse fragmentation (Pitfall 6 — if streaming is confirmed)

### Phase 2: Conversation Engine — Multi-Turn Loop and Concurrency

**Rationale:** The multi-turn loop and concurrent spawning are the core differentiating logic. These must be built before the UI because the UI depends on the event bus events that come from this layer. Growing-context memory management must be solved here, not retrofitted.
**Delivers:** N concurrent conversations each running M turns with full history sent every turn; p-queue for concurrency; staggered ramp-up spawn; per-conversation state machine; event bus emissions (`turn:complete`, `run:start`, `run:complete`).
**Addresses:** Multi-turn conversation loop, concurrent spawning, role-based system prompts, error isolation per conversation
**Avoids:** Request avalanche (Pitfall 3), context window memory explosion (Pitfall 4), quadratic token cost surprise (Pitfall 8)
**Uses:** p-queue, openai SDK, pino, EventEmitter bus from Phase 1

### Phase 3: Metrics Aggregation and Test Summary

**Rationale:** Metrics must be complete before the dashboard is built — the UI renders what the MetricsAggregator produces. Rolling percentile calculation (p50/p95/p99 latency, throughput, token counts) is the analytical core of the tool and has its own correctness concerns separate from data collection.
**Delivers:** MetricsAggregator subscribing to event bus; rolling latency histogram; per-conversation turn-by-turn latency array; token count accumulation; test completion summary report (console output).
**Addresses:** Latency percentile reporting, token usage tracking, throughput reporting, error rate tracking, test summary report
**Uses:** Event bus from Phase 1, turn events from Phase 2

### Phase 4: Fastify Server and SSE Layer

**Rationale:** The server layer is the last backend concern before the UI. SSE must be built with correct connection lifecycle management (cleanup on disconnect, batched updates) to avoid the browser overload pitfall. REST routes are thin wrappers over the engine.
**Delivers:** Fastify server on port 3001; `POST /api/start`, `POST /api/stop`, `GET /api/status`; `GET /api/events` SSE endpoint; Vite proxy configuration; `@fastify/static` for production serving.
**Addresses:** Real-time push mechanism, graceful stop, server-side update batching
**Avoids:** Dashboard UI overload (Pitfall 7) — batching strategy defined here before the UI is built
**Uses:** Fastify + @fastify/cors + @fastify/static, MetricsAggregator snapshot, EventEmitter bus

### Phase 5: React Dashboard

**Rationale:** The UI is the last layer because it depends on working SSE events and a real `/api/status` snapshot. It can be developed with live data from Phase 4. Zustand selector-based subscriptions are essential to avoid full re-renders on every metric update; the update throttle strategy from Phase 4 must be in place first.
**Delivers:** React dashboard with Vite + Tailwind CSS v4; Zustand store fed by SSE; live conversation status grid (turn N/M, latency, status); latency p50/p95/p99 time-series chart (Recharts); token usage chart; test config form; start/stop controls; test summary panel.
**Addresses:** Live web UI dashboard, per-conversation status tracking, real-time progress display, error display
**Avoids:** Browser render overload (Pitfall 7) — Zustand selectors + throttled updates
**Uses:** React 19, Vite 7, Tailwind v4, Recharts 3.7, Zustand 5

### Phase 6: v1.x Enhancements

**Rationale:** These features add substantial value but have no blocking dependencies — they can be added in any order after the core test loop is validated with at least one real Cortex run.
**Delivers:** Config file support (JSON/YAML via zod validation), JSON/CSV export, configurable turn delay, context window growth chart (tokens vs. latency per turn number), test presets.
**Addresses:** Reproducibility, external analysis, realistic pacing, v1.x feature set from FEATURES.md

### Phase Ordering Rationale

- Types and event bus first eliminates circular import issues and establishes the communication backbone before any producer or consumer is built.
- HTTP client before conversation loop validates the Cortex API integration in isolation — critical because Cortex's actual behavior (especially streaming `usage` fields) must be confirmed empirically.
- Conversation engine before metrics because MetricsAggregator subscribes to events the engine emits — no events, nothing to aggregate.
- Metrics before server because the server's `/api/status` route calls `aggregator.snapshot()`.
- Server before UI because the dashboard reads from a live server, not mocks.
- Pitfall prevention is woven into the phase where it must be solved — TTFT in Phase 1, ramp-up in Phase 2, SSE batching in Phase 4 — because retrofitting any of these after the fact has HIGH recovery cost per PITFALLS.md.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Cortex API behavior must be verified empirically — whether `usage` fields appear in streaming responses, exact rate limit header names, and whether `finish_reason` values match the OpenAI spec. No tool or doc verifies this; only a real API call will.
- **Phase 4:** SSE connection lifecycle in Fastify v5 (versus Express) uses `reply.raw` — the exact implementation pattern for `text/event-stream` with Fastify's reply abstraction should be verified against Fastify v5 docs before implementation.

Phases with standard patterns (skip research-phase):
- **Phase 2:** p-queue, EventEmitter, and async/await concurrency patterns are well-documented and stable — no additional research needed.
- **Phase 3:** Rolling percentile calculation (HDR histogram or simple sorted-array approach) is well-understood; standard implementation is sufficient for this scale.
- **Phase 5:** React + Vite + Zustand + Recharts integration follows documented patterns with confirmed version compatibility from STACK.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions live-confirmed from npm registry 2026-02-26; compatibility constraints verified from package.json peer deps |
| Features | MEDIUM | Derived from training knowledge of k6, Locust, LLMPerf (cutoff Aug 2025); competitor analysis not web-verified; core feature set is stable and low-risk |
| Architecture | MEDIUM | EventEmitter + SSE patterns are well-established Node.js conventions; specific Fastify v5 SSE implementation not verified against live docs |
| Pitfalls | MEDIUM | Node.js event loop and SSE fragmentation pitfalls are grounded in stable official documentation (HIGH confidence); Cortex-specific rate limit header names and streaming behavior are unverified (MEDIUM/LOW) |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Cortex API streaming behavior:** Whether `usage.prompt_tokens` and `usage.completion_tokens` are included in streaming responses must be verified with a real API call in Phase 1. Some OpenAI-compatible gateways omit `usage` from streaming chunks and only include it in the final chunk — or omit it entirely. The fallback token estimator should be built regardless.
- **Cortex rate limit headers:** The exact header names for rate limit signals (`Retry-After`, `X-RateLimit-Reset-Requests`, `X-RateLimit-Reset-Tokens`) must be confirmed from actual 429 responses in Phase 1. Do not assume they match OpenAI's header names exactly.
- **Fastify v5 SSE implementation:** The `reply.raw` pattern for `text/event-stream` in Fastify v5 should be confirmed against current Fastify docs before Phase 4 implementation begins.
- **Competitor landscape validation:** A quick search for "LLM load testing tools 2026" before roadmap finalization would confirm whether any new dedicated tools have emerged since the training data cutoff that StressCortex should differentiate against.
- **Medical conversation prompt quality:** The doctor/patient system prompts are described as "hardcoded for v1" but their quality directly affects whether generated conversations stress context windows realistically. These should be drafted and validated before Phase 2 implementation.

## Sources

### Primary (HIGH confidence)
- npm registry (live, 2026-02-26) — all package versions and peer dependency compatibility
- openai SDK v6.25.0 tarball (`client.d.ts`, `core/streaming.d.ts`) — confirmed `baseURL` in `ClientOptions`, `Stream<T> implements AsyncIterable<T>`
- Node.js release index (`nodejs.org/dist/index.json`) — confirmed v24.14.0 as current LTS (Krypton)
- Node.js official docs — EventEmitter, `perf_hooks.monitorEventLoopDelay`, `http.Agent`, native `fetch` availability
- W3C SSE specification — message boundary delimiting (`\n\n`)

### Secondary (MEDIUM confidence)
- Training knowledge of k6, Locust, Artillery, Gatling (cutoff Aug 2025) — competitor feature analysis
- Training knowledge of LLMPerf (Anyscale) — dedicated LLM benchmarking tool comparison
- Architecture patterns from k6, Artillery, autocannon source conventions — component design recommendations
- OpenAI API reference for chat completions streaming format and `usage` field behavior — Cortex compatibility assumed but unverified
- OpenAI rate limits documentation — 429 header names assumed compatible with Cortex

### Tertiary (LOW confidence — validate during Phase 1)
- Cortex gateway-specific behavior (streaming `usage` fields, rate limit headers, `finish_reason` values) — must be empirically verified; no external documentation available

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
