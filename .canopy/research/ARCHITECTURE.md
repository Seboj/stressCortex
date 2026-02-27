# Architecture Research

**Domain:** API stress testing tool with real-time web dashboard (local, Node.js/TypeScript)
**Researched:** 2026-02-26
**Confidence:** MEDIUM — no live web research available (WebSearch/WebFetch blocked, no Brave key); based on training knowledge of Node.js concurrency patterns, load testing tool architectures (k6, Artillery, autocannon), and SSE/WebSocket conventions. All claims match well-established Node.js ecosystem patterns.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Web UI Layer                           │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Browser Dashboard (React or vanilla JS + EventSource) │   │
│  │  - Test config form  - Live conversation cards         │   │
│  │  - Metrics charts    - Error log                       │   │
│  └──────────────────────┬─────────────────────────────────┘   │
└─────────────────────────┼────────────────────────────────────┘
                          │ SSE (GET /stream) + REST (POST /start, GET /status)
┌─────────────────────────▼────────────────────────────────────┐
│                    HTTP Server Layer                           │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Express server  (port 3000)                         │     │
│  │  - POST /api/start        → triggers TestOrchestrator │     │
│  │  - POST /api/stop         → cancels all workers      │     │
│  │  - GET  /api/status       → current snapshot         │     │
│  │  - GET  /api/events (SSE) → live event stream        │     │
│  │  - GET  /                 → serves dashboard HTML    │     │
│  └──────────────────┬───────────────────────────────────┘     │
└─────────────────────┼────────────────────────────────────────┘
                      │ method calls + EventEmitter events
┌─────────────────────▼────────────────────────────────────────┐
│                   Core Engine Layer                            │
│                                                               │
│  ┌─────────────────────┐   ┌──────────────────────────────┐   │
│  │   TestOrchestrator  │   │     MetricsAggregator        │   │
│  │                     │   │                              │   │
│  │ - Reads test config │   │ - Receives metric events     │   │
│  │ - Spawns N workers  │   │ - Maintains running stats:   │   │
│  │ - Controls pacing   │   │   latency p50/p95/p99        │   │
│  │ - Tracks lifecycle  │   │   throughput, error rate     │   │
│  │ - Emits run events  │   │   token counts               │   │
│  └──────┬──────────────┘   └──────────────┬───────────────┘   │
│         │ spawns                           │ receives events   │
│  ┌──────▼──────────────────────────────────────────────────┐   │
│  │            ConversationWorker pool                       │   │
│  │  [Worker 1]  [Worker 2]  [Worker 3]  ... [Worker N]     │   │
│  │                                                         │   │
│  │  Each worker:                                           │   │
│  │  - Maintains its own conversation history array        │   │
│  │  - Alternates doctor/patient role each turn            │   │
│  │  - Makes HTTP requests to Cortex API                   │   │
│  │  - Emits turn-level events (latency, tokens, error)    │   │
│  └──────────────────────┬──────────────────────────────────┘   │
└─────────────────────────┼────────────────────────────────────┘
                          │ HTTPS POST /v1/chat/completions
┌─────────────────────────▼────────────────────────────────────┐
│                   External API Layer                           │
│  ┌──────────────────────────────────────────────────────┐     │
│  │     Cortex LLM Gateway  (cortex.nfinitmonkeys.com)   │     │
│  │     POST /v1/chat/completions  (OpenAI-compat)       │     │
│  └──────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **Web Dashboard** | Display live metrics, conversation state, allow test config + start/stop | HTTP Server (REST + SSE) |
| **Express Server** | Serve static UI, expose REST API, push SSE events to connected browsers | Dashboard (SSE push), Core Engine (method calls + EventEmitter) |
| **TestOrchestrator** | Parse test config, spawn N ConversationWorker instances, manage lifecycle (start/stop/drain), emit run-level events | ConversationWorker (spawn), MetricsAggregator (emit events), SSE bridge (EventEmitter) |
| **ConversationWorker** | Run one multi-turn conversation: maintain history, alternate roles, make HTTP calls to Cortex, measure latency, emit per-turn telemetry | Cortex API (HTTPS), TestOrchestrator (status callbacks), MetricsAggregator (metric events) |
| **MetricsAggregator** | Receive all per-turn events; compute and maintain rolling stats: latency histograms, throughput, error rates, token counts | ConversationWorker (consumes events), Express Server (exposes snapshot), SSE bridge (push on update) |
| **SSE Bridge** | Convert internal EventEmitter events into `text/event-stream` responses; manage client connections and cleanup | Express Server (response objects), TestOrchestrator + MetricsAggregator (EventEmitter) |

