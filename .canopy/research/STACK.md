# Stack Research

**Domain:** Local API stress testing tool with real-time web UI dashboard
**Researched:** 2026-02-26
**Confidence:** HIGH

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24.x LTS (Krypton) | Runtime | LTS as of Feb 2026; built-in `fetch`, `ReadableStream`, and `AbortController` — no polyfills needed for HTTP streaming. Confirmed via nodejs.org release index. |
| TypeScript | 5.9.3 | Type safety | Current stable; strict mode eliminates entire classes of runtime bugs in concurrent async code. No reason to use plain JS for a new project in 2025+. |
| tsx | 4.21.0 | TypeScript runner (dev) | Runs `.ts` files directly via esbuild under the hood. Zero config, fast startup, supports watch mode (`tsx watch`). Replaces `ts-node` which has persistent ESM/CJS compatibility issues. |
| openai SDK | 6.25.0 | HTTP client for LLM gateway | Official SDK with `baseURL` option (confirmed in `ClientOptions` type def) — works with any OpenAI-compatible endpoint including Cortex. Built-in streaming via `AsyncIterable<Stream<T>>` using SSE. No lower-level HTTP wiring needed. |
| Fastify | 5.7.4 | Local backend server | Serves the control API, SSE stream to UI, and static files. 2-3x faster than Express in benchmarks; full TypeScript support; plugin ecosystem covers CORS, static files, and WebSocket. Simpler than setting up a raw `http.createServer`. |
| Vite | 7.3.1 | Frontend build / dev server | Standard for React+TS in 2025. HMR makes dashboard iteration fast. Dev proxy routes `/api` calls to Fastify, eliminating CORS issues entirely during development. |
| React | 19.2.4 | Dashboard UI framework | Current stable. Concurrent rendering and `useTransition` handle high-frequency metric updates without jank. |
| Tailwind CSS | 4.2.1 | Dashboard styling | v4 is production-stable. Use `@tailwindcss/vite` plugin (v4.2.1) — no `tailwind.config.js` needed; configured via CSS `@theme` directives instead. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| p-queue | 9.1.0 | Concurrency control for conversation spawning | Use over `p-limit` because p-queue supports dynamic addition, pause/resume, and per-queue priority — critical when the user changes concurrency mid-test. ESM-only (matches Node 24 + tsx setup). |
| Recharts | 3.7.0 | Latency/throughput charts in dashboard | React-native (no imperative Chart.js lifecycle management). Supports `<ResponsiveContainer>` for live data updates. Peer dep confirmed: supports React 16–19. |
| Zustand | 5.0.11 | Frontend state management | Single store holds all test state (conversations, metrics, status). Zero boilerplate vs Redux. Works well with high-frequency updates from SSE. |
| pino | 10.3.1 | Structured logging in backend | JSON-first logger, 5-10x faster than console.log under load. Captures per-turn latency, errors, and token counts as structured fields. Use `pino-pretty` in dev. |
| pino-pretty | 13.1.3 | Human-readable log output (dev only) | Formats pino JSON to colored terminal output in dev. Dev dependency only. |
| zod | 4.3.6 | Runtime validation of config and API responses | Validates user config (concurrency, turns, API key) at startup. Also validates API response shapes — important since Cortex may diverge from strict OpenAI spec. |
| dotenv | 17.3.1 | Environment variable loading | Standard .env loading for `CORTEX_API_KEY` and base URL. Simple, zero-dependency. |
| concurrently | 9.2.1 | Run backend + frontend dev servers together | `npm run dev` starts both Fastify (port 3001) and Vite (port 5173) simultaneously. Dev dependency only. |
| @fastify/cors | 11.2.0 | CORS headers for local dev | Needed when the Vite dev server (5173) calls Fastify (3001) directly, as a fallback if Vite proxy isn't used. |
| @fastify/static | 9.0.0 | Serve built frontend from Fastify | In production (local) mode: Fastify serves the `dist/` folder so the user runs one process. |
| @fastify/websocket | 11.2.0 | WebSocket support (optional) | Use only if SSE proves insufficient for bidirectional control (e.g., pause/resume commands). Prefer SSE for simplicity — it's unidirectional and works through proxies without special handling. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx watch | Backend hot-reload in dev | `tsx watch src/server/index.ts` — reloads on file change. Faster than nodemon + ts-node. |
| Vite dev proxy | Route `/api` to Fastify | In `vite.config.ts`: `server.proxy['/api'] = 'http://localhost:3001'`. Eliminates CORS in dev. |
| @vitejs/plugin-react | React Fast Refresh in Vite | Required for HMR in React. Version 5.1.4. |
| @types/node | 25.3.2 | Node.js type definitions | Required for TypeScript to resolve `process`, `Buffer`, etc. in backend code. |
| vitest | 4.0.18 | Unit testing | Native Vite integration; same transform pipeline as the app. Use for testing conversation engine logic and metric calculations. |

