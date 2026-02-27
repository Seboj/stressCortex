# Phase 4: Server and Dashboard - Research

**Researched:** 2026-02-26
**Domain:** Fastify v5 SSE server + React 19 / Vite 7 / Recharts / Zustand real-time dashboard
**Confidence:** HIGH (architecture), MEDIUM (exact plugin versions), HIGH (patterns)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Server architecture**
- Fastify server on port 3001 serving both the API and the static React build
- REST endpoints: `POST /api/test/start`, `POST /api/test/stop`, `GET /api/test/status`
- SSE endpoint: `GET /api/events` — pushes metric snapshots to connected clients
- SSE batching at 200ms intervals to prevent browser overload at high concurrency (SERV-03)
- Server integrates with existing event bus — subscribes to conversation/metric events and fans out via SSE

**Dashboard layout**
- Single-page layout, no routing needed — everything on one screen
- Top section: config panel (inputs for conversations, turns, concurrency) + start/stop controls
- Middle section: chart grid (2x2) — latency chart, token usage chart, error breakdown, throughput
- Bottom section: conversation table with scrollable rows
- After test completes: summary panel appears above charts with aggregate metrics

**Visual design**
- Dark theme — standard for monitoring/devtools (dark gray background, not pure black)
- Accent colors: green for active, red for errors, blue for primary actions, amber for warnings
- Clean, functional aesthetic — similar to k6 or Grafana dark mode
- Monospace font for metrics values, system font for labels
- Minimal chrome — data density over decoration

**Charts**
- Recharts library — lightweight, React-native, no heavy dependencies
- Latency chart: line chart with p50 (blue), p95 (amber), p99 (red) trend lines, updating live
- Token usage chart: stacked area chart — prompt tokens (blue area) and completion tokens (green area) over time/turn
- Error breakdown: horizontal stacked bar or simple count cards by error type with color coding
- Throughput: requests/sec and tokens/sec as live numeric displays (not charts)

**Conversation table**
- Scrollable HTML table with columns: #, Status, Current Turn, Last Latency, Total Tokens, Errors
- Status column: color-coded badge — green "Active", gray "Completed", red "Errored"
- Rows update in real-time via SSE — no polling
- At 20+ conversations, table is scrollable with fixed header
- No pagination — scroll is sufficient for expected scale

**Test controls UX**
- Config inputs grouped in a horizontal bar: number inputs with labels and reasonable defaults
- Defaults: 5 conversations, 5 turns, 5 concurrency
- Start button: prominent green button, disabled while test is running
- Stop button: red, only enabled during active test
- During run: config inputs disabled
- After stop/completion: config re-enabled, summary panel visible

**Test completion summary**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. All v2 features (config files, CSV export, context window growth chart, streaming TTFT) remain deferred per REQUIREMENTS.md.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-01 | System runs a local Fastify server exposing REST API for test control (start/stop/status) | Fastify v5 with ESM + TypeScript patterns; `POST /api/test/start` triggers manager.start(), `POST /api/test/stop` triggers manager.stop(), `GET /api/test/status` returns current lifecycle state |
| SERV-02 | System exposes SSE endpoint (`GET /api/events`) pushing real-time metric updates to browser | Two valid patterns: `reply.raw.writeHead` (low-level, skips hooks) and Readable stream via `reply.send` (hooks-safe). For a local tool with no auth, `reply.raw` is pragmatic and widely used. |
| SERV-03 | Server batches SSE updates (100-250ms intervals) to prevent browser overload at high concurrency | Queue+setInterval pattern: accumulate events in an array, flush on 200ms tick; prevents N×M updates at 20+ concurrency |
| DASH-01 | User can view a local web UI dashboard showing live test progress in real-time | React 19 + Vite 7 build served as static files by `@fastify/static`; EventSource in browser connects to `/api/events` |
| DASH-02 | Dashboard shows per-conversation status (active/completed/errored) with current turn number | Zustand store keyed by conversationId; SSE events `conversation:start`, `conversation:turn:complete`, `conversation:complete` update per-row state |
| DASH-03 | Dashboard shows live latency chart (p50/p95/p99 over time) | Recharts LineChart; data array in Zustand grows via SSE snapshot pushes; chart re-renders on state change |
| DASH-04 | Dashboard shows token usage chart (prompt + completion tokens over time) | Recharts AreaChart with stackId; prompt tokens + completion tokens as stacked areas |
| DASH-05 | Dashboard shows error rate and error type breakdown | Error count cards or simple horizontal bar; maps `errorBreakdown` from TestSummary / live `api:error` events |
| DASH-06 | User can configure test parameters in the UI (conversations, turns, concurrency) | Controlled number inputs bound to Zustand config slice; disabled during active test |
| DASH-07 | User can start and stop tests from the UI | `POST /api/test/start` with config body; `POST /api/test/stop`; button state mirrors `testStatus` in Zustand |
| DASH-08 | Dashboard shows test completion summary after run finishes | `metrics:summary` SSE event triggers summary panel rendering; maps directly to `TestSummary` interface |
</phase_requirements>