---

## Recommended Project Structure

```
stressCortex/
├── src/
│   ├── server/
│   │   ├── index.ts           # Express app setup, static serving, port binding
│   │   ├── routes.ts          # POST /api/start, POST /api/stop, GET /api/status
│   │   └── sse.ts             # GET /api/events — SSE connection manager
│   │
│   ├── engine/
│   │   ├── orchestrator.ts    # TestOrchestrator: spawns workers, lifecycle control
│   │   ├── worker.ts          # ConversationWorker: one conversation's full loop
│   │   ├── roles.ts           # System prompts for doctor/patient roles
│   │   └── cortexClient.ts    # Thin HTTP wrapper for Cortex API calls
│   │
│   ├── metrics/
│   │   ├── aggregator.ts      # MetricsAggregator: rolling stats, histogram
│   │   ├── types.ts           # Shared metric event types (TurnEvent, RunSnapshot)
│   │   └── histogram.ts       # HDR histogram or simple percentile calculator
│   │
│   ├── events/
│   │   └── bus.ts             # Singleton EventEmitter — internal event bus
│   │
│   ├── types/
│   │   └── index.ts           # Shared types: TestConfig, ConversationState, etc.
│   │
│   └── main.ts                # Entry point: boot server, wire dependencies
│
├── ui/
│   ├── index.html             # Dashboard shell
│   ├── app.ts (or app.js)     # EventSource client, chart rendering, controls
│   └── styles.css             # Dashboard styles
│
├── package.json
├── tsconfig.json
└── .env.example               # CORTEX_API_KEY placeholder
```

### Structure Rationale

- **engine/:** Isolated from the web server — can be tested independently, no Express imports. The orchestrator and worker logic are pure async TypeScript.
- **metrics/:** Separate because metrics aggregation is stateful and computationally distinct from conversation driving. Keeping it separate allows swapping implementations (e.g., HDR histogram vs rolling window).
- **events/bus.ts:** A singleton EventEmitter decouples the engine from the SSE layer. Workers emit events; the SSE bridge subscribes. Neither knows about the other's internals.
- **server/sse.ts:** Owns the SSE connection registry (a `Set<Response>`) and the broadcast function. Centralizes all SSE concerns.
- **ui/:** Kept flat for a local tool. No bundler required — vanilla JS with native `EventSource` works perfectly. If React is chosen, this becomes a standard Vite project structure.

---

## Architectural Patterns

### Pattern 1: Internal EventEmitter as Decoupling Bus

**What:** A singleton `EventEmitter` (Node.js built-in) acts as the internal message bus. Workers emit typed events; the metrics aggregator and SSE bridge subscribe. No direct function calls cross component boundaries for telemetry.

**When to use:** When producers (workers) and consumers (SSE clients, metrics) have different lifecycles and must not be tightly coupled. Workers should not know that SSE exists.

**Trade-offs:** Simple, zero-dependency, synchronous delivery within the same process. Risk of memory leaks if listeners are not removed on test completion — must call `removeAllListeners()` at run end.

**Example:**
```typescript
// events/bus.ts
import { EventEmitter } from 'events';
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50); // Adjust for N concurrent workers

// engine/worker.ts — emit after each API call
eventBus.emit('turn:complete', {
  conversationId,
  turn,
  role,
  latencyMs,
  promptTokens,
  completionTokens,
  error: null,
});

// metrics/aggregator.ts — subscribe once at startup
eventBus.on('turn:complete', (event: TurnEvent) => {
  aggregator.record(event);
});

// server/sse.ts — subscribe once at startup
eventBus.on('turn:complete', (event: TurnEvent) => {
  sseManager.broadcast({ type: 'turn', payload: event });
});
```

### Pattern 2: SSE for Real-Time Dashboard Push

**What:** Use Server-Sent Events (SSE) over a single `GET /api/events` endpoint. The server holds open HTTP responses, writes `data: ...\n\n` chunks. The browser uses the native `EventSource` API to receive them.

**When to use:** One-directional server-to-client push with automatic reconnect. Perfect for a monitoring dashboard where the browser never needs to send data on the stream connection. WebSocket is overkill here — SSE is simpler and sufficient.

