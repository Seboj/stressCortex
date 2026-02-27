# Phase 1: Foundation and API Client - Research

**Researched:** 2026-02-26
**Domain:** TypeScript project scaffolding, typed event bus, OpenAI-compatible API client with latency/token/error instrumentation
**Confidence:** HIGH

## Summary

Phase 1 delivers the project skeleton and a verified single-turn call to the Cortex API at `https://cortex.nfinitmonkeys.com`. The scope is narrow but measurement-critical: latency must use `performance.now()`, tokens must be parsed from `usage.prompt_tokens` / `usage.completion_tokens`, and errors must be classified into four types (rate_limited, server_error, client_error, timeout) with Retry-After header respect on 429s. The openai SDK v6 handles the HTTP client with built-in retry support and typed error classes (`RateLimitError`, `APIError`), but automatic retries must be disabled to implement custom classification and backoff logic. The project must be ESM throughout because downstream dependency p-queue v9 is ESM-only.

**Primary recommendation:** Use openai SDK v6 with `maxRetries: 0` to disable built-in retries, wrap calls with custom error classification that reads `error.headers` for `Retry-After`, and emit typed events through a singleton EventEmitter bus with a TypeScript event map interface.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `openai` SDK v6 with `baseURL` set to `https://cortex.nfinitmonkeys.com`
- Model name: `"default"` (confirmed working via live API test)
- API key read from `CORTEX_API_KEY` env var via `dotenv`
- Non-streaming mode for v1 (confirmed: API returns complete JSON with `usage` field)
- Fail fast with clear error message if API key is missing — no stack trace
- Use `performance.now()` before and after each API call for high-resolution timing
- Store latency as milliseconds with decimal precision (e.g., `342.17ms`)
- Four error types: `rate_limited` (429), `server_error` (5xx), `client_error` (4xx), `timeout`
- Parse `Retry-After` header from 429 responses for backoff
- Singleton Node.js `EventEmitter` with typed events
- Events: `api:request`, `api:response`, `api:error` for Phase 1
- Use `pino` for structured JSON logging
- Log each API call with: latency, tokens, model, error type (if any)
- Human-readable transport for development (`pino-pretty`)
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

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUN-01 | TypeScript with strict types for all API contracts, events, and metrics | TSConfig with strict mode, Zod schemas for API responses, typed EventEmitter map |
| FOUN-02 | Read API key from `CORTEX_API_KEY` and fail fast with clear error if missing | dotenv + process.env check at startup, process.exit(1) with message |
| FOUN-03 | Typed events via EventEmitter bus for all conversation and metric updates | Singleton typed EventEmitter with event map interface pattern |
| API-01 | Single-turn chat completion request to Cortex `/v1/chat/completions` | openai SDK v6 `chat.completions.create()` with baseURL |
| API-02 | Per-request latency using `performance.now()` | Wrap API call with before/after timestamps |
| API-03 | Parse `usage.prompt_tokens` and `usage.completion_tokens` | Non-streaming response includes `usage` object directly |
| API-04 | Classify errors: `rate_limited` (429), `server_error` (5xx), `client_error` (4xx), `timeout` | OpenAI SDK error classes + status code inspection |
| API-05 | Respect `Retry-After` header on 429 responses | Access `error.headers['retry-after']` from RateLimitError |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai | ^6.25 | Cortex API client (OpenAI-compatible) | Official SDK; typed responses; `baseURL` for custom endpoints; error class hierarchy |
| pino | ^10 | Structured JSON logging | Fastest Node.js logger; JSON-native; transport-based architecture |
| pino-pretty | ^13 | Development log formatting | Human-readable pino output for dev |
| zod | ^4 | Runtime type validation | Schema-first validation; TypeScript inference; API response validation |
| dotenv | ^16 | Environment variable loading | Standard `.env` file loading for CORTEX_API_KEY |
| tsx | ^4 | TypeScript execution | Replaces ts-node; handles ESM/CJS seamlessly; faster startup |
| typescript | ^5.9 | Type system | Strict mode; latest features |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/node | ^22 | Node.js type definitions | Always — typed EventEmitter, process, performance |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pino | winston | Winston is more feature-rich but 5-10x slower; pino's speed matters under concurrent load |
| zod | ajv | ajv is faster for JSON Schema but zod has superior TypeScript inference |
| tsx | ts-node | ts-node has ESM compatibility issues; tsx just works |
| dotenv | direct env | dotenv provides .env file support for local development |

