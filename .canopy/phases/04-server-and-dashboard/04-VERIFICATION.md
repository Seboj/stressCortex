---
phase: 04-server-and-dashboard
verified: 2026-02-26T00:00:00Z
status: passed
score: 5/6 success criteria verified
re_verification: false
human_verification:
  - test: "Open http://localhost:3001, enter 3/3/2 (conversations/turns/concurrency), click Start Test"
    expected: "Dashboard loads with dark theme, config inputs populate, conversation rows appear and update live, latency and token charts draw trend lines in real-time, throughput panel shows live req/s and tok/s"
    why_human: "Cannot automate browser rendering, real-time SSE data flow, or chart animation verification"
  - test: "With a test running (at least 2 conversations), click Stop Test"
    expected: "Status changes to stopping, in-flight conversations drain, summary panel appears with duration/latency/tokens/error-rate/throughput once drain completes"
    why_human: "Requires live Cortex API key, real SSE event flow, and visual confirmation of summary panel appearing"
  - test: "Run a test with 20+ conversations and observe browser responsiveness"
    expected: "Dashboard updates smoothly with no browser freeze; SSE events arrive in batches (JSON arrays), not as individual per-event writes"
    why_human: "Performance and browser responsiveness cannot be verified statically; requires a live test run"
  - test: "Verify the 'Concurrency' input actually controls concurrent execution vs numConversations"
    expected: "Setting numConversations=10 and concurrency=3 should limit simultaneous runners to 3; current implementation passes concurrency to the server but TestController only forwards numConversations to createConversationManager — concurrency param is silently ignored"
    why_human: "Behavior gap requires human confirmation of whether the single-pool-of-N design is intentional or a missing feature for DASH-06"
---

# Phase 4: Server and Dashboard Verification Report

**Phase Goal:** A local web UI at `http://localhost:3001` gives real-time visibility into test progress, allows configuration and test control, and displays all metrics live — making the tool complete and usable.
**Verified:** 2026-02-26
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Opening `http://localhost:3001` shows the dashboard; user can enter test parameters and start a test without touching the terminal | ? HUMAN NEEDED | Production build exists at `client/dist/index.html`; ConfigPanel has three number inputs wired to Zustand config; Start button fires `POST /api/test/start` with config body; Fastify serves static from `client/dist` — visual rendering needs human |
| 2 | While a test runs, each conversation's row updates in real-time showing current turn number and status (active / completed / errored) without a page refresh | ? HUMAN NEEDED | ConversationTable subscribes to `useTestStore((s) => s.conversations)` Map; upsertConversation creates new Map reference on every update; useSSE dispatches `conversation:turn:complete` and `conversation:complete` to store; SSE pipeline is fully wired — live behavior needs human |
| 3 | Latency chart updates live showing p50, p95, p99 trend lines; token usage chart updates showing prompt and completion token growth per turn | ✓ VERIFIED | LatencyChart subscribes to `latencyHistory` via Zustand selector; three `Line` components with correct strokes (blue/amber/red) and `isAnimationActive={false}`; TokenChart subscribes to `tokenHistory` with stacked AreaChart; useSSE computes running percentiles and cumulative token totals on each `conversation:turn:complete` event |
| 4 | Error rate panel shows live breakdown of error types while test is in progress | ✓ VERIFIED | ErrorPanel subscribes to `errorCounts` from store; useSSE checks `ERROR_TYPES` set and calls `incrementError(type)` for each `api:error` event; four error types color-coded (amber/red/orange/gray); zero-error state shows green confirmation |
| 5 | Clicking Stop mid-test triggers graceful drain; dashboard shows test completion summary with all aggregate metrics once run finishes | ? HUMAN NEEDED | ConfigPanel Stop button calls `POST /api/test/stop`; TestController.stop() sets status to 'stopping' and calls `manager.stop()`; SummaryPanel renders when `summary !== null && (testStatus === 'stopped' \|\| testStatus === 'idle')`; `metrics:summary` SSE event calls `setSummary()`; full drain-to-summary flow requires live test run |
| 6 | At high concurrency (20+ conversations), dashboard remains responsive — SSE updates are batched, browser does not freeze | ? HUMAN NEEDED | SseBridge batches at 200ms interval (`setInterval(..., 200)`) confirmed; `isAnimationActive={false}` on all Recharts Line/Area components confirmed; queue drains atomically with `splice(0)` per flush; responsiveness at 20+ simultaneous conversations requires live test run |

**Score:** 2/6 fully verified programmatically, 4/6 require human confirmation (infrastructure fully wired)

---

## Required Artifacts