---

## Summary

Phase 4 adds a Fastify v5 server and a React 19 + Vite 7 dashboard to an already-complete Node.js load-testing engine. The architecture is a single process on port 3001: Fastify handles the REST control API, one SSE endpoint for real-time push, and serves the compiled React SPA as static files. The React side uses Zustand for client state, Recharts for charts, and Tailwind v4 for styling.

The hardest implementation problems are (1) correctly wiring the SSE bridge between the existing TypedEventEmitter bus and the browser without losing events or freezing the browser, and (2) converting the existing CLI-entry-point (`src/index.ts`) into a module that a Fastify server can orchestrate — the current `main()` function must be refactored into a `TestController` class that the server can call and cancel independently.

The stack chosen in STATE.md (Fastify v5, React 19, Vite 7, Recharts 3.7, Zustand 5, Tailwind v4) is accurate and well-supported. No major surprises were found in current docs; the one area requiring careful attention is the Fastify v5 SSE approach (`reply.raw` vs. `reply.send` with a Readable stream) and the need for `@fastify/static` v11+ for Fastify v5 compatibility.

**Primary recommendation:** Use `reply.raw.writeHead` for the SSE endpoint (pragmatic for a local tool with no auth hooks), batch events at 200ms with a server-side queue, and build the React client in `client/` with its own `vite.config.ts` that proxies `/api/*` to `http://localhost:3001` during development.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.3.0 | HTTP server + routing | Fastest Node.js framework, first-class TypeScript, ESM native |
| @fastify/static | ^11.0.0 | Serve compiled React SPA | Official Fastify plugin, Fastify v5 requires plugins >=10 |
| @fastify/cors | ^10.0.0 | CORS for dev (browser to API) | Official plugin; not strictly needed when serving SPA from same port |
| react | ^19.0.0 | UI framework | Already decided; React 19 is stable as of Dec 2024 |
| react-dom | ^19.0.0 | DOM renderer | Paired with react |
| vite | ^7.0.0 | React build tool + dev proxy | Decided; Vite 7 stable 2025 |
| @vitejs/plugin-react | ^4.x | JSX transform for Vite | Official React plugin for Vite |
| recharts | ^3.7.0 | Chart components | Decided; React-native, no D3 peer-dep complexity |
| zustand | ^5.0.0 | Client state management | Decided; minimal boilerplate, no Provider wrapper |
| tailwindcss | ^4.1.0 | Utility CSS | Decided; v4 uses Vite plugin, not PostCSS |
| @tailwindcss/vite | ^4.1.0 | Vite plugin for Tailwind v4 | Required for v4 — replaces PostCSS config entirely |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/react | ^19.0.0 | TypeScript types for React | Always in TypeScript projects |
| @types/react-dom | ^19.0.0 | TypeScript types for react-dom | Always in TypeScript projects |
| typescript | ^5.9.3 | Already in project | Client tsconfig extends or mirrors server tsconfig |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Chart.js + react-chartjs-2 | Chart.js has more chart types but heavier, not as React-idiomatic |
| Recharts | Victory | Less popular, smaller ecosystem, similar API |
| Zustand | React Context + useReducer | No extra dep, but Context triggers unnecessary re-renders at scale |
| @fastify/static | express-style sendFile | Not Fastify-idiomatic |
| reply.raw SSE | @fastify/sse plugin | Plugin is cleaner but adds dependency; reply.raw works for simple cases |
| Tailwind v4 | Tailwind v3 | v3 is stable but v4 is already decided; v4 has simpler Vite integration |

**Installation (client directory):**
```bash
# In project root
npm install fastify @fastify/static @fastify/cors

# Bootstrap the React client
npm create vite@latest client -- --template react-ts
cd client
npm install recharts zustand tailwindcss @tailwindcss/vite
```

**Installation (server-side additions to root package.json):**
```bash
npm install fastify @fastify/static @fastify/cors
```

---

## Architecture Patterns

### Recommended Project Structure

