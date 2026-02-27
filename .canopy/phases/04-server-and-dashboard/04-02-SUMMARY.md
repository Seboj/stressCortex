---
phase: 04-server-and-dashboard
plan: "02"
subsystem: client
tags: [react, vite, tailwind, zustand, sse, real-time, dashboard]
dependency_graph:
  requires: []
  provides:
    - client Vite dev server with dark theme skeleton
    - Zustand store for all dashboard state
    - SSE client hook connecting to /api/events
  affects:
    - 04-03 (dashboard UI components consume the store and useSSE hook)
tech_stack:
  added:
    - react@19.2.4
    - react-dom@19.2.4
    - recharts@3.7.0
    - zustand@5.0.11
    - vite@7.3.1
    - "@vitejs/plugin-react@4.7.0"
    - "tailwindcss@4.2.1"
    - "@tailwindcss/vite@4.2.1"
    - "typescript@5.9.3"
    - "@types/react@19.2.14"
    - "@types/react-dom@19.2.3"
  patterns:
    - Tailwind v4 @custom-variant for class-based dark mode
    - Zustand create<State>()() double-call TypeScript pattern
    - New Map() spread on every upsert to trigger Zustand reactivity
    - Module-level latency/token accumulators outside React state
    - EventSource reconnect via onerror + setTimeout
key_files:
  created:
    - client/package.json
    - client/tsconfig.json
    - client/vite.config.ts
    - client/index.html
    - client/src/main.tsx
    - client/src/index.css
    - client/src/App.tsx
    - client/src/store/useTestStore.ts
    - client/src/hooks/useSSE.ts
  modified: []
decisions:
  - key: SSE event type collision resolution
    summary: >
      When SSE bridge spreads event data over { type: 'eventName', ...eventData },
      events with their own 'type' field (TestLifecycleEvent, ApiErrorEvent) override
      the wrapper type. useSSE.ts handles this by checking against known lifecycle
      types (starting/running/stopping/draining/stopped) and error types
      (rate_limited/server_error/client_error/timeout) before the main switch.
  - key: Module-level latency accumulators
    summary: >
      allLatencies, totalPrompt, totalCompletion kept as module-level variables in
      useSSE.ts (outside React/Zustand state) for O(1) accumulation. Reset on
      test:lifecycle starting event. Percentiles computed from sorted copy per turn.
  - key: Sequence counter for chart x-axis
    summary: >
      Using incrementing integer (sequenceCounter) for LatencyPoint.time and
      TokenPoint.time rather than wall-clock timestamps per research recommendation —
      simpler and avoids x-axis label crowding.
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_created: 9
  files_modified: 0
  completed_date: "2026-02-27"
---

# Phase 4 Plan 02: React Client Bootstrap Summary

**One-liner:** React 19 + Vite 7 + Tailwind v4 client with Zustand store and SSE hook wiring real-time test events to dashboard state.

---

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Bootstrap React client with Vite 7, Tailwind v4, and type sharing | 320726c | Done |
| 2 | Create Zustand store and SSE client hook | 447080d | Done |

---

## What Was Built

### Task 1: Client Bootstrap

- `client/package.json` with React 19, Recharts 3, Zustand 5 and Vite 7 dev deps
- `client/tsconfig.json` using bundler module resolution, includes `../src/types` for server type sharing
- `client/vite.config.ts` with `@vitejs/plugin-react` + `@tailwindcss/vite`, port 5173, `/api` proxy to `http://localhost:3001`
- `client/index.html` with `class="dark"` on `<html>` element for Tailwind dark mode
- `client/src/index.css` with `@import "tailwindcss"` and `@custom-variant dark (&:where(.dark, .dark *))`
- `client/src/main.tsx` standard React 19 root render
- `client/src/App.tsx` dark-themed skeleton (`bg-gray-900 text-gray-100`) — to be replaced in Plan 03

### Task 2: Zustand Store

`client/src/store/useTestStore.ts` exports `useTestStore` with:

- `config: TestConfig` — `{ numConversations: 5, turnsPerConversation: 5, concurrency: 5 }` defaults
- `testStatus: TestStatus` — `'idle' | 'running' | 'stopping' | 'stopped'`
- `conversations: Map<number, ConvRow>` — per-conversation rows keyed by ID
- `latencyHistory: LatencyPoint[]` — `{ time, p50, p95, p99 }` per turn
- `tokenHistory: TokenPoint[]` — `{ time, promptTokens, completionTokens }` cumulative
- `errorCounts: Record<string, number>` — error type tallies
- `summary: unknown | null` — holds `TestSummary` when test completes
- `throughput: { requestsPerSecond, tokensPerSecond } | null`

All Map mutations create new Map references for Zustand reactivity. All array mutations spread to new arrays.

### Task 2: SSE Hook

`client/src/hooks/useSSE.ts` exports `useSSE()`:

- Mounts once at App level (empty deps array)
- Opens `EventSource('/api/events')`
- Parses each message as `Array<SseEvent>` (batched format from server SSE bridge)
- Dispatches by event type with special handling for type-collision events:
  - `starting/running/stopping/draining/stopped` → lifecycle types (override `test:lifecycle` wrapper)
  - `rate_limited/server_error/client_error/timeout` → error types (override `api:error` wrapper)
  - `conversation:start`, `conversation:turn:complete`, `conversation:complete`, `metrics:summary` → named events
- Computes p50/p95/p99 from sorted accumulated latency array on each turn
- Tracks cumulative prompt+completion token totals
- Auto-reconnects after 2s on connection error
- Resets all module-level accumulators on `starting` lifecycle event

---

## Verification

```
cd client && npx tsc --noEmit   → 0 errors
cd client && npx vite build     → dist/index.html + 193KB JS bundle
```

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SSE event type collision for TestLifecycleEvent and ApiErrorEvent**

- **Found during:** Task 2 implementation
- **Issue:** The SSE bridge spreads `{ type: 'eventName', ...eventData }`. `TestLifecycleEvent` and `ApiErrorEvent` both have their own `type` field that overrides the wrapper type. The plan's dispatch table listed `'test:lifecycle'` and `'api:error'` as switch cases, but those strings would never actually arrive in the batch.
- **Fix:** Replaced the switch-only approach with priority checks: test against known `LIFECYCLE_TYPES` and `ERROR_TYPES` sets before the main switch. This correctly dispatches `'starting'`, `'rate_limited'`, etc.
- **Files modified:** `client/src/hooks/useSSE.ts`
- **Commit:** 447080d

---

## Self-Check: PASSED

All 9 files confirmed present on disk. Both task commits (320726c, 447080d) confirmed in git log.
