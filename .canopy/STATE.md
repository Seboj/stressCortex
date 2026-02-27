# State: StressCortex

**Last updated:** 2026-02-27
**Session:** Phase 4 Plan 03 execution complete — all 4 phases done

---

## Project Reference

**Core value:** Validate that the Cortex conversation API handles high concurrency with multi-turn, context-heavy conversations without degradation — proving it works under real-world load before production use.

**Target API:** `https://cortex.nfinitmonkeys.com` — `POST /v1/chat/completions` (OpenAI-compatible)

**Current focus:** Phase 4 — Server and Dashboard

---

## Current Position

**Phase:** 4 of 4
**Plan:** 3 of 3 complete
**Status:** Complete

```
[##########] Phase 1: Foundation and API Client       ✓ 2026-02-26
[##########] Phase 2: Conversation Engine and Concurrency ✓ 2026-02-26
[##########] Phase 3: Metrics and Aggregation         ✓ 2026-02-27
[##########] Phase 4: Server and Dashboard            ✓ 2026-02-27
```

**Overall progress:** 4/4 phases complete

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases defined | 4 |
| Requirements covered | 34/34 |
| Plans created | 8 |
| Plans completed | 10 |
| Phases completed | 4 |

---

## Execution Metrics

| Plan | Duration (min) | Tasks | Files |
|------|---------------|-------|-------|
| 04-server-and-dashboard P01 | 3 | 3 | 7 |
| 04-server-and-dashboard P02 | 4 | 2 | 9 |
| 04-server-and-dashboard P03 | 7 | 3 | 9 |

## Accumulated Context

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| 4 phases (quick depth) | 34 requirements compressed into cohesive delivery boundaries: Foundation+API, Conv+Conc, Metrics, Server+Dashboard |
| Phase 1 includes API Client | FOUN and API have zero separation — types/event bus are prerequisite for the HTTP client in the same build session |
| Phase 4 merges Server+Dashboard | Neither SERV nor DASH is usable without the other; merging reflects delivery reality |
| Server+Dashboard as last phase | Dashboard depends on working SSE events, which depend on metrics, which depend on the conversation engine |
| Phases follow research-recommended component build order | types → event bus → HTTP client → workers → metrics → server → UI |
| 1 turn = 1 API call | M=3 means 3 API calls per conversation, matching "5x3=15 distinct calls" success criteria |
| makeRequest injection for testability | Runner accepts makeRequest function, no import of API client — clean test mocking |
| Promise.allSettled over p-queue | Simpler for "launch N with stagger" pattern; p-queue reserved for future dynamic concurrency |
| AbortController for drain timer | Prevents lingering timers in tests and production; clean cleanup pattern |
| Type cast at integration boundary | cortex.makeRequest (OpenAI types) cast to simpler {role,content} — safe because runner only builds valid messages |
| MetricsCollector as event subscriber | Decoupled from conversation engine — only listens to events, never imports from conversation modules |
| TestSummary as Phase 4 handoff contract | JSON-serializable interface, no Map/functions/circular refs — ready for SSE push |
| stdout for summary, not pino | Pino wraps in JSON (production mode), making formatted tables unreadable; stdout is CI-friendly |
| Sort-based exact percentiles | Dataset size (N*M values) is small enough for exact computation — no streaming approximation needed |
| SSE event type collision resolution | TestLifecycleEvent and ApiErrorEvent 'type' fields override the 'test:lifecycle'/'api:error' wrapper; useSSE uses priority set-checks for LIFECYCLE_TYPES and ERROR_TYPES |
| Module-level latency/token accumulators | Kept in useSSE.ts (outside React/Zustand) for O(1) accumulation; reset on test:lifecycle starting event |
| Chart x-axis uses sequence counter | Incrementing integer per turn instead of wall-clock timestamps — simpler and avoids axis label crowding |
| Latency chart as full-width hero element | lg:col-span-full via space-y-4 layout; secondary charts (token/error/throughput) in lg:grid-cols-3 below |
| Throughput computed client-side | Module-level testStartTime + totalRequests in useSSE.ts; setThroughput() called on every turn:complete event |
| isTestSummary() runtime guard | summary: unknown safely cast to TestSummary interface via field-presence checks |

### Architecture Notes (from research)

- **Stack:** Node.js 24 LTS + TypeScript 5.9 + tsx (not ts-node), openai SDK v6.25, Fastify v5, p-queue v9, React 19, Vite 7, Recharts 3.7, Zustand 5, pino v10, zod v4
- **Pattern:** Event-driven — ConversationWorker emits to EventEmitter bus; MetricsAggregator and SSE Bridge subscribe independently; workers have zero knowledge of HTTP/browser layer
- **Single process, single port:** Fastify serves REST + SSE + static React build on port 3001
- **p-queue v9 is ESM-only** — project must use ESM throughout (not CJS)
- **Tailwind v4** uses Vite plugin, not PostCSS config
- **Fastify v5** requires all plugins at version >=10

### Critical Pitfall Reminders

1. Capture `performance.now()` timestamps INSIDE stream callbacks, not outside — event loop lag otherwise inflates measurements (Phase 1)
2. Track TTFT and total completion time as separate metrics from day one — cannot be retrofitted (Phase 1)
3. Use staggered ramp-up with jitter — `Promise.all(N)` at t=0 creates thundering herd, not load signal (Phase 2)
4. Classify 429 as `rate_limited`, not generic error — throttle rate IS the data (Phase 1)
5. Token growth is quadratic: turn N sends sum(1..N) prior messages — track `prompt_tokens` per turn to expose growth (Phase 3)

### Research Flags

- **Phase 1 empirical verification required:** Cortex streaming `usage` field behavior, exact 429 header names (`Retry-After` vs. gateway-specific), `finish_reason` values — verify with a real API call before assuming OpenAI spec compatibility
- **Phase 4 implementation check:** Fastify v5 SSE via `reply.raw` — confirm `text/event-stream` pattern against current Fastify v5 docs before implementing

### Todos

- [x] Draft and validate doctor/patient system prompts before Phase 2 implementation (completed in Phase 2, Plan 01)

### Blockers

None.

---

## Session Continuity

### Resume Prompt

"Continue StressCortex. Phases 1-3 are complete. Currently ready for Phase 4 (Server and Dashboard). 76 tests pass. Run `/canopy:plan-phase 4` to create the Phase 4 execution plan."

### Key Files

- `.canopy/ROADMAP.md` — phase structure and success criteria
- `.canopy/REQUIREMENTS.md` — all v1 requirements with traceability
- `.canopy/PROJECT.md` — project context, constraints, API details
- `.canopy/research/SUMMARY.md` — stack decisions, architecture, pitfalls
- `src/conversation/` — conversation engine (runner, manager, prompts)
- `src/types/conversation.ts` — conversation and manager types
- `src/types/events.ts` — all typed events (API + conversation + lifecycle + metrics)
- `src/metrics/` — MetricsCollector, percentiles, summary printer
- `src/types/metrics.ts` — TestSummary interface (Phase 4 handoff contract)
- `client/src/store/useTestStore.ts` — Zustand store for all dashboard state
- `client/src/hooks/useSSE.ts` — SSE client hook dispatching events to store

---

*State initialized: 2026-02-26*
*Last updated: 2026-02-27 after Phase 4 Plan 03 completion — project complete*