```
stressCortex/
├── src/
│   ├── server/
│   │   ├── index.ts           # Fastify app factory (createServer)
│   │   ├── routes/
│   │   │   ├── test.ts        # POST /api/test/start, stop, GET /api/test/status
│   │   │   └── events.ts      # GET /api/events (SSE endpoint)
│   │   ├── sse-bridge.ts      # Subscribes to eventBus, batches, pushes to SSE clients
│   │   └── test-controller.ts # Wraps manager + metrics — start/stop/status lifecycle
│   ├── core/
│   ├── api/
│   ├── conversation/
│   ├── metrics/
│   ├── types/
│   └── index.ts               # Updated: starts server, server starts test (not standalone)
└── client/
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── ConfigPanel.tsx       # Inputs + start/stop buttons
    │   │   ├── LatencyChart.tsx      # Recharts LineChart p50/p95/p99
    │   │   ├── TokenChart.tsx        # Recharts AreaChart stacked
    │   │   ├── ErrorPanel.tsx        # Error count cards
    │   │   ├── ThroughputPanel.tsx   # Numeric req/s + tok/s
    │   │   ├── ConversationTable.tsx # Scrollable live rows
    │   │   └── SummaryPanel.tsx      # Post-test summary cards
    │   ├── store/
    │   │   └── useTestStore.ts       # Zustand store: testState, convRows, chartData, summary
    │   ├── hooks/
    │   │   └── useSSE.ts             # EventSource hook with reconnect
    │   ├── main.tsx
    │   └── index.css                 # @import "tailwindcss" + @custom-variant dark
    ├── index.html
    ├── vite.config.ts
    └── tsconfig.json
```

### Pattern 1: SSE Bridge (server-side batching)

**What:** A class that subscribes to the existing TypedEventEmitter bus, accumulates events in a queue, and flushes them to all connected SSE response streams every 200ms.

**When to use:** Any time you have a high-frequency internal event bus and need to throttle updates to browser clients.

**Example:**
```typescript
// src/server/sse-bridge.ts
// Source: Pattern derived from Fastify SSE docs + batching pattern

import { eventBus } from '../core/event-bus.js';
import type { IncomingMessage, ServerResponse } from 'http';

interface SseClient {
  res: ServerResponse<IncomingMessage>;
}

export class SseBridge {
  private clients = new Set<SseClient>();
  private queue: unknown[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  start(): void {
    // Subscribe to all relevant events
    eventBus.on('conversation:start', (evt) => this.enqueue({ type: 'conversation:start', ...evt }));
    eventBus.on('conversation:turn:complete', (evt) => this.enqueue({ type: 'conversation:turn:complete', ...evt }));
    eventBus.on('conversation:complete', (evt) => this.enqueue({ type: 'conversation:complete', ...evt }));
    eventBus.on('test:lifecycle', (evt) => this.enqueue({ type: 'test:lifecycle', ...evt }));
    eventBus.on('metrics:summary', (evt) => this.enqueue({ type: 'metrics:summary', ...evt }));

    // Flush queue every 200ms (SERV-03)
    this.flushInterval = setInterval(() => this.flush(), 200);
  }

  addClient(res: ServerResponse<IncomingMessage>): void {
    const client: SseClient = { res };
    this.clients.add(client);
    res.on('close', () => this.clients.delete(client));
  }

  private enqueue(event: unknown): void {
    this.queue.push(event);
  }

  private flush(): void {
    if (this.queue.length === 0 || this.clients.size === 0) return;
    const batch = this.queue.splice(0); // drain queue atomically
    const payload = `data: ${JSON.stringify(batch)}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

export const sseBridge = new SseBridge();
```

### Pattern 2: SSE Route with reply.raw

**What:** Fastify route that writes SSE headers directly and registers the response with the SSE bridge.

**When to use:** Simple local-only SSE with no auth or CORS complications. `reply.raw` skips Fastify hooks but is standard practice for SSE in Fastify when you don't need hook processing on the streaming route.

**Example:**
```typescript
// src/server/routes/events.ts
// Source: Fastify reply.raw pattern — fastify.dev/docs/latest/Reference/Reply/

import type { FastifyInstance } from 'fastify';
import { sseBridge } from '../sse-bridge.js';