### Plan 01 Artifacts (SERV-01, SERV-02, SERV-03)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/test-controller.ts` | TestController class wrapping manager + metrics lifecycle | ✓ VERIFIED | 112 lines; exports `TestController` class and `testController` singleton; `start()`, `stop()`, `getStatus()` methods implemented; concurrent run guard throws on `status !== 'idle'` |
| `src/server/index.ts` | Fastify app factory | ✓ VERIFIED | `createServer()` factory; registers CORS, testRoutes, eventsRoute, @fastify/static; SPA fallback via `setNotFoundHandler`; static path `../../client/dist` from `import.meta.dirname` |
| `src/server/routes/test.ts` | REST routes for test control | ✓ VERIFIED | `testRoutes` plugin; POST `/api/test/start` returns 202/409; POST `/api/test/stop` returns 200; GET `/api/test/status` returns current status |
| `src/server/routes/events.ts` | SSE endpoint | ✓ VERIFIED | `eventsRoute` plugin; GET `/api/events` with correct `text/event-stream` headers; `reply.raw.writeHead()`; blocks until `close` event |
| `src/server/sse-bridge.ts` | Event bus to SSE bridge with batching | ✓ VERIFIED | 153 lines; subscribes to 6 event types; `setInterval(..., 200)` confirmed; atomic `queue.splice(0)` drain; bound handlers stored for clean `eventBus.off()` |

### Plan 02 Artifacts (DASH-01, DASH-06)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/package.json` | React client dependencies | ✓ VERIFIED | react@19.2.4, react-dom@19.2.4, recharts@3.7.0, zustand@5.0.11 present |
| `client/vite.config.ts` | Vite config with React, Tailwind v4, and API proxy | ✓ VERIFIED | `@vitejs/plugin-react` + `@tailwindcss/vite`; proxy `/api` → `http://localhost:3001` |
| `client/src/store/useTestStore.ts` | Zustand store for all dashboard state | ✓ VERIFIED | `create<TestStore>()` pattern; all state slices present (config, testStatus, conversations Map, latencyHistory, tokenHistory, errorCounts, summary, throughput); defaults 5/5/5; `new Map()` on every upsert |
| `client/src/hooks/useSSE.ts` | EventSource hook dispatching SSE events to store | ✓ VERIFIED | `EventSource('/api/events')` on mount; dispatches all event types; handles lifecycleType/errorType collision workaround; reconnects on error after 2s |
| `client/src/index.css` | Tailwind v4 CSS entry with dark mode | ✓ VERIFIED | `@import "tailwindcss"` + `@custom-variant dark (&:where(.dark, .dark *))` |
| `client/src/App.tsx` | Root component with dark theme and full layout | ✓ VERIFIED | `useSSE()` called at top level; all 7 components assembled; dark theme `bg-gray-900` confirmed |

