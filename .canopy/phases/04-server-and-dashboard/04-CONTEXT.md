# Phase 4: Server and Dashboard - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Fastify REST+SSE backend serving a React dashboard at `http://localhost:3001`. The dashboard provides real-time test visibility, configuration controls, and start/stop capability. All metrics data comes from the existing metrics collector (Phase 3). No persistent storage, no auth, no mobile support — local desktop tool.

</domain>

<decisions>
## Implementation Decisions

### Server architecture
- Fastify server on port 3001 serving both the API and the static React build
- REST endpoints: `POST /api/test/start`, `POST /api/test/stop`, `GET /api/test/status`
- SSE endpoint: `GET /api/events` — pushes metric snapshots to connected clients
- SSE batching at 200ms intervals to prevent browser overload at high concurrency (SERV-03)
- Server integrates with existing event bus — subscribes to conversation/metric events and fans out via SSE

### Dashboard layout
- Single-page layout, no routing needed — everything on one screen
- Top section: config panel (inputs for conversations, turns, concurrency) + start/stop controls
- Middle section: chart grid (2x2) — latency chart, token usage chart, error breakdown, throughput
- Bottom section: conversation table with scrollable rows
- After test completes: summary panel appears above charts with aggregate metrics

### Visual design
- Dark theme — standard for monitoring/devtools (dark gray background, not pure black)
- Accent colors: green for active, red for errors, blue for primary actions, amber for warnings
- Clean, functional aesthetic — similar to k6 or Grafana dark mode
- Monospace font for metrics values, system font for labels
- Minimal chrome — data density over decoration

### Charts
- Recharts library — lightweight, React-native, no heavy dependencies
- Latency chart: line chart with p50 (blue), p95 (amber), p99 (red) trend lines, updating live
- Token usage chart: stacked area chart — prompt tokens (blue area) and completion tokens (green area) over time/turn
- Error breakdown: horizontal stacked bar or simple count cards by error type with color coding
- Throughput: requests/sec and tokens/sec as live numeric displays (not charts)

### Conversation table
- Scrollable HTML table with columns: #, Status, Current Turn, Last Latency, Total Tokens, Errors
- Status column: color-coded badge — green "Active", gray "Completed", red "Errored"
- Rows update in real-time via SSE — no polling
- At 20+ conversations, table is scrollable with fixed header
- No pagination — scroll is sufficient for expected scale (tens of conversations, not thousands)

### Test controls UX
- Config inputs grouped in a horizontal bar: number inputs with labels and reasonable defaults
- Defaults: 5 conversations, 5 turns, 5 concurrency
- Start button: prominent green button, disabled while test is running
- Stop button: red, only enabled during active test
- During run: config inputs disabled (can't change mid-test)
- After stop/completion: config re-enabled, summary panel visible

### Test completion summary
- Summary panel slides in at top when test finishes
- Shows: total duration, total requests, p50/p95/p99 latency, total tokens, error breakdown, throughput
- Matches the console summary from Phase 3 (summary-printer) but rendered as dashboard cards
- Panel persists until user starts a new test

### Claude's Discretion
- Exact CSS spacing, padding, and border-radius values
- Chart animation timing and transitions
- SSE reconnection strategy on disconnect
- Exact Fastify plugin choices (cors, static serving)
- Loading states and skeleton screens
- Exact error toast/notification style

</decisions>

<specifics>
## Specific Ideas

- Dashboard should feel like a "control room" — everything visible at once, no tab switching
- Latency chart is the hero element — largest chart panel since latency degradation under context growth is the core insight
- Token usage chart should make quadratic prompt token growth visually obvious (the core thesis of the tool)
- Summary panel after test should feel conclusive — "here are your results" with clear pass/fail indicators based on error rates

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. All v2 features (config files, CSV export, context window growth chart, streaming TTFT) remain deferred per REQUIREMENTS.md.

</deferred>

---

*Phase: 04-server-and-dashboard*
*Context gathered: 2026-02-26*