export async function eventsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      // Allow CORS during dev (when client on :5173 hits server on :3001)
      'Access-Control-Allow-Origin': '*',
    });
    sseBridge.addClient(reply.raw);
    // Keep connection alive — do not return/end
    await new Promise<void>((resolve) => {
      reply.raw.on('close', resolve);
    });
  });
}
```

### Pattern 3: Fastify Server Factory (ESM + TypeScript)

**What:** A function that creates and configures the Fastify instance, registers plugins, and returns it without listening — testable.

**When to use:** ESM project with TypeScript. Node.js v20 + `"type": "module"` in package.json means no `__dirname`; use `import.meta.dirname` (Node 21.2+) or `fileURLToPath(import.meta.url)`.

**Example:**
```typescript
// src/server/index.ts
// Source: Fastify ESM pattern — dev.to/hypeddev/es-modules-in-fastify-349f

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { fileURLToPath } from 'url';
import path from 'path';
import { testRoutes } from './routes/test.js';
import { eventsRoute } from './routes/events.js';
import { sseBridge } from './sse-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createServer() {
  const fastify = Fastify({
    logger: false, // Use pino directly; avoid double-logging
  });

  // CORS — permissive for local dev tool
  await fastify.register(fastifyCors, { origin: true });

  // REST routes
  await fastify.register(testRoutes);
  await fastify.register(eventsRoute);

  // Serve compiled React SPA
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../../client/dist'),
    prefix: '/',
  });

  // SPA catch-all: any unmatched GET → index.html
  fastify.setNotFoundHandler((request, reply) => {
    reply.sendFile('index.html');
  });

  // Start SSE bridge
  sseBridge.start();

  return fastify;
}
```

### Pattern 4: Zustand Store for Dashboard State

**What:** Single Zustand store with slices for test config, test status, per-conversation rows, chart data, and summary.

**When to use:** React components that need to subscribe to specific parts of state without triggering full re-renders. Zustand's selector pattern prevents unnecessary renders.

**Example:**
```typescript
// client/src/store/useTestStore.ts
// Source: Zustand TypeScript guide — github.com/pmndrs/zustand

import { create } from 'zustand';
import type { TestSummary } from '../../../src/types/metrics.js';

export type ConvStatus = 'idle' | 'active' | 'completed' | 'errored';

export interface ConvRow {
  conversationId: number;
  status: ConvStatus;
  currentTurn: number;
  turnsTotal: number;
  lastLatencyMs: number;
  totalTokens: number;
  errors: number;
}

export interface LatencyPoint {
  time: number; // epoch ms or turn sequence
  p50: number;
  p95: number;
  p99: number;
}

export interface TokenPoint {
  time: number;
  promptTokens: number;
  completionTokens: number;
}

export interface TestConfig {
  numConversations: number;
  turnsPerConversation: number;
  concurrency: number;
}

export type TestStatus = 'idle' | 'running' | 'stopping' | 'stopped';

interface TestStore {
  config: TestConfig;
  testStatus: TestStatus;
  convRows: Map<number, ConvRow>;
  latencyHistory: LatencyPoint[];
  tokenHistory: TokenPoint[];
  errorCounts: Record<string, number>;
  summary: TestSummary | null;

  setConfig: (cfg: Partial<TestConfig>) => void;
  setTestStatus: (s: TestStatus) => void;
  upsertConvRow: (row: Partial<ConvRow> & { conversationId: number }) => void;
  appendLatencyPoint: (pt: LatencyPoint) => void;
  appendTokenPoint: (pt: TokenPoint) => void;
  incrementError: (type: string) => void;
  setSummary: (s: TestSummary) => void;
  reset: () => void;
}

export const useTestStore = create<TestStore>((set, get) => ({
  config: { numConversations: 5, turnsPerConversation: 5, concurrency: 5 },
  testStatus: 'idle',
  convRows: new Map(),
  latencyHistory: [],
  tokenHistory: [],
  errorCounts: {},
  summary: null,

  setConfig: (cfg) => set((s) => ({ config: { ...s.config, ...cfg } })),
  setTestStatus: (testStatus) => set({ testStatus }),

  upsertConvRow: (partial) => set((s) => {
    const rows = new Map(s.convRows);
    const existing = rows.get(partial.conversationId) ?? {
      conversationId: partial.conversationId,
      status: 'idle' as ConvStatus,
      currentTurn: 0, turnsTotal: 0, lastLatencyMs: 0, totalTokens: 0, errors: 0,
    };
    rows.set(partial.conversationId, { ...existing, ...partial });
    return { convRows: rows };
  }),

  appendLatencyPoint: (pt) => set((s) => ({ latencyHistory: [...s.latencyHistory, pt] })),
  appendTokenPoint: (pt) => set((s) => ({ tokenHistory: [...s.tokenHistory, pt] })),
  incrementError: (type) => set((s) => ({
    errorCounts: { ...s.errorCounts, [type]: (s.errorCounts[type] ?? 0) + 1 },
  })),
  setSummary: (summary) => set({ summary }),
  reset: () => set({
    testStatus: 'idle', convRows: new Map(), latencyHistory: [], tokenHistory: [],
    errorCounts: {}, summary: null,
  }),
}));
```

### Pattern 5: SSE Client Hook (React)

**What:** `useEffect`-based hook that creates an `EventSource`, parses batched JSON arrays from the bridge, and dispatches events to Zustand.

**When to use:** Any component that needs to receive live updates. Keep a single hook mounted at the App level.

**Example:**
```typescript
// client/src/hooks/useSSE.ts
// Source: EventSource browser API + React pattern from multiple 2025 sources

