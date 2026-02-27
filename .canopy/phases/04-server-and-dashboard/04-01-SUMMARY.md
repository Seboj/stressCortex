---
phase: 04-server-and-dashboard
plan: 01
subsystem: api
tags: [fastify, sse, server, rest, event-bus]

# Dependency graph
requires:
  - phase: 03-metrics-aggregation
    provides: MetricsCollector, TestSummary, eventBus, MetricsSummaryEvent
  - phase: 02-conversation-engine
    provides: createConversationManager, ConversationRunner, EventMap
  - phase: 01-foundation-and-api-client
    provides: validateConfig, createCortexClient, TypedEventEmitter
provides:
  - Fastify v5 HTTP server on port 3001
  - TestController class: wraps manager + collector for server-driven test runs
  - REST API: POST /api/test/start, POST /api/test/stop, GET /api/test/status
  - SSE endpoint: GET /api/events with 200ms batched event-bus updates
  - SseBridge: event bus to SSE bridge with batching and cleanup
  - Server entry point replacing CLI test runner
affects:
  - 04-server-and-dashboard (Plan 02: React dashboard)
  - 04-server-and-dashboard (Plan 03: Dashboard components)

# Tech tracking
tech-stack:
  added: [fastify@5, "@fastify/cors@11", "@fastify/static@9"]
  patterns:
    - "Fire-and-forget test start: REST returns 202 immediately, test runs in background"
    - "SSE batching: queue events in array, drain atomically every 200ms"
    - "Singleton controller/bridge pattern: one instance shared across routes"
    - "Event type collision resolution: rename conflicting fields (lifecycleType, errorType)"

key-files:
  created:
    - src/server/test-controller.ts
    - src/server/index.ts
    - src/server/routes/test.ts
    - src/server/routes/events.ts
    - src/server/sse-bridge.ts
  modified:
    - src/index.ts
    - package.json

key-decisions:
  - "Fire-and-forget manager.start() in TestController: REST returns 202 immediately while test runs in background"
  - "@fastify/static pinned to ^9 (v11 does not exist yet, v9 is Fastify v5 compatible)"
  - "SSE type field collision: TestLifecycleEvent.type renamed to lifecycleType, ApiErrorEvent.type renamed to errorType in SSE payload"
  - "Server entry point replaces CLI test runner: test runs now triggered via REST API"
  - "SseBridge.destroy() uses stored bound handler refs (same pattern as MetricsCollector)"

patterns-established:
  - "Singleton pattern for server-level services (testController, sseBridge)"
  - "Bound handler storage in constructor for clean eventBus.off() in destroy()"
  - "reply.raw.writeHead() for SSE responses in Fastify v5 (bypasses Fastify response handling)"
  - "Promise-based SSE connection keep-alive: resolve on reply.raw 'close' event"

requirements-completed: [SERV-01, SERV-02, SERV-03]

# Metrics
duration: 3min
completed: 2026-02-27
---

# Phase 4 Plan 01: Server and Dashboard Summary

**Fastify v5 HTTP server with TestController, REST test-control API, and 200ms-batched SSE event stream for the React dashboard**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T03:15:27Z
- **Completed:** 2026-02-27T03:18:27Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- TestController wraps ConversationManager + MetricsCollector for server-driven, repeatable test runs without process restart
- REST API provides full test lifecycle control: start (202), stop (200), status (200) with 409 guard against concurrent runs
- SseBridge aggregates all 6 event types from the bus into 200ms batches, preventing browser flooding during high-concurrency runs
- Server entry point replaces CLI test runner — tests are now initiated via HTTP and observed via SSE

## Task Commits

Each task was committed atomically:

1. **Task 1: Install server dependencies and create TestController** - `cce7ce1` (feat)
2. **Task 2: Create Fastify server factory with REST routes** - `feb82a2` (feat)
3. **Task 3: Create SSE bridge with batching and SSE route, update entry point** - `06a26ae` (feat)

**Plan metadata:** (docs commit - see below)