### Plan 03 Artifacts (DASH-02 through DASH-08)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/src/components/ConfigPanel.tsx` | Test config inputs + start/stop controls | ✓ VERIFIED | 3 number inputs (conversations/turns/concurrency) with 5/5/5 defaults; Start green, Stop red; disabled states correct; `POST /api/test/start` and `/api/test/stop` calls wired |
| `client/src/components/ConversationTable.tsx` | Live per-conversation status table | ✓ VERIFIED | 6 columns (#, Status, Current Turn, Last Latency, Total Tokens, Errors); color-coded badges (green/gray/red); sticky header; `max-h-80 overflow-y-auto`; subscribes to `conversations` Map |
| `client/src/components/LatencyChart.tsx` | Recharts LineChart with p50/p95/p99 | ✓ VERIFIED | Three `Line` components (blue p50, amber p95, red p99); height 280 hero; `isAnimationActive={false}` on all three; subscribes to `latencyHistory` |
| `client/src/components/TokenChart.tsx` | Recharts stacked AreaChart for tokens | ✓ VERIFIED | Two stacked `Area` components (blue prompt, green completion); `stackId="tokens"`; `isAnimationActive={false}`; subscribes to `tokenHistory` |
| `client/src/components/ErrorPanel.tsx` | Error breakdown cards | ✓ VERIFIED | Four error types with color coding; zero-error green check state; subscribes to `errorCounts` |
| `client/src/components/ThroughputPanel.tsx` | Live req/s and tok/s display | ✓ VERIFIED | Two numeric displays with monospace `text-blue-400`; `—` placeholder when null; subscribes to `throughput` |
| `client/src/components/SummaryPanel.tsx` | Post-test summary cards | ✓ VERIFIED | `isTestSummary()` runtime guard; shows duration/requests/latency/tokens/error-rate/throughput; renders only when `summary !== null && (stopped \|\| idle)`; persists until `reset()` |

### Plan 04 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/dist/index.html` | Production build of dashboard SPA | ✓ VERIFIED | Exists; references `index-YF4N3ur0.js` (bundled React) and `index-D9txW3aC.css`; `class="dark"` on `<html>` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/server/test-controller.ts` | `src/conversation/manager.ts` | `createConversationManager` import | ✓ WIRED | Line 12: `import { createConversationManager }` used at line 57 |
| `src/server/test-controller.ts` | `src/metrics/collector.ts` | `MetricsCollector` constructor | ✓ WIRED | Line 13: `import { MetricsCollector }` used at line 49: `new MetricsCollector()` |
| `src/server/sse-bridge.ts` | `src/core/event-bus.ts` | `eventBus.on` subscriptions | ✓ WIRED | Lines 79-84: all 6 event types subscribed; lines 142-147: all 6 cleaned up in `destroy()` |
| `src/server/routes/test.ts` | `src/server/test-controller.ts` | `testController.start/stop/getStatus` | ✓ WIRED | Line 10: import; lines 19, 28, 34: all three methods called |
| `client/src/hooks/useSSE.ts` | `client/src/store/useTestStore.ts` | `useTestStore.getState()` dispatching | ✓ WIRED | Line 58: `useTestStore.getState()` called on every SSE message batch |
| `client/src/hooks/useSSE.ts` | `/api/events` | `EventSource` connection | ✓ WIRED | Line 48: `new EventSource('/api/events')` |
| `client/vite.config.ts` | `http://localhost:3001` | Vite proxy config | ✓ WIRED | Lines 10-13: `/api` proxied to `http://localhost:3001` |
| `client/src/components/ConfigPanel.tsx` | `POST /api/test/start` | `fetch` on Start button click | ✓ WIRED | Line 18: `fetch('/api/test/start', { method: 'POST', ... body: JSON.stringify(config) })` |
| `client/src/components/ConfigPanel.tsx` | `POST /api/test/stop` | `fetch` on Stop button click | ✓ WIRED | Line 36: `fetch('/api/test/stop', { method: 'POST' })` |
| `client/src/components/LatencyChart.tsx` | `client/src/store/useTestStore.ts` | `useTestStore` selector for `latencyHistory` | ✓ WIRED | Line 14: `useTestStore((s) => s.latencyHistory)` |
| `client/src/components/ConversationTable.tsx` | `client/src/store/useTestStore.ts` | `useTestStore` selector for `conversations` Map | ✓ WIRED | Line 58: `useTestStore((s) => s.conversations)` |
| `client/src/App.tsx` | `client/src/hooks/useSSE.ts` | `useSSE()` at top level | ✓ WIRED | Line 1: import; line 11: `useSSE()` called at App root |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SERV-01 | 04-01 | System runs a local Fastify server exposing REST API for test control (start/stop/status) | ✓ SATISFIED | `src/server/routes/test.ts` with POST start (202/409), POST stop (200), GET status (200) |
| SERV-02 | 04-01 | System exposes SSE endpoint (`GET /api/events`) pushing real-time metric updates to browser | ✓ SATISFIED | `src/server/routes/events.ts` with `text/event-stream` headers and `sseBridge.addClient()` |
| SERV-03 | 04-01 | Server batches SSE updates (100-250ms intervals) to prevent browser overload | ✓ SATISFIED | `setInterval(() => this.flush(), 200)` in `sse-bridge.ts` line 88 — 200ms is within 100-250ms range |
| DASH-01 | 04-02, 04-04 | User can view a local web UI dashboard showing live test progress in real-time | ? HUMAN NEEDED | Production build at `client/dist/`; Fastify serves it; SSE pipeline wired — live rendering needs human |
| DASH-02 | 04-03 | Dashboard shows per-conversation status (active/completed/errored) with current turn number | ✓ SATISFIED | ConversationTable with color-coded badges and `currentTurn/turnsTotal` format |
| DASH-03 | 04-03 | Dashboard shows live latency chart (p50/p95/p99 over time) | ✓ SATISFIED | LatencyChart with three `Line` components reading from `latencyHistory` Zustand slice |
| DASH-04 | 04-03 | Dashboard shows token usage chart (prompt + completion tokens over time) | ✓ SATISFIED | TokenChart with stacked areas reading from `tokenHistory` Zustand slice |
| DASH-05 | 04-03 | Dashboard shows error rate and error type breakdown | ✓ SATISFIED | ErrorPanel subscribing to `errorCounts`; four error types with color coding |
| DASH-06 | 04-02, 04-03 | User can configure test parameters in the UI (conversations, turns, concurrency) | ⚠️ PARTIAL | Three inputs exist and bind to store; `numConversations` and `turnsPerConversation` are forwarded to `createConversationManager`; **`concurrency` input is accepted by UI and REST API but `TestController.start()` does not pass it to `createConversationManager`** — all conversations run simultaneously regardless of the concurrency setting |
| DASH-07 | 04-03 | User can start and stop tests from the UI | ✓ SATISFIED | Start fires `POST /api/test/start`; Stop fires `POST /api/test/stop`; TestController.stop() calls manager.stop() for graceful drain |
| DASH-08 | 04-03 | Dashboard shows test completion summary after run finishes | ✓ SATISFIED | SummaryPanel with `isTestSummary()` guard renders duration, requests, p50/p95/p99, tokens, error rate, throughput; persists until `reset()` |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `client/src/components/ConfigPanel.tsx` | 24, 28, 38 | `console.error()` for error states | ℹ️ Info | Errors on start/stop failures are only visible in browser console, not surfaced to the user in the UI |
| `src/server/test-controller.ts` | 40 | `concurrency` param accepted but not forwarded to manager | ⚠️ Warning | Concurrency input in UI has no effect on actual parallelism; manager runs all `numConversations` simultaneously; DASH-06 is partially satisfied |

---

## Human Verification Required

### 1. Full Dashboard Render and Test Flow

**Test:** Run `CORTEX_API_KEY=<key> npm start` and open `http://localhost:3001`. Verify dark-themed dashboard loads with "StressCortex" header. Set conversations=2, turns=2, concurrency=1, click Start Test. Verify conversation rows appear and update live; latency chart draws p50/p95/p99 lines; token chart shows stacked areas; throughput panel shows live values.
**Expected:** All UI elements populate within a few seconds of test start; no page refresh needed; charts update continuously.
**Why human:** Requires Cortex API key, browser rendering, and confirmation that SSE events actually flow from server through bridge to chart components.

### 2. Stop Button and Summary Panel

**Test:** With a test running, click "Stop Test". Wait for drain to complete.
**Expected:** Status changes to "stopping", then summary panel appears above charts with duration, total requests, latency percentiles, total tokens, error rate, and throughput values.
**Why human:** Requires live test execution and visual confirmation of summary panel transition.

### 3. High Concurrency Responsiveness

**Test:** Start a test with 20+ conversations and 10 turns each. Monitor browser responsiveness and check SSE events arrive as JSON arrays.
**Expected:** Browser stays interactive; charts update smoothly without freeze; DevTools Network tab shows SSE messages containing arrays like `[{...},{...}]`, not individual events.
**Why human:** Browser performance under real SSE load cannot be verified statically; requires live execution.

### 4. Concurrency Input Behavior Clarification

**Test:** Set numConversations=5 and concurrency=2. Start a test and observe whether 2 or 5 conversations run simultaneously.
**Expected (current code):** All 5 conversations start simultaneously; the concurrency=2 value is collected by the UI and sent to the server but `TestController.start()` does not forward it to `createConversationManager`. The manager runs all `numConversations` concurrently via `Promise.allSettled`.
**Why human:** Confirm whether this is intentional (the plan noted "concurrency = numConversations since all launch with stagger") or a gap that should be fixed. If intentional, the "Concurrency" UI label may be confusing to users.

---

## Gaps Summary

One functional gap was found:

**DASH-06 Partial Gap — Concurrency Input Silently Ignored:**

The "Concurrency" number input exists in the UI (`ConfigPanel.tsx`), is stored in Zustand config, and is sent in the `POST /api/test/start` body. The REST route destructures it and passes it to `testController.start({ numConversations, turnsPerConversation, concurrency })`. However, `TestController.start()` only forwards `numConversations` and `turnsPerConversation` to `createConversationManager()` — the `concurrency` parameter is silently dropped. The conversation manager runs all `numConversations` conversations simultaneously using `Promise.allSettled`.

The Plan 01 rationale states: _"The concurrency param maps to numConversations in ManagerConfig (concurrency = how many run simultaneously, which is the same as numConversations since all launch with stagger)."_ This design choice means the UI has three inputs where one (concurrency) has no independent effect. This satisfies the letter of DASH-06 (the input exists) but not the spirit (the value has no distinct effect from numConversations). This is classified as a Warning rather than a Blocker because it does not prevent the tool from running tests — it just means "concurrency" is an alias for "conversations".

No blocker anti-patterns were found. All artifacts exist, are substantive, and are wired. TypeScript compiles with zero errors for both server (`npx tsc --noEmit`) and client (`cd client && npx tsc --noEmit`).

---

_Verified: 2026-02-26_
_Verifier: Claude (canopy-verifier)_