import { useEffect, useRef } from 'react';
import { useTestStore } from '../store/useTestStore.js';

const SSE_URL = '/api/events';

export function useSSE(): void {
  const esRef = useRef<EventSource | null>(null);
  const store = useTestStore();

  useEffect(() => {
    function connect() {
      const es = new EventSource(SSE_URL);
      esRef.current = es;

      es.onmessage = (evt) => {
        try {
          const batch = JSON.parse(evt.data) as Array<{ type: string; [key: string]: unknown }>;
          for (const event of batch) {
            handleEvent(event, store);
          }
        } catch {
          // malformed event — ignore
        }
      };

      es.onerror = () => {
        es.close();
        // Reconnect after 2s (Claude's discretion — reconnection strategy)
        setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      esRef.current?.close();
    };
  }, []); // intentionally empty — mount once
}

function handleEvent(event: { type: string; [key: string]: unknown }, store: ReturnType<typeof useTestStore.getState>): void {
  // Dispatch to Zustand based on event type
  // (detailed dispatching in implementation)
}
```

### Pattern 6: Recharts Live LineChart

**What:** LineChart from Recharts that re-renders when the `latencyHistory` array in Zustand updates. React state drives re-render; Recharts handles SVG diffing.

**Example:**
```tsx
// client/src/components/LatencyChart.tsx
// Source: Recharts LineChart API — recharts.github.io/en-US/api/

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTestStore } from '../store/useTestStore.js';

export function LatencyChart() {
  const data = useTestStore((s) => s.latencyHistory);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="time" hide />
        <YAxis unit="ms" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: '#1F2937', border: 'none' }} />
        <Legend />
        <Line type="monotone" dataKey="p50" stroke="#3B82F6" dot={false} name="p50" />
        <Line type="monotone" dataKey="p95" stroke="#F59E0B" dot={false} name="p95" />
        <Line type="monotone" dataKey="p99" stroke="#EF4444" dot={false} name="p99" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 7: Recharts Stacked AreaChart

**What:** AreaChart with two Area components sharing the same `stackId` to produce stacked prompt + completion token visualization.

**Example:**
```tsx
// client/src/components/TokenChart.tsx
// Source: Recharts StackedAreaChart example — recharts.github.io/en-US/examples/StackedAreaChart/

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTestStore } from '../store/useTestStore.js';

export function TokenChart() {
  const data = useTestStore((s) => s.tokenHistory);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="time" hide />
        <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: '#1F2937', border: 'none' }} />
        <Area type="monotone" dataKey="promptTokens" stackId="1" stroke="#3B82F6" fill="#1D4ED8" name="Prompt" />
        <Area type="monotone" dataKey="completionTokens" stackId="1" stroke="#10B981" fill="#065F46" name="Completion" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 8: Tailwind v4 Dark Mode CSS

**What:** Tailwind v4 requires `@custom-variant` in CSS instead of `darkMode: 'class'` in a config file.

**Example:**
```css
/* client/src/index.css */
@import "tailwindcss";

/* Class-based dark mode — add 'dark' class to <html> */
@custom-variant dark (&:where(.dark, .dark *));
```

In `main.tsx`, apply dark class permanently (tool is always dark):
```tsx
document.documentElement.classList.add('dark');
```

### Pattern 9: TestController (Refactor of src/index.ts)

**What:** The current CLI entry-point must become an injectable controller. The server needs to call `start()` and `stop()` on demand; multiple test runs must be possible without restarting the server process.

**Critical:** `MetricsCollector` and `ConversationManager` must be re-created fresh for each test run to reset state. The current global `main()` function cannot be reused.

**Example:**
```typescript
// src/server/test-controller.ts
import { validateConfig } from '../core/config.js';
import { createCortexClient } from '../api/client.js';
import { createConversationManager } from '../conversation/index.js';
import { MetricsCollector } from '../metrics/index.js';
import { eventBus } from '../core/event-bus.js';
import type { TestSummary } from '../types/metrics.js';

export type ControllerStatus = 'idle' | 'running' | 'stopping';

export class TestController {
  private status: ControllerStatus = 'idle';
  private manager: ReturnType<typeof createConversationManager> | null = null;
  private collector: MetricsCollector | null = null;

  getStatus(): ControllerStatus { return this.status; }

