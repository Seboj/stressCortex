---
phase: 01-foundation-and-api-client
plan: 01
status: complete
started: 2026-02-26
completed: 2026-02-26
---

# Plan 01-01: Project Scaffolding and Foundation

## What Was Built

TypeScript project scaffolding with ESM module system, strict type checking, and the foundational infrastructure:
- Typed EventEmitter bus with compile-time event name/argument safety
- Pino structured logger with pino-pretty for development
- Environment validation that fails fast with a clear message on missing API key
- Foundation types: ErrorType, ClassifiedError, CortexResponse, EventMap, AppConfig

## Key Decisions

- Used unconstrained generic `TypedEventEmitter<T>` with conditional type `T[K] extends unknown[] ? T[K] : never` to avoid the strict index signature requirement that TypeScript interfaces don't satisfy
- Set EventEmitter maxListeners to 50 to prevent warnings in later phases when metrics, SSE bridge, and logger all subscribe
- Used `process.stderr.write()` instead of `console.error()` for the missing API key message to avoid pino formatting

## Key Files

### Created
- `package.json` — ESM project with tsx/tsc scripts
- `tsconfig.json` — Strict TypeScript with NodeNext module resolution
- `src/types/api.ts` — ErrorType, ClassifiedError, CortexResponse, AppConfig
- `src/types/events.ts` — EventMap with api:request, api:response, api:error
- `src/types/metrics.ts` — LatencyMetric, TokenUsage
- `src/core/event-bus.ts` — Singleton TypedEventEmitter<EventMap>
- `src/core/logger.ts` — Pino logger with dev/prod transport
- `src/core/config.ts` — validateConfig() with fail-fast

## Commits

1. `b9dd494` — feat(01-01): scaffold TypeScript project with types, event bus, logger, and config

## Self-Check: PASSED

- [x] `npx tsc --noEmit` passes with zero errors
- [x] package.json has `"type": "module"`
- [x] tsconfig.json has `"strict": true`
- [x] All types export correctly
- [x] EventBus is typed singleton
- [x] Logger configured for dev and prod
- [x] Config validates API key presence
