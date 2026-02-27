---
phase: 02-conversation-engine-and-concurrency
status: passed
verified: 2026-02-26
---

# Phase 2: Conversation Engine and Concurrency - Verification

## Phase Goal

> N concurrent multi-turn medical conversations run end-to-end against the Cortex API, with full message history sent each turn, staggered ramp-up, and no cross-conversation failure propagation.

## Success Criteria Verification

### SC1: Doctor opens with "How are you feeling today?" and full message history sent each turn
**Status:** PASSED
**Evidence:**
- `src/conversation/prompts.ts` line 25: `DOCTOR_OPENING = 'How are you feeling today?'`
- `src/conversation/runner.ts` line 58: `history.push({ speaker: 'doctor', content: DOCTOR_OPENING })` — doctor's opening is the first message in every conversation
- `src/conversation/runner.ts` lines 78-90: Every API call builds messages from system prompt + full `history` array — history grows each turn
- Test proof: `runner.test.ts` "first API call includes 'How are you feeling today?' in messages" — PASSES
- Test proof: `runner.test.ts` "each successive call includes more messages than the previous" — PASSES
- Test proof: `runner.test.ts` "each API response content appears in the next turn messages" — PASSES (verifies full history inclusion)

### SC2: 5 concurrent conversations x 3 turns = 15 distinct API calls with no context sharing
**Status:** PASSED
**Evidence:**
- `src/conversation/manager.ts` lines 68-78: Each conversation gets its own `createConversationRunner` with unique `conversationId` — runners do not share state
- Test proof: `manager.test.ts` "runs N conversations and returns results for all" — 5 conversations x 2 turns = 10 API calls, `expect(makeRequest).toHaveBeenCalledTimes(10)` PASSES
- Each runner creates its own `history` array (runner.ts line 55) — no shared mutable state between conversations
- `Promise.allSettled` (manager.ts line 93) ensures all conversations run independently

### SC3: Staggered launch with configurable delay
**Status:** PASSED
**Evidence:**
- `src/conversation/manager.ts` lines 86-89: Stagger delay with jitter between launches: `rampUpDelayMs + Math.random() * 0.5 * rampUpDelayMs`
- `src/conversation/manager.ts` line 29: `rampUpDelayMs = 200` default, configurable via constructor
- `src/index.ts` line 29: Configurable via `STRESS_RAMP_DELAY` environment variable
- Test proof: `manager.test.ts` "launches conversations with visible time gaps when rampUpDelayMs > 0" — gaps >= 40ms (50ms base), PASSES
- Test proof: `manager.test.ts` "launches all conversations at once when rampUpDelayMs is 0" — all within 50ms window, PASSES

### SC4: Error injection in one conversation does not affect others
**Status:** PASSED
**Evidence:**
- `src/conversation/runner.ts` lines 152-185: Runner catches all errors and returns `ConversationResult` with `status: 'errored'` — never throws
- `src/conversation/manager.ts` line 93: `Promise.allSettled` ensures one rejection doesn't affect others
- Test proof: `manager.test.ts` "one failing conversation does not affect others" — fails every 4th call, verifies `completedConversations >= 1` AND `erroredConversations >= 1` AND total = 3, PASSES
- Test proof: `runner.test.ts` "does not throw — always returns a result" — PASSES

### SC5: Stop command drains in-flight requests, no orphaned connections
**Status:** PASSED
**Evidence:**
- `src/conversation/manager.ts` lines 153-191: `stop()` sets `stopping = true`, emits lifecycle events, then waits via `Promise.race` between drain promise and timeout
- `src/conversation/runner.ts` lines 63-65: Each turn checks `shouldStop?.()` before API call — no new turns start after stop
- `src/conversation/manager.ts` lines 173-190: Drain timeout with AbortController ensures clean timer cleanup
- `src/index.ts` lines 90-95: SIGINT/SIGTERM handlers call `manager.stop()`
- Test proof: `manager.test.ts` "stops new turns from starting after stop is called" — 10 turns configured, stopped mid-run, `totalTurns < 20`, `stoppedEarly === true`, PASSES
- Test proof: `manager.test.ts` "emits stopping and draining events when stop is called" — PASSES
- Test proof: `manager.test.ts` "stop resolves within drain timeout even if API calls are slow" — drainTimeoutMs=200, slow 5s mock, stop resolves in < 500ms, PASSES

## Requirement Coverage

| Requirement | Plan | Status |
|-------------|------|--------|
| CONV-01 (Multi-turn with full history) | 02-01 | PASSED — full message array grows each turn, proven by 3 tests |
| CONV-02 (Role-based system prompts) | 02-01 | PASSED — DOCTOR_SYSTEM_PROMPT and PATIENT_SYSTEM_PROMPT applied per turn |
| CONV-03 (Doctor opens with greeting) | 02-01 | PASSED — DOCTOR_OPENING = "How are you feeling today?" verified by test |
| CONV-04 (Self-talking loop) | 02-01 | PASSED — each response becomes next turn's input, proven by test |
| CONV-05 (Configurable turns per conversation) | 02-01 | PASSED — turnsPerConversation in ConversationConfig, proven by tests with M=1,2,3,4,5 |
| CONC-01 (N concurrent conversations) | 02-02 | PASSED — Promise.allSettled runs N runners, proven by test with N=5 |
| CONC-02 (Staggered ramp-up with jitter) | 02-02 | PASSED — configurable delay + 0-50% jitter, proven by timing tests |
| CONC-03 (Error isolation per conversation) | 02-02 | PASSED — runners catch errors, allSettled isolates, proven by error injection test |
| CONC-04 (Graceful stop with drain) | 02-02 | PASSED — stopping flag, drain timeout, signal handlers, proven by 3 stop tests |

## Automated Tests

- 15 runner tests: ALL PASS
- 10 manager tests: ALL PASS
- 25 Phase 1 tests: ALL PASS
- **Total: 50 tests, ALL PASS**
- TypeScript compilation (strict mode): PASSES

## Score

**9/9 requirements verified. 5/5 success criteria passed.**

Phase 2 is complete.