  async start(params: { numConversations: number; turnsPerConversation: number; rampUpDelayMs?: number }): Promise<void> {
    if (this.status !== 'idle') throw new Error('Test already running');
    this.status = 'running';

    const config = validateConfig();
    const cortex = createCortexClient(config);
    this.collector = new MetricsCollector();
    this.manager = createConversationManager({ ...params, makeRequest: cortex.makeRequest as never });

    // Run async — don't await here, server returns 202
    void this.manager.start().then(() => {
      const summary = this.collector!.getSummary();
      eventBus.emit('metrics:summary', { summary, timestamp: Date.now() });
      this.collector!.destroy();
      this.collector = null;
      this.manager = null;
      this.status = 'idle';
    });
  }

  async stop(): Promise<void> {
    if (this.status !== 'running' || !this.manager) return;
    this.status = 'stopping';
    await this.manager.stop();
  }
}

export const testController = new TestController();
```

### Anti-Patterns to Avoid

- **Polling from browser:** Never use `setInterval + fetch` on the client for live updates. SSE is already implemented.
- **Re-creating EventSource on every render:** Mount `useSSE` at App level once; do not call it per-component.
- **Mutable Zustand Maps causing stale renders:** Wrap Map mutations in spread: `new Map(s.convRows)` before `.set()` to trigger React re-renders.
- **Serving client `dist` before it's built:** Document that `npm run build` in `client/` must precede server start in production mode. In dev mode, run Vite dev server on :5173 with proxy to :3001.
- **`reply.raw` + Fastify hooks conflict:** When using `reply.raw.writeHead`, do NOT also set headers via `reply.header()` — they will conflict. Use one path consistently.
- **Forgetting `Connection: keep-alive` in proxy:** Nginx/reverse proxies may buffer SSE. For local-only tool this is not an issue, but document it.
- **Stale MetricsCollector:** The collector subscribes to the global eventBus on construction. If `destroy()` is not called after a test, listeners accumulate. Always call `collector.destroy()` in the run-complete callback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG charts | Custom D3/SVG rendering | Recharts | Handles axis scaling, responsive containers, SVG diffing — dozens of edge cases |
| SSE event framing | Custom `data: ...\n\n` serializer | Use the standard `data: JSON\n\n` pattern | SSE spec is simple but easy to get wrong (missing double newline, encoding) |
| Client state management | React Context + reducers | Zustand | Map-based convRows in Context causes full-tree re-renders |
| CSS utility framework | Hand-written BEM CSS | Tailwind v4 | Dark theme with semantic colors done faster; consistent spacing system |
| Static file serving with SPA fallback | Custom Fastify route for every path | `@fastify/static` + `setNotFoundHandler` | MIME types, caching, range requests handled |
| EventSource reconnection | Custom retry loop | Browser's native EventSource auto-reconnect (or simple setTimeout in onerror) | EventSource reconnects automatically; just handle `onerror` for manual backoff |

**Key insight:** The chart and SSE are the most "build it once, get it right" problems. Recharts handles the complex SVG/axis work; the SSE bridge is the one truly custom piece, and it's ~50 lines of clear code.

---

## Common Pitfalls

### Pitfall 1: @fastify/static v11 Requirement for Fastify v5

**What goes wrong:** Installing `@fastify/static@^8` or `@fastify/cors@^9` (Fastify v4 versions) causes runtime registration error: "fastify-plugin: expected '4.x' fastify version, '5.x' is installed".

**Why it happens:** STATE.md documents "Fastify v5 requires all plugins at version >=10" — but npm may install older versions if semver is loose.

**How to avoid:** Pin `@fastify/static@^11`, `@fastify/cors@^10` explicitly. Run `fastify --version` and check ecosystem page at fastify.dev/ecosystem for current plugin compatibility matrix.

**Warning signs:** Error message during `fastify.register()` mentioning version mismatch.

### Pitfall 2: `__dirname` Not Available in ESM

**What goes wrong:** `path.join(__dirname, '../client/dist')` throws `ReferenceError: __dirname is not defined` because the project is `"type": "module"`.

**Why it happens:** `__dirname` and `__filename` are CJS globals unavailable in ESM.

**How to avoid:** Use `import.meta.dirname` (Node 21.2+) or the portable fallback:
```typescript
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Warning signs:** `ReferenceError: __dirname is not defined` at server startup.

### Pitfall 3: Zustand Map Mutation Doesn't Trigger Re-Render

**What goes wrong:** Calling `convRows.set(id, row)` directly inside a Zustand setter — because the Map reference doesn't change, React/Zustand won't trigger a re-render for components subscribed to `convRows`.

**Why it happens:** Zustand uses reference equality for change detection. Mutating a Map in-place doesn't change the reference.

**How to avoid:** Always create a new Map: `const rows = new Map(s.convRows); rows.set(...); return { convRows: rows };`

**Warning signs:** Table rows don't update live even though SSE events are arriving.

### Pitfall 4: SSE Connection Blocked by Fastify's Automatic Response Serialization