---

## Installation

```bash
# Backend runtime dependencies
npm install openai fastify @fastify/cors @fastify/static @fastify/websocket \
  p-queue pino dotenv zod

# Frontend runtime dependencies
npm install react react-dom recharts zustand

# Dev dependencies
npm install -D typescript tsx vite @vitejs/plugin-react @tailwindcss/vite \
  tailwindcss pino-pretty concurrently vitest \
  @types/node @types/react @types/react-dom
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP Client | openai SDK v6 | undici directly | undici v7 is not installed as a standalone package in Node 24 (bundled internally). openai SDK wraps native fetch with retry, timeout, streaming, and typed responses — saves hundreds of lines of manual SSE parsing. |
| HTTP Client | openai SDK v6 | Vercel AI SDK (`ai` v6) | AI SDK is excellent for building AI-powered apps but adds abstraction for providers (OpenAI, Anthropic, etc.) that isn't needed here. We target one specific OpenAI-compatible endpoint; the openai SDK is the right layer. |
| Concurrency | p-queue | p-limit | p-limit v7 is simpler (wrap a function, cap concurrent calls) but lacks pause/resume and dynamic concurrency changes. p-queue is the right primitive when test parameters change mid-run. |
| Backend Server | Fastify | Express | Express 5 (finally released) is still slower and has worse TypeScript support. Fastify v5 has full TypeScript types, faster JSON serialization, and a cleaner plugin model. For a local tool, the performance difference is secondary, but Fastify's structured logging integration with pino is a direct benefit. |
| Backend Server | Fastify | Hono | Hono (4.12.3) targets edge runtimes and is excellent for Cloudflare Workers. For a local Node.js server with SSE and file serving, Fastify's ecosystem is more complete. |
| Frontend Build | Vite | esbuild directly | esbuild is fast but has no HMR, no dev proxy, and no React refresh support out of the box. Vite uses esbuild internally and adds everything needed. |
| Charting | Recharts | Chart.js | Chart.js requires imperative update calls (`chart.update()`) and wrapping in `useEffect`. Recharts is declarative React — pass new data as props and it re-renders. Dramatically simpler for a real-time dashboard. |
| Charting | Recharts | ApexCharts | ApexCharts is feature-rich but heavy (400KB+). Recharts is smaller and fits the data we need (line charts for latency, bar for throughput). |
| State Management | Zustand | React Context + useReducer | Context causes full subtree re-renders on every metric update. Zustand's selector-based subscriptions re-render only components that read changed slices. Essential for a dashboard receiving 10+ updates/second. |
| TypeScript Runner | tsx | ts-node | ts-node has persistent ESM/CJS interop issues, slower startup, and requires `tsconfig.json` to be tuned carefully. tsx uses esbuild and "just works" for both CJS and ESM. |
| CSS | Tailwind v4 | Tailwind v3 | v4 is the current stable release. v4 eliminates `tailwind.config.js` and uses `@theme` CSS variables — simpler for a greenfield project. Use `@tailwindcss/vite` plugin instead of PostCSS config. |
| Logging | pino | console.log | Under concurrent load (50+ simultaneous conversations), synchronous `console.log` becomes a bottleneck. pino is async, JSON-structured, and supports log levels — critical for capturing per-turn metrics without distorting latency measurements. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ts-node` | ESM/CJS interop bugs; slow startup; requires `esModuleInterop` gymnastics. Community has shifted to tsx and `bun` for TS execution. | `tsx` |
| `axios` | Adds 400KB+ for HTTP; Node 24 has `fetch` built-in; openai SDK already handles retries and streaming. Axios stream support for SSE is awkward. | `openai` SDK (which uses `fetch` internally) |
| `got` | Same problem as axios — redundant with built-in fetch in Node 24+. | Native `fetch` or `openai` SDK |
| `node-fetch` | Polyfill for environments without native fetch. Node 24 has `fetch` built-in. Using node-fetch introduces a version mismatch with the global `fetch`. | Built-in `fetch` (Node 24+) |
| Redux Toolkit | Massive boilerplate overhead for a local tool. The store shape is simple (test config + array of conversation states + metrics). | Zustand |
| `socket.io` | Adds 300KB+, requires matching client+server packages, and uses its own protocol on top of WebSocket. For a local tool pushing metrics to one browser tab, plain SSE is sufficient. | Fastify + SSE via `reply.raw` |
| `nodemon` + `ts-node` | Slow restart loop; ESM issues; two tools doing one job. | `tsx watch` |
| Chart.js with React | Imperative API fights React's declarative model. Requires `ref`-based chart instances and `useEffect` for every update. | Recharts |
| Persistent database (SQLite, PostgreSQL) | Out of scope per PROJECT.md. Test results live in memory during the run, optionally exported as JSON. Adding a database adds setup friction for a local tool. | In-memory state (Zustand store + Node.js Map) |