**Trade-offs:** SSE is HTTP/1.1 compatible, automatically reconnects, and has native browser support. Limitation: HTTP/1.1 allows only 6 connections per domain, but since this is a local tool with one tab, this is irrelevant. No binary framing needed.

**Example:**
```typescript
// server/sse.ts
const clients = new Set<Response>();

export function sseHandler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Send headers immediately, keep connection open

  clients.add(res);

  req.on('close', () => {
    clients.delete(res); // Clean up when browser disconnects
  });
}

export function broadcast(event: { type: string; payload: unknown }) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}
```

### Pattern 3: Bounded Concurrency with Promise.allSettled

**What:** The orchestrator spawns exactly N conversations simultaneously using `Promise.allSettled()`. Each conversation is a self-contained async function that runs its M-turn loop. No worker pool library needed for this scale.

**When to use:** When N (concurrent conversations) is known upfront and bounded (typically 1-50 for an LLM stress test, not thousands). Node.js async I/O handles this natively without threads.

**Trade-offs:** Simple and transparent. `Promise.allSettled` waits for ALL to complete, capturing both successes and failures, which is exactly what a test run needs. At N=50+ concurrent LLM calls, the bottleneck will be the Cortex API rate limits, not Node.js's ability to manage the promises.

**Example:**
```typescript
// engine/orchestrator.ts
async function runTest(config: TestConfig): Promise<void> {
  const workers = Array.from({ length: config.concurrency }, (_, i) =>
    new ConversationWorker(i, config).run()
  );

  const results = await Promise.allSettled(workers);

  const failed = results.filter(r => r.status === 'rejected').length;
  eventBus.emit('run:complete', { total: config.concurrency, failed });
}
```

### Pattern 4: Append-Only Conversation History

**What:** Each ConversationWorker maintains a `messages: Message[]` array that grows with each turn. The full array is sent as the `messages` field in every API request (OpenAI format). This is the only correct approach for multi-turn LLM conversations.

**When to use:** Always, for this use case. This is not optional — sending partial history produces incoherent conversations that don't stress the context window, defeating the purpose.

**Trade-offs:** Memory grows linearly with turns × conversations. For 50 conversations × 20 turns × ~500 tokens each, expect ~50MB of in-memory conversation state — entirely acceptable for a local tool. The growing history is also the mechanism that stresses the Cortex API: later turns have larger context windows, which increases latency and token usage.

**Example:**
```typescript
// engine/worker.ts
class ConversationWorker {
  private history: Message[] = [];

  async run() {
    for (let turn = 0; turn < this.config.turnsPerConversation; turn++) {
      const role = turn % 2 === 0 ? 'doctor' : 'patient';
      const systemPrompt = SYSTEM_PROMPTS[role];

      const start = Date.now();
      const response = await this.cortexClient.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.history,
        ],
      });

      const latencyMs = Date.now() - start;

      this.history.push(
        { role: 'user', content: this.history.at(-1)?.content ?? 'Hello.' },
        { role: 'assistant', content: response.choices[0].message.content }
      );

      eventBus.emit('turn:complete', { /* ... */ latencyMs });
    }
  }
}
```

---

## Data Flow

### Test Execution Flow

```
User clicks "Start" in dashboard
  ↓
POST /api/start { concurrency, turns, apiKey }
  ↓
Express routes.ts → TestOrchestrator.start(config)
  ↓
Orchestrator creates N ConversationWorkers
  ↓
Promise.allSettled([worker1.run(), worker2.run(), ...workerN.run()])
  │
  └─ Each worker (running concurrently):
       1. Build messages array (system + history)
       2. POST to Cortex API
       3. Await response (blocking this worker's async chain only)
       4. Append to history
       5. eventBus.emit('turn:complete', { id, turn, latency, tokens, error })
       6. Repeat for M turns
  ↓
eventBus 'turn:complete' events (synchronous fan-out)
  ├─→ MetricsAggregator.record(event) — updates rolling stats
  └─→ SSE broadcast(event) — pushes to all connected browser clients
  ↓
Browser EventSource receives 'data: ...' chunk
  ↓
Dashboard updates: conversation card, latency chart, counters
```

### SSE State Flow