**What goes wrong:** If the SSE route returns normally, Fastify may try to serialize the response or send a 200 with empty body before the SSE stream completes.

**Why it happens:** Fastify routes that return normally trigger the reply lifecycle. For long-lived SSE connections, you need to keep the connection open indefinitely.

**How to avoid:** Use `reply.raw` approach (no Fastify response lifecycle) OR use the `await new Promise(resolve => reply.raw.on('close', resolve))` pattern to block the async handler while the stream stays open.

**Warning signs:** SSE connection closes immediately after opening; browser receives empty response.

### Pitfall 5: Vite Proxy Not Forwarding SSE

**What goes wrong:** During dev (`vite dev` on :5173, Fastify on :3001), the Vite dev proxy may buffer SSE responses and not forward individual server-sent events in real-time.

**Why it happens:** Some proxy implementations buffer responses. SSE requires streaming (no buffering).

**How to avoid:** Add `ws: true` or ensure `changeOrigin: true` and verify `proxy` config doesn't set response buffering. In practice, Vite's built-in proxy (based on http-proxy) handles SSE correctly without special config, but add explicit headers.

**Warning signs:** SSE works when connecting directly to :3001 but not through :5173.

### Pitfall 6: Recharts Chart Not Updating Despite State Change

**What goes wrong:** Chart appears frozen even though `latencyHistory` array is growing in Zustand.

**Why it happens:** If the component subscribes to `useTestStore()` without a selector, it re-renders on every store change (possibly correct but noisy). If it uses a bad selector that returns the same reference, updates are skipped.

**How to avoid:** Use `useTestStore((s) => s.latencyHistory)` — the selector returns the array reference which changes each time a new point is appended (because we spread to a new array). Do NOT mutate the existing array with `.push()`.

**Warning signs:** Chart shows initial data but stops updating mid-test.

### Pitfall 7: testController Is a Module Singleton — Multiple Concurrent Test Runs Unsafe

**What goes wrong:** If two API calls to `POST /api/test/start` arrive before the first test finishes, the second will silently overwrite `this.manager`.

**Why it happens:** The singleton pattern is simple but not concurrent-safe.

**How to avoid:** Check `this.status !== 'idle'` and return 409 Conflict. The UI disables the Start button while running, so this is a defense-in-depth measure.

**Warning signs:** Two tests running simultaneously with interleaved metrics.

---

## Code Examples

Verified patterns from official sources and current documentation:

### Fastify v5 App Bootstrap (ESM + TypeScript)
```typescript
// Source: fastify.dev + dev.to/hypeddev/es-modules-in-fastify-349f
import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/ping', async () => ({ pong: 'it worked!' }));

await fastify.listen({ port: 3001, host: '127.0.0.1' });
```

### @fastify/static Registration (SPA mode)
```typescript
// Source: github.com/fastify/fastify-static
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'client/dist'),
  prefix: '/',
});

// SPA fallback — must be after static registration
fastify.setNotFoundHandler((_req, reply) => {
  reply.sendFile('index.html');
});
```

### Tailwind v4 Vite Plugin Config
```typescript
// client/vite.config.ts
// Source: tailwindcss.com/docs + tailkits.com/blog/install-tailwind-css-with-vite/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../client/dist', // relative to vite.config.ts location
  },
});
```

### Tailwind v4 CSS Entry
```css
/* client/src/index.css */
/* Source: tailwindcss.com/docs/dark-mode */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));
```

### Zustand TypeScript Create Pattern
```typescript
// Source: github.com/pmndrs/zustand/blob/main/docs/guides/beginner-typescript.md
import { create } from 'zustand';

interface StoreState {
  count: number;
  increment: () => void;
}

const useStore = create<StoreState>()((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}));
```

