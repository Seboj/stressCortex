---
phase: 01-foundation-and-api-client
plan: 03
status: complete
started: 2026-02-26
completed: 2026-02-26
---

# Plan 01-03: API Client and Entry Point

## What Was Built

Cortex API client with full instrumentation and entry point that makes a verified real API call:
- `createCortexClient()` — wraps openai SDK v6 with baseURL, maxRetries:0, 30s timeout
- `makeRequest()` — instrumented API call with latency, tokens, events, logging, error classification
- `src/index.ts` — entry point that validates config, makes test call, prints results

## Verified Against Real Cortex API

```
✓ Cortex API call succeeded
  Response: "Hello from StressCortex"
  Latency:  718.58ms
  Tokens:   38 prompt + 6 completion
  Model:    default
```

## Key Decisions

- Used `maxRetries: 0` to disable SDK auto-retries so we control error classification
- Client accepts config as parameter (from validateConfig) for testability
- Latency captured with performance.now() immediately before/after API call (not around processing)
- Re-throws ClassifiedError (not original) so callers get typed error information

## Key Files

### Created
- `src/api/client.ts` — createCortexClient(), makeRequest()
- `src/index.ts` — entry point with real API call verification

## Commits

1. `ffdcfcb` — feat(01-03): add Cortex API client and entry point with real API verification

## Self-Check: PASSED

- [x] Real API call succeeds with model "default"
- [x] Latency measured with performance.now() (718.58ms)
- [x] Token usage parsed: 38 prompt + 6 completion
- [x] Structured pino logs contain latencyMs, promptTokens, completionTokens, model
- [x] Event bus emits api:request and api:response events
- [x] Missing API key prints clear error, exits 1, no stack trace
- [x] npx tsc --noEmit passes