**Installation:**
```bash
npm install openai pino pino-pretty zod dotenv
npm install -D typescript tsx @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── types/           # Shared TypeScript types and Zod schemas
│   ├── events.ts    # Event map interface for typed EventEmitter
│   ├── api.ts       # API request/response types, error classification
│   └── metrics.ts   # Metric types (latency, tokens, errors)
├── core/            # Core engine components
│   ├── event-bus.ts # Singleton typed EventEmitter
│   ├── logger.ts    # Pino logger configuration
│   └── config.ts    # Environment validation (API key, etc.)
├── api/             # API client layer
│   ├── client.ts    # Cortex API client (openai SDK wrapper)
│   └── errors.ts    # Error classification logic
└── index.ts         # Entry point — single test call
```

### Pattern 1: Typed EventEmitter with Event Map
**What:** Define an interface mapping event names to argument tuples, then use declaration merging or a typed wrapper to get compile-time safety on `.emit()` and `.on()`.
**When to use:** Always — the event bus is the communication backbone for all phases.
**Example:**
```typescript
// Source: @types/node EventEmitter generics (available since 2024)
import { EventEmitter } from 'events';

interface EventMap {
  'api:request': [{ model: string; messages: number; timestamp: number }];
  'api:response': [{ latencyMs: number; promptTokens: number; completionTokens: number; model: string }];
  'api:error': [{ type: 'rate_limited' | 'server_error' | 'client_error' | 'timeout'; statusCode?: number; retryAfterMs?: number }];
}

// Typed wrapper approach
class TypedEventEmitter<T extends Record<string, any[]>> {
  private emitter = new EventEmitter();

  emit<K extends keyof T & string>(event: K, ...args: T[K]): boolean {
    return this.emitter.emit(event, ...args);
  }

  on<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): this {
    this.emitter.on(event, listener as any);
    return this;
  }

  once<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): this {
    this.emitter.once(event, listener as any);
    return this;
  }

  off<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): this {
    this.emitter.off(event, listener as any);
    return this;
  }
}

export const eventBus = new TypedEventEmitter<EventMap>();
```

### Pattern 2: OpenAI SDK with Custom BaseURL and Disabled Retries
**What:** Create the openai client with `baseURL` pointing to Cortex and `maxRetries: 0` so we control retry/backoff logic ourselves.
**When to use:** All API calls — the client is created once at startup.
**Example:**
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.CORTEX_API_KEY,
  baseURL: 'https://cortex.nfinitmonkeys.com/v1',
  maxRetries: 0,  // We handle retries ourselves for classification
});
```

### Pattern 3: Error Classification from SDK Error Classes
**What:** The openai SDK throws typed error classes (`RateLimitError`, `APIError`, etc.) with `.status` and `.headers` properties. Classify errors into the four types using `instanceof` checks and status codes.
**When to use:** Every API call's catch block.
**Example:**
```typescript
import OpenAI from 'openai';

type ErrorType = 'rate_limited' | 'server_error' | 'client_error' | 'timeout';

interface ClassifiedError {
  type: ErrorType;
  statusCode?: number;
  retryAfterMs?: number;
  message: string;
}

function classifyError(error: unknown): ClassifiedError {
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const retryAfter = error.headers?.['retry-after'];
    const retryAfterMs = retryAfter ? parseRetryAfter(retryAfter) * 1000 : undefined;

    if (status === 429) {
      return { type: 'rate_limited', statusCode: status, retryAfterMs, message: error.message };
    }
    if (status >= 500) {
      return { type: 'server_error', statusCode: status, message: error.message };
    }
    return { type: 'client_error', statusCode: status, message: error.message };
  }

  // Network/timeout errors
  if (error instanceof Error && (error.message.includes('timeout') || error.message.includes('ETIMEDOUT'))) {
    return { type: 'timeout', message: error.message };
  }

  return { type: 'client_error', message: String(error) };
}