```
Browser tab opens
  ↓
EventSource connects to GET /api/events
  ↓
Server: adds Response to clients Set, flushes headers
  ↓
[Any turn:complete event fires]
  ↓
broadcast() iterates clients Set, writes data chunk to each
  ↓
Browser EventSource.onmessage fires → UI update
  ↓
[Browser tab closes or navigates]
  ↓
req 'close' event → clients.delete(res) — prevents memory leak
```

### Metrics Snapshot Flow

```
GET /api/status
  ↓
Express handler calls MetricsAggregator.snapshot()
  ↓
Returns: {
  runningConversations, completedConversations, failedConversations,
  totalTurns, totalTokens,
  latency: { p50, p95, p99, mean },
  throughput: { turnsPerSecond, requestsInFlight },
  errorRate,
  elapsed,
}
```

---

## Component Build Order

Build in this sequence — each layer depends on the one below it:

```
1. types/index.ts        — Shared interfaces (TestConfig, Message, TurnEvent, RunSnapshot)
                           No deps. Define first; everything imports from here.

2. events/bus.ts         — Singleton EventEmitter
                           Depends on: nothing (Node.js built-in)

3. engine/cortexClient.ts — Thin HTTP wrapper for POST /v1/chat/completions
                           Depends on: types. Testable in isolation with a real API key.

4. engine/roles.ts       — System prompt strings for doctor/patient
                           Depends on: nothing. Pure constants.

5. engine/worker.ts      — ConversationWorker class
                           Depends on: types, eventBus, cortexClient, roles.
                           Core loop: history management, turn driving, event emission.

6. metrics/aggregator.ts — MetricsAggregator
                           Depends on: types, eventBus (subscribes to turn:complete).
                           Wire up after eventBus and worker exist.

7. engine/orchestrator.ts — TestOrchestrator
                            Depends on: types, eventBus, worker, aggregator.
                            Spawns workers, manages lifecycle.

8. server/sse.ts         — SSE connection manager
                           Depends on: eventBus (subscribes). Pure server concern.

9. server/routes.ts      — REST routes
                           Depends on: orchestrator (start/stop), aggregator (snapshot).

10. server/index.ts      — Express app setup + static serving
                           Depends on: routes, sse.

11. ui/                  — Dashboard
                           Depends on: running server. Build last; iterate on it freely.
```

**Rationale for this order:** Types first eliminates circular import issues. The event bus must exist before any component that emits or subscribes. Workers must exist before the orchestrator can spawn them. The server layer is wired up last because it depends on the engine being complete, not the other way around. The UI is completely independent of the TypeScript build — can be developed concurrently once the SSE endpoint is running.

---

## Scaling Considerations

This is a local tool; "scaling" means handling more concurrent conversations on one machine.

| Concurrent Conversations | Architecture | Notes |
|--------------------------|--------------|-------|
| 1–20 | Default async/await pattern | No changes needed. Node.js I/O handles easily. |
| 20–100 | Add request retry with exponential backoff | Cortex API rate limits become the constraint, not Node.js. |
| 100+ | Add concurrency limiter (p-limit or semaphore) | Prevent too many in-flight requests from overwhelming local network buffers. Not expected for this use case. |

### Scaling Priorities

1. **First bottleneck: Cortex API rate limits.** The Cortex gateway likely has per-key rate limits. At N=20+ simultaneous conversations, expect 429 responses. Design the worker to handle these gracefully (wait, retry, record as error).

2. **Second bottleneck: growing context window latency.** Each turn adds to the conversation history. Turn 15 will take significantly longer than turn 1. The metrics system must track per-turn latency separately (not just aggregate) to surface this degradation.

3. **Third bottleneck: SSE event flood.** At 50 conversations × 20 turns, that is 1000 SSE events. The dashboard must handle rapid-fire updates without freezing — batch DOM updates using `requestAnimationFrame` or throttle updates to once per 500ms.

---

## Anti-Patterns

### Anti-Pattern 1: Direct Coupling Between Workers and SSE

**What people do:** Pass the SSE `Response` object (or a callback to write to it) directly into each ConversationWorker.

**Why it's wrong:** Workers become tightly coupled to the HTTP layer. Testing workers requires mocking HTTP responses. Reconnecting browsers require re-wiring workers. When a browser tab closes mid-test, workers hold stale references.

**Do this instead:** Workers emit events onto the shared EventEmitter. The SSE layer subscribes independently. Workers have no knowledge of SSE, HTTP, or browsers.

