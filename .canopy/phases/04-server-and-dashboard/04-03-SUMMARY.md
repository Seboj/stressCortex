---
phase: 04-server-and-dashboard
plan: "03"
subsystem: ui
tags: [react, recharts, zustand, tailwind, dashboard, sse, real-time, charts]

requires:
  - phase: 04-server-and-dashboard/04-01
    provides: Fastify server with REST + SSE routes
  - phase: 04-server-and-dashboard/04-02
    provides: Zustand store and useSSE hook for dashboard state

provides:
  - Full single-page dashboard at http://localhost:3001
  - ConfigPanel with start/stop controls and test configuration inputs
  - ConversationTable with scrollable per-conversation status and color-coded badges
  - LatencyChart hero chart with p50/p95/p99 trend lines via Recharts LineChart
  - TokenChart stacked area chart for prompt and completion tokens
  - ErrorPanel with error breakdown by type and color-coded cards
  - ThroughputPanel with live req/s and tok/s numeric displays
  - SummaryPanel post-test aggregate metrics card persisting until next test

affects:
  - None (final phase/plan)

tech-stack:
  added: []
  patterns:
    - Recharts isAnimationActive=false on all Line/Area to prevent jank with rapid SSE updates
    - TypeScript unknown->runtime guard pattern for TestSummary from store.summary
    - Module-level testStartTime + totalRequests accumulators in useSSE for O(1) throughput computation
    - Recharts labelFormatter receives ReactNode not typed primitive — use String() coercion

key-files:
  created:
    - client/src/components/ConfigPanel.tsx
    - client/src/components/ConversationTable.tsx
    - client/src/components/LatencyChart.tsx
    - client/src/components/TokenChart.tsx
    - client/src/components/ErrorPanel.tsx
    - client/src/components/ThroughputPanel.tsx
    - client/src/components/SummaryPanel.tsx
  modified:
    - client/src/App.tsx
    - client/src/hooks/useSSE.ts

key-decisions:
  - "Latency chart placed full-width as hero element with height 280; secondary charts (token/error/throughput) in lg:grid-cols-3 below"
  - "SummaryPanel renders only when testStatus is stopped or idle AND summary !== null — prevents flash on reset()"
  - "Throughput computed from module-level testStartTime captured at starting lifecycle event, not from server metrics"
  - "Recharts 3.x labelFormatter type is ReactNode not number — use String() coercion to satisfy strict TypeScript"
  - "ErrorPanel shows all-zero state as green check rather than empty cards to confirm zero errors clearly"

patterns-established:
  - "Zustand selector per value in component (not one large selector) for fine-grained re-renders"
  - "isTestSummary() runtime guard to safely cast summary: unknown to TestSummary interface"
  - "All chart components check for empty data and render placeholder rather than empty Recharts instance"

requirements-completed: [DASH-02, DASH-03, DASH-04, DASH-05, DASH-07, DASH-08]

duration: 7min
completed: "2026-02-27"
---

# Phase 4 Plan 03: Dashboard UI Components Summary

**Seven React components with dark Tailwind theme wiring Zustand store to Recharts charts, config controls, and a post-test summary panel — completing the StressCortex live dashboard.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-27T03:22:17Z
- **Completed:** 2026-02-27T03:29:00Z
- **Tasks:** 3
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments

- Full single-page dashboard assembled in App.tsx calling useSSE() once at root level
- All 7 components subscribe to Zustand store via selectors for real-time updates without polling
- TypeScript strict mode passes and `vite build` produces a valid 572KB bundle

## Task Commits

1. **Task 1: ConfigPanel and ConversationTable** - `bec458e` (feat)
2. **Task 2: LatencyChart and TokenChart** - `2722095` (feat)
3. **Task 3: ErrorPanel, ThroughputPanel, SummaryPanel, App.tsx** - `47b399d` (feat)

## Files Created/Modified

- `client/src/components/ConfigPanel.tsx` - Test config inputs (conversations/turns/concurrency) + Start/Stop buttons wired to POST /api/test/start and POST /api/test/stop
- `client/src/components/ConversationTable.tsx` - Scrollable table with sticky header, color-coded status badges (green Active, gray Completed, red Errored), monospace values
- `client/src/components/LatencyChart.tsx` - Hero LineChart at height 280, p50 blue / p95 amber / p99 red, isAnimationActive=false
- `client/src/components/TokenChart.tsx` - Stacked AreaChart at height 240, prompt blue / completion green, isAnimationActive=false
- `client/src/components/ErrorPanel.tsx` - Error counts by type with color-coded cards, zero-error green confirmation
- `client/src/components/ThroughputPanel.tsx` - Live req/s and tok/s from throughput Zustand slice
- `client/src/components/SummaryPanel.tsx` - Post-test aggregate with duration, requests, p50/p95/p99, tokens, error rate, throughput
- `client/src/App.tsx` - Full layout: header → config → summary → latency hero chart → token/error/throughput row → conversation table
- `client/src/hooks/useSSE.ts` - Added testStartTime + totalRequests accumulators for live throughput computation

## Decisions Made

- Latency chart is full-width (lg:col-span full via space-y-4 layout) as the hero element per CONTEXT.md directive
- SummaryPanel visibility condition: `summary !== null && (testStatus === 'stopped' || testStatus === 'idle')` prevents stale display
- Throughput computed client-side from SSE event timestamps rather than waiting for final metrics:summary event
- Recharts labelFormatter uses `String(label)` coercion to satisfy strict TypeScript ReactNode signature

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Recharts 3.x labelFormatter TypeScript type error**
- **Found during:** Task 2 (LatencyChart and TokenChart)
- **Issue:** Plan specified `labelFormatter={(label: number) => ...}` but Recharts 3.x types the label parameter as `ReactNode` not `number`. Strict TypeScript rejected the typed annotation.
- **Fix:** Changed to `labelFormatter={(label) => `Update #${String(label)}`}` — untyped parameter with String() coercion.
- **Files modified:** `client/src/components/LatencyChart.tsx`, `client/src/components/TokenChart.tsx`
- **Verification:** `npx tsc --noEmit` passes with zero errors after fix.
- **Committed in:** 2722095 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug)
**Impact on plan:** Minimal type correction. No behavior change.

## Issues Encountered

None beyond the Recharts type fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 Plan 03 is the final plan in the entire project. All four phases are now complete:
- Phase 1: Foundation and API Client
- Phase 2: Conversation Engine and Concurrency
- Phase 3: Metrics and Aggregation
- Phase 4: Server and Dashboard

**To run the full stack:**
1. `CORTEX_API_KEY=<key> node --import tsx/esm src/index.ts` — starts Fastify on :3001
2. `cd client && npm run dev` — starts Vite dev server on :5173
3. Visit http://localhost:5173 to use the dashboard

**Production build:** `cd client && npm run build` then serve `client/dist/` as static files from Fastify (already configured in server).

---

*Phase: 04-server-and-dashboard*
*Completed: 2026-02-27*

## Self-Check: PASSED

All 7 component files confirmed present. All 3 task commits (bec458e, 2722095, 47b399d) confirmed in git log.