function parseRetryAfter(value: string): number {
  const seconds = Number(value);
  if (!isNaN(seconds)) return seconds;
  // HTTP-date format
  const date = new Date(value);
  if (!isNaN(date.getTime())) return Math.max(0, (date.getTime() - Date.now()) / 1000);
  return 1; // Fallback
}
```

### Pattern 4: Latency Measurement with performance.now()
**What:** Capture high-resolution timestamps immediately before and after the API call.
**When to use:** Every API call.
**Example:**
```typescript
const startMs = performance.now();
const response = await client.chat.completions.create({ ... });
const latencyMs = performance.now() - startMs;
// latencyMs has sub-millisecond precision (e.g., 342.17)
```

### Anti-Patterns to Avoid
- **Using `Date.now()` for latency:** Only millisecond precision; `performance.now()` gives microsecond precision
- **Letting the SDK auto-retry 429s:** We need to classify and log the original 429, then decide retry strategy ourselves
- **Catching errors silently:** Every error must be classified and emitted on the event bus
- **Importing EventEmitter without typing:** All events must flow through the typed wrapper
- **Using `require()` anywhere:** Project is ESM-only (p-queue v9 dependency in later phases)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for OpenAI API | fetch + manual parsing | openai SDK v6 | Handles auth, retries, types, error classes, streaming — hundreds of edge cases |
| JSON logging | console.log + JSON.stringify | pino v10 | Async I/O, transport architecture, 5x faster, structured metadata |
| API response validation | Manual type assertions | zod v4 | Runtime validation with TypeScript inference; catches API contract changes |
| Environment variable loading | process.env checks | dotenv | .env file support, consistent loading behavior |

**Key insight:** The openai SDK is the most important "don't hand-roll" — it provides typed error classes, header access, and proper HTTP/2 connection handling that would take hundreds of lines to replicate.

## Common Pitfalls

### Pitfall 1: Missing API Key Produces Stack Trace Instead of Clear Error
**What goes wrong:** The openai SDK throws an `AuthenticationError` with a full stack trace when no API key is provided.
**Why it happens:** The error is thrown on first API call, not at client construction.
**How to avoid:** Check `process.env.CORTEX_API_KEY` at startup BEFORE creating the client. Print a human-readable message and `process.exit(1)`.
**Warning signs:** Running `npm start` without the env var shows a multi-line error trace instead of one clean message.

### Pitfall 2: Retry-After Header Not Accessible
**What goes wrong:** The openai SDK's automatic retry logic consumes the 429 before your code sees it.
**Why it happens:** Default `maxRetries` is 2 — the SDK retries silently.
**How to avoid:** Set `maxRetries: 0` on the client. Catch `OpenAI.RateLimitError`, read `error.headers['retry-after']`.
**Warning signs:** You never see 429 errors in logs despite rate limiting actually happening.

### Pitfall 3: ESM/CJS Module Confusion
**What goes wrong:** `require()` calls fail; `.js` extension missing from imports; tsx and tsc disagree on module resolution.
**Why it happens:** Mixed ESM/CJS configuration; p-queue v9 (Phase 2+) is ESM-only.
**How to avoid:** Set `"type": "module"` in package.json. Use `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` in tsconfig. Or use `tsx` which handles both transparently.
**Warning signs:** Runtime errors about `require is not defined` or `ERR_MODULE_NOT_FOUND`.

### Pitfall 4: Event Bus Memory Leak Warning
**What goes wrong:** Node.js warns about possible memory leak after 11 listeners on same event.
**Why it happens:** Default `maxListeners` is 10; multiple subscribers in later phases.
**How to avoid:** Set `emitter.setMaxListeners(50)` or appropriate value on the singleton bus. This is a Phase 1 setup concern even though the actual listeners come in later phases.
**Warning signs:** Console warning: `MaxListenersExceededWarning`.

### Pitfall 5: Timeout Errors Not Classified Correctly
**What goes wrong:** Network timeouts throw generic `Error` not `APIError`, falling through classification.
**Why it happens:** The openai SDK wraps timeout as `APIConnectionError`, which extends `APIError` but may not have a status code.
**How to avoid:** Check for `APIConnectionError` in classification logic; also handle generic `Error` with timeout-related messages.
**Warning signs:** Timeouts logged as `client_error` instead of `timeout`.

## Code Examples

### Complete API Client with Instrumentation
```typescript
// Source: openai SDK v6 README + project research
import OpenAI from 'openai';
import { performance } from 'perf_hooks';
import { eventBus } from './core/event-bus.js';
import { logger } from './core/logger.js';
import { classifyError } from './api/errors.js';