## Files Created/Modified
- `src/server/test-controller.ts` - TestController class: start/stop/getStatus with singleton testController
- `src/server/index.ts` - createServer() factory: CORS, REST routes, SSE route, static serving, SPA fallback
- `src/server/routes/test.ts` - testRoutes plugin: POST /api/test/start|stop, GET /api/test/status
- `src/server/routes/events.ts` - eventsRoute plugin: GET /api/events SSE endpoint
- `src/server/sse-bridge.ts` - SseBridge: event bus subscriber with 200ms batch flushing to SSE clients
- `src/index.ts` - Entry point refactored to start Fastify server on port 3001 with SIGINT/SIGTERM handlers
- `package.json` - Added fastify@^5, @fastify/cors@^11, @fastify/static@^9

## Decisions Made
- **Fire-and-forget start()**: `testController.start()` calls `manager.start()` without awaiting — the REST endpoint returns 202 immediately while the test runs asynchronously in background. Clean up happens in `.then()` callback.
- **@fastify/static pinned to ^9**: Plan specified ^11 but no v11 exists; v9 is the latest stable and fully Fastify v5 compatible.
- **SSE type field collision**: `TestLifecycleEvent` and `ApiErrorEvent` both have a `type` field with different semantics. Resolved by destructuring and renaming: `lifecycleType` and `errorType` in the SSE payload. The SSE discriminator `type` always identifies the event bus event name.
- **Server replaces CLI runner**: `src/index.ts` now starts Fastify instead of running a CLI test. Dashboard + REST API is the intended UX for Phase 4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned @fastify/static to ^9 instead of plan-specified ^11**
- **Found during:** Task 1 (dependency installation)
- **Issue:** npm error — `@fastify/static@^11` does not exist. Latest stable is v9.
- **Fix:** Installed `@fastify/static@^9` which is Fastify v5 compatible
- **Files modified:** package.json, package-lock.json
- **Verification:** npm install succeeded with 0 vulnerabilities
- **Committed in:** cce7ce1 (Task 1 commit)

**2. [Rule 1 - Bug] Resolved TypeScript errors from event type field collisions in SseBridge**
- **Found during:** Task 3 (TypeScript compilation check)
- **Issue:** `{ type: 'test:lifecycle', ...evt }` where `evt.type` (lifecycle state) overwrites SSE discriminator; TS2783 error
- **Fix:** Destructure conflicting fields: `{ type: lifecycleType, ...rest } = evt`, push `{ type: 'test:lifecycle', lifecycleType, ...rest }`; same pattern for ApiErrorEvent
- **Files modified:** src/server/sse-bridge.ts
- **Verification:** `npx tsc --noEmit` passes; all 76 tests pass
- **Committed in:** 06a26ae (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking version mismatch, 1 TypeScript bug)
**Impact on plan:** Both auto-fixes necessary for correct operation. No scope creep. SSE event shape slightly different from plan (lifecycleType/errorType vs type) — dashboard (Plans 02/03) must use these field names.

## Issues Encountered
- None beyond the documented deviations.

## User Setup Required
None - no external service configuration required. Server runs with existing `CORTEX_API_KEY` env var.

## Next Phase Readiness
- Fastify server verified working: `curl http://localhost:3001/api/test/status` returns `{"status":"idle"}`
- All 76 existing tests continue to pass (no regressions)
- TypeScript compiles cleanly with zero errors
- Ready for Plan 02 (React dashboard setup) and Plan 03 (dashboard components)
- Dashboard should use `lifecycleType` (not `type`) for TestLifecycleEvent and `errorType` (not `type`) for ApiErrorEvent in SSE payload parsing

## Self-Check: PASSED

- src/server/test-controller.ts: FOUND
- src/server/index.ts: FOUND
- src/server/routes/test.ts: FOUND
- src/server/routes/events.ts: FOUND
- src/server/sse-bridge.ts: FOUND
- .canopy/phases/04-server-and-dashboard/04-01-SUMMARY.md: FOUND
- Commit cce7ce1 (Task 1): FOUND
- Commit feb82a2 (Task 2): FOUND
- Commit 06a26ae (Task 3): FOUND

---
*Phase: 04-server-and-dashboard*
*Completed: 2026-02-27*
