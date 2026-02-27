---
phase: 01-foundation-and-api-client
plan: 02
status: complete
started: 2026-02-26
completed: 2026-02-26
---

# Plan 01-02: TDD Error Classification

## What Was Built

Error classification module using TDD (Red-Green-Refactor cycle):
- `classifyError()` — classifies API errors into four types: rate_limited (429), server_error (5xx), client_error (4xx), timeout
- `parseRetryAfter()` — parses Retry-After headers in seconds or HTTP-date format to milliseconds
- 25 tests covering all classification paths and edge cases

## TDD Cycle

- **RED:** Wrote 25 failing tests for classifyError and parseRetryAfter
- **GREEN:** Implemented both functions — all 25 tests pass
- **REFACTOR:** Removed unused type imports

## Key Decisions

- Used duck-typing (checking `.status` property) instead of `instanceof OpenAI.APIError` — makes testing simpler and handles Cortex-specific errors
- Timeout detection checks for `timeout`, `ETIMEDOUT`, `ECONNREFUSED`, `ECONNRESET` patterns
- Retry-After parsing supports both seconds and HTTP-date formats with 1-second fallback for invalid values

## Key Files

### Created
- `src/api/errors.ts` — classifyError() and parseRetryAfter()
- `src/api/__tests__/errors.test.ts` — 25 test cases
- `jest.config.js` — Jest with ts-jest ESM support

## Commits

1. `befaeb4` — test(01-02): add failing tests for error classification and Retry-After parsing (RED)
2. `64cb995` — feat(01-02): implement error classification and Retry-After parsing (GREEN)
3. `f7bb32e` — refactor(01-02): remove unused type imports (REFACTOR)

## Self-Check: PASSED

- [x] All 25 tests pass
- [x] 429 classified as rate_limited
- [x] 5xx classified as server_error
- [x] 4xx classified as client_error
- [x] Timeouts classified as timeout
- [x] Retry-After header parsed (seconds, HTTP-date, null, invalid)
- [x] 3 atomic TDD commits in git log
- [x] npx tsc --noEmit passes