const client = new OpenAI({
  apiKey: process.env.CORTEX_API_KEY,
  baseURL: 'https://cortex.nfinitmonkeys.com/v1',
  maxRetries: 0,
  timeout: 30_000, // 30s timeout
});

export async function makeRequest(messages: OpenAI.ChatCompletionMessageParam[]) {
  eventBus.emit('api:request', {
    model: 'default',
    messages: messages.length,
    timestamp: Date.now(),
  });

  const startMs = performance.now();

  try {
    const response = await client.chat.completions.create({
      model: 'default',
      messages,
    });

    const latencyMs = performance.now() - startMs;
    const usage = response.usage;

    const result = {
      latencyMs: Math.round(latencyMs * 100) / 100, // 2 decimal places
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      model: response.model,
      content: response.choices[0]?.message?.content ?? '',
    };

    eventBus.emit('api:response', result);

    logger.info({
      event: 'api_response',
      latencyMs: result.latencyMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      model: result.model,
    });

    return result;
  } catch (error) {
    const latencyMs = performance.now() - startMs;
    const classified = classifyError(error);

    eventBus.emit('api:error', classified);

    logger.warn({
      event: 'api_error',
      errorType: classified.type,
      statusCode: classified.statusCode,
      retryAfterMs: classified.retryAfterMs,
      latencyMs: Math.round(latencyMs * 100) / 100,
    });

    throw classified;
  }
}
```

### Pino Logger Configuration
```typescript
// Source: pino v10 docs
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});
```

### Startup Validation
```typescript
// Source: project requirement FOUN-02
import 'dotenv/config';

export function validateConfig(): { apiKey: string } {
  const apiKey = process.env.CORTEX_API_KEY;
  if (!apiKey) {
    console.error(
      'Error: CORTEX_API_KEY environment variable is not set.\n' +
      'Set it in your .env file or export it in your shell:\n' +
      '  export CORTEX_API_KEY=your-key-here'
    );
    process.exit(1);
  }
  return { apiKey };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ts-node for TypeScript | tsx (esbuild-based) | 2024 | ESM works without configuration pain |
| @types/node untyped EventEmitter | Generic typed EventEmitter support | July 2024 | Type-safe events without third-party libs |
| openai v3 with manual HTTP | openai v6 with typed classes | 2024-2025 | Error class hierarchy, header access, baseURL |
| winston for logging | pino v10 with transports | Ongoing | 5-10x faster JSON logging |
| CJS projects | ESM-first with `"type": "module"` | 2024-2025 | Required for modern packages like p-queue v9 |

**Deprecated/outdated:**
- ts-node: ESM compatibility issues make it unreliable; use tsx instead
- openai SDK v3: Completely different API surface; v6 is current
- console.log for logging: No structure, no levels, no async I/O

## Open Questions

1. **Cortex-specific Retry-After header format**
   - What we know: OpenAI uses `retry-after` header with seconds value
   - What's unclear: Whether Cortex returns the same header or a gateway-specific variant
   - Recommendation: Implement `parseRetryAfter()` supporting both seconds and HTTP-date formats; log the raw header value for debugging

2. **Cortex timeout behavior**
   - What we know: openai SDK has configurable timeout (default varies by version)
   - What's unclear: What Cortex's typical response time is for single-turn requests
   - Recommendation: Set 30s timeout initially; log actual latencies to calibrate

## Sources

### Primary (HIGH confidence)
- openai SDK v6 GitHub README — baseURL, maxRetries, error classes, APIError.headers
- pino v10 documentation — transport configuration, structured logging
- Node.js official docs — EventEmitter, performance.now(), perf_hooks
- Project research SUMMARY.md — stack decisions, architecture patterns, pitfalls

### Secondary (MEDIUM confidence)
- WebSearch: openai SDK error handling patterns for 429/Retry-After
- WebSearch: pino TypeScript ESM configuration
- WebSearch: Typed EventEmitter patterns in TypeScript

### Tertiary (LOW confidence)
- Cortex-specific API behavior (header names, timeouts) — must be verified empirically

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed from project research and npm registry
- Architecture: HIGH — patterns are standard Node.js/TypeScript, well-documented
- Pitfalls: HIGH — derived from project research with specific Phase 1 focus

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable stack, no fast-moving dependencies)
