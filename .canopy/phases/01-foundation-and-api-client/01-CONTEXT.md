# Phase 1: Foundation and API Client - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

TypeScript project scaffolding, typed event bus, and a verified single-turn call to the Cortex API with correct latency measurement (`performance.now()`), token parsing (`usage.prompt_tokens`, `usage.completion_tokens`), and error classification (429/5xx/4xx/timeout). This phase produces a working backend skeleton — no conversation loop, no concurrency, no UI.

</domain>

<decisions>
## Implementation Decisions

### API Client Configuration
- Use `openai` SDK v6 with `baseURL` set to `https://cortex.nfinitmonkeys.com`
- Model name: `"default"` (confirmed working via live API test)
- API key read from `CORTEX_API_KEY` env var via `dotenv`
- Non-streaming mode for v1 (confirmed: API returns complete JSON with `usage` field)
- Fail fast with clear error message if API key is missing — no stack trace

### Latency Measurement
- Use `performance.now()` before and after each API call for high-resolution timing
- Store as milliseconds with decimal precision (e.g., `342.17ms`)
- No event loop lag correction needed in Phase 1 (single request, no concurrency)

### Error Classification
- Four error types: `rate_limited` (429), `server_error` (5xx), `client_error` (4xx), `timeout`
- Parse `Retry-After` header from 429 responses for backoff
- Log error type, status code, and response body (truncated) in structured logs

### Event Bus Design
- Singleton Node.js `EventEmitter` with typed events
- Events: `api:request`, `api:response`, `api:error` for Phase 1
- Additional conversation/test events added in Phase 2

### Logging
- Use `pino` for structured JSON logging
- Log each API call with: latency, tokens, model, error type (if any)
- Human-readable transport for development (`pino-pretty`)

### Project Structure
- Monorepo-style: `src/` for backend engine, `client/` for React dashboard (Phase 4)
- Entry point: `src/index.ts` — runs a single test call to verify setup
- Package manager: npm
- TypeScript strict mode

### Claude's Discretion
- Exact TypeScript configuration (tsconfig.json settings)
- Zod schema design for API response validation
- pino log levels and formatting details
- Event type naming conventions
- File/folder organization within `src/`

</decisions>

<specifics>
## Specific Ideas

- API key is already in `.env` file: `CORTEX_API_KEY=sk-cortex-GSrvMQq-3UwCOOnYUxatMxxmxL1y2FKrjqArTkx-D0Q`
- Verified API response format: `{"id":"...","object":"chat.completion","created":...,"model":"default","choices":[{"message":{"role":"assistant","content":"..."}}],"usage":{"prompt_tokens":29,"total_tokens":88,"completion_tokens":59}}`
- Health check available at `GET /health` → `{"status":"ok","service":"cortex"}`
- `npm start` should run a single-turn API call and print the result with latency and token info

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-and-api-client*
*Context gathered: 2026-02-26*
