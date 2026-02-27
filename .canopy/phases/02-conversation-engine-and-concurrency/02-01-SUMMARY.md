---
phase: 02-conversation-engine-and-concurrency
plan: 01
subsystem: conversation
tags: [typescript, openai, event-bus, tdd, jest]

requires:
  - phase: 01-foundation-and-api-client
    provides: "API client (makeRequest), event bus, logger, types"
provides:
  - "ConversationRunner: single conversation turn loop"
  - "Conversation types: ConversationConfig, ConversationResult, ConversationTurnResult"
  - "Phase 2 event types: conversation:start, conversation:turn:complete, conversation:complete, test:lifecycle"
  - "System prompts: DOCTOR_SYSTEM_PROMPT, PATIENT_SYSTEM_PROMPT, DOCTOR_OPENING"
affects: [02-02-manager, phase-3-metrics]

tech-stack:
  added: []
  patterns: ["self-talking turn loop with role alternation", "makeRequest injection for testability", "event-driven conversation tracking"]

key-files:
  created:
    - src/types/conversation.ts
    - src/conversation/runner.ts
    - src/conversation/prompts.ts
    - src/conversation/__tests__/runner.test.ts
  modified:
    - src/types/events.ts

key-decisions:
  - "1 turn = 1 API call (M=3 means 3 API calls, matching success criteria: 5x3=15 distinct calls)"
  - "Speaker history stored neutrally, roles mapped to user/assistant per turn based on active speaker"
  - "makeRequest injected via ConversationConfig for test isolation without API mocking"

patterns-established:
  - "TDD for conversation logic: tests define behavior, implementation follows"
  - "Event emission pattern: conversation:start -> N x conversation:turn:complete -> conversation:complete"
  - "Role alternation: odd turns = patient, even turns = doctor"

requirements-completed: [CONV-01, CONV-02, CONV-03, CONV-04, CONV-05]

duration: 8min
completed: 2026-02-26
---

# Phase 2 Plan 01: ConversationRunner Summary

**Self-talking doctor/patient turn loop with TDD-verified role alternation, full message history growth, and event-driven turn tracking**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T02:05:00Z
- **Completed:** 2026-02-26T02:13:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Conversation types with injected makeRequest for testability
- EventMap extended with 4 new event types (conversation:start, turn:complete, complete, test:lifecycle)
- Doctor/patient system prompts with conciseness control
- ConversationRunner with self-talking loop, full history growth, error handling, and stop signal support
- 15 passing tests proving all conversation behaviors

## Task Commits

1. **Task 1: Define conversation types and extend event map** - `2be533f` (feat)
2. **Task 2: Create system prompts module** - `2f0f703` (feat)
3. **Task 3: TDD ConversationRunner** - `797c498` (test/RED), `86c4d7e` (feat/GREEN)

## Files Created/Modified
- `src/types/conversation.ts` - ConversationConfig, ConversationResult, ConversationTurnResult, ConversationStatus
- `src/types/events.ts` - Extended EventMap with Phase 2 conversation and lifecycle events
- `src/conversation/prompts.ts` - DOCTOR_SYSTEM_PROMPT, PATIENT_SYSTEM_PROMPT, DOCTOR_OPENING
- `src/conversation/runner.ts` - createConversationRunner with self-talking turn loop
- `src/conversation/__tests__/runner.test.ts` - 15 tests covering all runner behaviors

## Decisions Made
- 1 turn = 1 API call (not 1 exchange). M=3 means 3 API calls, matching success criteria ("5 conversations x 3 turns = 15 distinct API calls")
- Speaker history stored with neutral 'doctor'/'patient' markers, mapped to 'user'/'assistant' roles based on whose turn it is
- makeRequest is injected via config rather than importing the client directly, enabling clean test mocking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Jest globals not available in ESM mode**
- **Found during:** Task 3 (TDD runner tests)
- **Issue:** `jest.fn()` not available as global in ESM mode with ts-jest
- **Fix:** Added `import { jest } from '@jest/globals'` to test file
- **Files modified:** src/conversation/__tests__/runner.test.ts
- **Verification:** All 15 tests pass
- **Committed in:** `86c4d7e` (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor test infrastructure fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ConversationRunner ready for ConversationManager (Plan 02) to orchestrate N concurrent instances
- shouldStop callback ready for graceful shutdown integration
- Event emissions ready for Phase 3 metrics aggregation

---
*Phase: 02-conversation-engine-and-concurrency*
*Completed: 2026-02-26*