### Anti-Pattern 2: Accumulating Turn Events in Memory for "Full History"

**What people do:** Store all 1000+ `TurnEvent` objects in a server-side array to replay them when a browser reconnects.

**Why it's wrong:** Unbounded memory growth. Replaying 1000 events on reconnect floods the browser. For a local test run, full replay is not needed.

**Do this instead:** Send a `GET /api/status` snapshot on connect (current aggregate state), then stream only new events via SSE going forward. The snapshot gives the "where are we now" picture; the stream gives "what's happening."

### Anti-Pattern 3: Shared Mutable Conversation History

**What people do:** Put all conversation histories in a single shared array or object, keyed by conversation ID.

**Why it's wrong:** If multiple async operations mutate a shared object without locking, race conditions occur. In practice, Node.js's single-threaded event loop prevents true data races, but complex keyed access still leads to subtle bugs and makes per-conversation isolation unclear.

**Do this instead:** Each `ConversationWorker` instance owns its own `history: Message[]` array as a class property. No sharing, no keys needed, no race conditions possible.

### Anti-Pattern 4: Polling for Metrics Instead of Event-Driven Push

**What people do:** Have the dashboard `setInterval` poll `GET /api/status` every second for updates.

**Why it's wrong:** One-second polling introduces visible lag in the UI. More importantly, it misses the architectural benefit of SSE: the server knows immediately when something happens and should push it.

**Do this instead:** Push `turn:complete` events over SSE immediately. The dashboard updates in near-real-time. Reserve `GET /api/status` for the initial page load snapshot only.

### Anti-Pattern 5: Not Cleaning Up EventEmitter Listeners After Test Completion

**What people do:** Subscribe to the event bus at the start of a test run and never remove listeners.

**Why it's wrong:** Running multiple test runs in the same process session causes listener accumulation. Node.js will warn about memory leaks (`MaxListenersExceededWarning`). Stale listeners from run N process events from run N+1.

**Do this instead:** Wrap per-run subscriptions in a `cleanup` function. Call `eventBus.removeAllListeners('turn:complete')` (or use named listeners with `off()`) when the orchestrator receives the stop signal or all workers complete.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Cortex API (`cortex.nfinitmonkeys.com`) | HTTPS POST, Bearer token auth, OpenAI-compatible JSON | Use Node.js `fetch` (native since Node 18) or `undici`. No SDK needed — it's plain HTTP. Handle 429 (rate limit), 503 (unavailable), and network timeouts explicitly. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Worker → MetricsAggregator | EventEmitter `'turn:complete'` event | Worker emits; aggregator subscribes at startup. No direct reference. |
| Worker → SSE Bridge | EventEmitter `'turn:complete'` event | Same event, different subscriber. Workers have zero knowledge of SSE. |
| Orchestrator → Worker | Direct method call (`new ConversationWorker().run()`) | Synchronous construction, async run. Promise returned. |
| Orchestrator → MetricsAggregator | EventEmitter `'run:start'` and `'run:complete'` events | Aggregator resets state on `run:start`. |
| Express Routes → Orchestrator | Direct method call (`orchestrator.start()`, `orchestrator.stop()`) | Routes import orchestrator singleton. |
| Express Routes → MetricsAggregator | Direct method call (`aggregator.snapshot()`) | Returns current stats object for `/api/status`. |
| SSE Bridge ↔ Browser | HTTP `text/event-stream` with `EventSource` API | Keep-alive connection. Server writes JSON chunks. Browser parses them. |

---

## Sources

- Node.js EventEmitter documentation (training knowledge, HIGH confidence — stable API since Node.js v0.1)
- Node.js native `fetch` availability: Node.js 18+ (HIGH confidence — official Node.js release notes)
- SSE (`text/event-stream`) specification and `EventSource` browser API (HIGH confidence — W3C spec, stable since ~2013)
- `Promise.allSettled` for bounded concurrency pattern (HIGH confidence — ES2020, widely used)
- Architecture patterns derived from studying k6, Artillery, and autocannon source patterns (MEDIUM confidence — training knowledge, not verified against live docs)
- OpenAI chat completions message format (MEDIUM confidence — training knowledge, should be verified against Cortex API actual behavior before Phase 1 implementation)

---

*Architecture research for: StressCortex — LLM API stress testing tool with real-time web dashboard*
*Researched: 2026-02-26*