---

## Stack Patterns by Variant

**If the Cortex API does NOT stream (returns complete JSON):**
- The openai SDK `client.chat.completions.create()` call works identically — just omit `stream: true`.
- No SSE parsing code needed at all. Simply `await` the response.
- Latency measurement: `Date.now()` before and after the `await`.

**If the Cortex API DOES stream (SSE):**
- Use `client.chat.completions.create({ stream: true })` — SDK handles SSE parsing internally.
- For token-by-token latency: record time-to-first-token separately from total completion time.
- The `Stream<ChatCompletionChunk>` is `AsyncIterable` — iterate with `for await (const chunk of stream)`.

**If concurrency exceeds ~50 simultaneous conversations:**
- Node.js single-threaded event loop handles 50+ concurrent open HTTP connections without issues (these are I/O-bound, not CPU-bound).
- If CPU becomes a bottleneck (unlikely for pure HTTP stress testing), consider `worker_threads` to parallelize conversation engines across cores.
- For initial implementation: single-threaded with p-queue is sufficient and simpler.

**If real-time UI updates lag under high load:**
- Batch metric pushes: instead of SSE event per API response, push batched updates every 250ms using `setInterval`.
- Recharts handles large datasets; keep chart window to last N=500 data points via a sliding window in Zustand.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| React 19.2.4 | Recharts 3.7.0 | Confirmed via recharts peerDeps: `react ^16.8.0 \|\| ^17 \|\| ^18 \|\| ^19` |
| Tailwind CSS 4.2.1 | @tailwindcss/vite 4.2.1 | Same version — must match exactly. Do NOT use PostCSS config with Tailwind v4; use the Vite plugin. |
| Fastify 5.7.4 | @fastify/cors 11.2.0 | Fastify v5 requires plugin versions ≥10. Confirmed via npm. |
| Fastify 5.7.4 | @fastify/static 9.0.0 | Same — v5 compatible. |
| Fastify 5.7.4 | @fastify/websocket 11.2.0 | Same — v5 compatible. |
| p-queue 9.1.0 | ESM only | Both `p-queue` and `p-limit` are ESM-only since major version bumps. Use `"type": "module"` in `package.json` or configure tsx to handle ESM imports (it does by default). |
| openai 6.25.0 | Node.js ≥18 | SDK uses native `fetch`. Node 24 works without any flags. |
| tsx 4.21.0 | TypeScript 5.9.3 | No compatibility issues; tsx transpiles TS via esbuild regardless of TS version. |

---

## Architecture Entrypoint

The project has two distinct runtimes sharing one repository:

```
src/
  server/          ← Fastify backend (Node.js, tsx runtime)
    index.ts       ← Server entry, registers plugins, starts HTTP
    routes/        ← /api/run, /api/status, /api/stream (SSE)
    engine/        ← Conversation runner, concurrency via p-queue
    metrics/       ← In-memory metrics collector
  client/          ← React frontend (Vite build)
    App.tsx
    components/    ← Dashboard panels, charts (Recharts), conversation log
    store/         ← Zustand store, SSE subscription hook
```

`npm run dev` uses `concurrently` to start both Fastify (port 3001) and Vite (port 5173) simultaneously. Vite proxies `/api` to Fastify. For local production mode, `npm run build` emits React to `dist/`, and Fastify serves it via `@fastify/static`.

---

## Sources

- Node.js release index (`https://nodejs.org/dist/index.json`) — confirmed v24.14.0 is current LTS (Krypton, Feb 2026). HIGH confidence.
- `npm info` registry queries for all packages — versions are live from npm registry as of 2026-02-26. HIGH confidence.
- openai SDK v6.25.0 `client.d.ts` (extracted from tarball) — confirms `baseURL?: string` in `ClientOptions`. HIGH confidence.
- openai SDK v6.25.0 `core/streaming.d.ts` (extracted from tarball) — confirms `Stream<Item> implements AsyncIterable<Item>` and `fromSSEResponse`. HIGH confidence.
- recharts `package.json` peerDependencies — confirms React 19 support. HIGH confidence.
- Tailwind CSS v4 versioning from npm — `@tailwindcss/vite` and `tailwindcss` both at 4.2.1. HIGH confidence.
- Fastify plugin version alignment — `@fastify/cors`, `@fastify/static`, `@fastify/websocket` all confirmed v5-compatible via npm. HIGH confidence.
- p-queue `package.json` `"type": "module"` — ESM-only module, requires ESM-aware runner (tsx handles this). HIGH confidence.

---

*Stack research for: StressCortex — API stress testing tool (local web UI)*
*Researched: 2026-02-26*