### EventSource Client (React hook skeleton)
```typescript
// Source: oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view
import { useEffect } from 'react';

function useSSE(url: string, onMessage: (data: unknown) => void) {
  useEffect(() => {
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [url]);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind PostCSS config (`tailwind.config.js`) | `@tailwindcss/vite` plugin + `@import "tailwindcss"` | Tailwind v4 (Jan 2025) | No config file needed; `darkMode: 'class'` replaced with `@custom-variant` |
| `darkMode: 'class'` in tailwind config | `@custom-variant dark (&:where(.dark, .dark *))` in CSS | Tailwind v4 | CSS-first configuration |
| CJS `require('fastify')` | ESM `import Fastify from 'fastify'` | Project-wide ESM decision | Already enforced by `"type": "module"` in package.json |
| `Fastify({ logger })` with logger instance | `Fastify({ loggerInstance })` | Fastify v5 | Minor — affects Fastify logger init only |
| Zustand `create()` with no generics | `create<State>()()` (double call) | Zustand v4+ | TypeScript inference requires the double invocation |

**Deprecated/outdated:**
- `fastify-plugin` v3/v4 for ecosystem plugins: replaced by v10+ equivalents for Fastify v5
- `req.connection`: replaced by `req.socket` in Fastify v5
- `request.routeSchema`: replaced by `request.routeOptions` in Fastify v5

---

## Open Questions

1. **SSE via `reply.raw` vs. Readable stream**
   - What we know: `reply.raw` works and is widely used for SSE; Readable stream via `reply.send` is hooks-safe but more complex
   - What's unclear: Whether @fastify/cors headers are needed on the SSE endpoint (for dev proxy, the browser connects to :5173 which proxies to :3001 — same origin in practice)
   - Recommendation: Use `reply.raw` with explicit CORS header on the SSE route. Simple, proven pattern for local tools.

2. **Latency chart data shape: time-based vs. turn-based**
   - What we know: `ConversationTurnCompleteEvent` has `turnNumber` and `timestamp`. Multiple conversations complete turns at different times.
   - What's unclear: Should the x-axis be wall-clock time (absolute timestamps) or a sequence counter?
   - Recommendation: Use a sequence counter (incrementing integer per SSE flush) for the x-axis — simpler and avoids axis label crowding. For post-test summary, wall-clock duration is shown as a number, not a chart axis.

3. **Client TypeScript sharing types with server**
   - What we know: `TestSummary`, `ConversationTurnCompleteEvent` etc. are in `src/types/`. The client is in `client/` which is excluded from the server tsconfig.
   - What's unclear: Whether to import from `../src/types/` using relative paths in the client tsconfig, or copy/duplicate types.
   - Recommendation: Use relative imports from the client into `../src/types/*.ts` — keep types as the single source of truth. The client tsconfig should include `../src/types` in `paths` or use `include: ['src/**/*', '../src/types/**/*']`. This is cleaner than duplication.

4. **Fastify v5 Node.js 24 compatibility**
   - What we know: Fastify v5 docs state minimum Node.js v20; the project runs on Node 24 LTS (from STATE.md).
   - What's unclear: Whether any specific Fastify v5 feature regressed on Node 24.
   - Recommendation: No known issues; Node 24 is a superset of Node 20 requirements. Proceed normally.

---

## Sources

### Primary (HIGH confidence)
- [Fastify v5 Migration Guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/) — plugin version requirements, `loggerInstance`, `req.socket`, `request.routeOptions`
- [Fastify Reply Reference](https://fastify.dev/docs/latest/Reference/Reply/) — `reply.raw`, `reply.hijack`, streaming behavior
- [Tailwind CSS Dark Mode Docs](https://tailwindcss.com/docs/dark-mode) — `@custom-variant` class-based dark mode in v4
- [Recharts API Reference](https://recharts.github.io/en-US/api/) — AreaChart, LineChart, Area, Line component props
- [Zustand TypeScript Guide](https://github.com/pmndrs/zustand/blob/main/docs/guides/beginner-typescript.md) — `create<State>()()` pattern

### Secondary (MEDIUM confidence)
- [Using ES Modules with Fastify](https://dev.to/hypeddev/es-modules-in-fastify-349f) — ESM import syntax, `__dirname` equivalent
- [Tailwind v4 Vite Setup Guide](https://tailkits.com/blog/install-tailwind-css-with-vite/) — `@tailwindcss/vite` plugin configuration
- [Avoid Fastify reply.raw](https://lirantal.com/blog/avoid-fastify-reply-raw-and-reply-hijack-despite-being-a-powerful-http-streams-tool) — CORS headers bypass risk, Readable stream alternative
- [How to Implement SSE in React (2026)](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view) — EventSource hook pattern

### Tertiary (LOW confidence — needs validation)
- Fastify v5 + Node 24 compatibility: no specific confirmation found, inferred from Node 20 minimum requirement
- `@fastify/static` v11 exact version for Fastify v5 compatibility: inferred from "plugins >=10" rule in STATE.md; verify npm page before install

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed by official Fastify v5 migration guide, Tailwind v4 docs, Recharts API, Zustand TypeScript guide
- Architecture: HIGH — EventBus + SSE bridge pattern is well-established; TestController refactor is clear from existing code structure
- Pitfalls: HIGH — ESM `__dirname`, Map mutation, plugin versions all verified by official sources or direct code inspection of the existing project
- SSE implementation detail: MEDIUM — `reply.raw` pattern confirmed by multiple sources; exact behavior with Fastify v5 hooks validated by official docs

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (30 days — Fastify and Tailwind release frequently, verify plugin versions at install time)
