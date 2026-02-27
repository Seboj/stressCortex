# Phase 2: Conversation Engine and Concurrency - Research

**Researched:** 2026-02-26
**Domain:** Multi-turn conversation simulation with concurrent execution
**Confidence:** HIGH

## Summary

Phase 2 builds the conversation engine and concurrency layer on top of the Phase 1 foundation (typed event bus, API client, logger, config). The core task is implementing a self-talking loop where two LLM personas (doctor and patient) exchange messages, with each turn sending the full growing message history. N such conversations run concurrently with staggered ramp-up, isolated error handling, and graceful shutdown.

The Phase 1 codebase provides everything needed: `createCortexClient` returns a `makeRequest(messages)` function that handles latency measurement, token parsing, error classification, and event bus emissions. The conversation engine wraps this in a turn loop, manages per-conversation message arrays, and coordinates concurrency. No new dependencies are required -- `p-queue` was identified in project research for concurrency control, but for this phase's needs (staggered launch, drain on stop), a simpler approach using `Promise.allSettled` with manual delay-based stagger and an `AbortController`-style stopping flag is cleaner and avoids adding a dependency that's only truly needed if dynamic concurrency adjustment is required (Phase 3/4 concern).

**Primary recommendation:** Build three focused modules -- `ConversationRunner` (single conversation turn loop), `ConversationManager` (N concurrent runners with stagger/stop/drain), and new event types -- all wired through the existing event bus. Keep it simple: no state machine complexity, no queue library. The Phase 1 patterns (typed events, pino logging, async/await) extend naturally.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Two distinct system prompts per conversation: one for the "medical professional" role, one for the "patient" role
- Doctor initiates with "How are you feeling today?" as the first user message (per CONV-03)
- Self-talking loop: doctor message -> API call as patient -> patient response -> API call as doctor -> repeat
- Each turn sends the complete message history array (growing context window is the point of this stress test)
- Each conversation gets a sequential integer ID (1, 2, 3...) -- simpler than UUIDs for a local test tool
- Conversations are fully independent -- each maintains its own messages array, no shared state
- Medical professional prompt: instruct the model to act as a doctor conducting a patient consultation, asking follow-up questions based on responses
- Patient prompt: instruct the model to act as a patient experiencing symptoms, responding naturally with details
- System prompts are hardcoded defaults but could accept overrides via config for future flexibility
- Keep prompts short and functional -- this is a load tester, not a medical simulation
- Linear stagger: launch conversations one at a time with a configurable base delay between each (default 200ms)
- Add random jitter of 0-50% of base delay to avoid synchronized request patterns
- Configurable via a `rampUpDelayMs` option (setting to 0 launches all at once for burst testing)
- Log each conversation launch with timestamp so stagger is visible in output
- Each conversation runs as its own async task (Promise)
- API-level retries (429, 5xx) are handled by the Phase 1 client -- conversation engine just calls the client
- If a conversation's API call fails after client-level retries are exhausted: mark conversation as `errored`, emit error event, do NOT retry the conversation from scratch
- Errored conversations stop immediately -- no partial recovery or turn skipping
- Other conversations continue unaffected
- Stop signal sets a shared `stopping` flag checked before each new turn begins
- In-flight API requests complete naturally -- do not abort active HTTP connections
- Drain timeout of 30 seconds (configurable) -- if in-flight requests haven't completed by then, force-close with warning
- Emit lifecycle events: `stopping` (signal received), `draining` (waiting for in-flight), `stopped` (all done)
- Process exits cleanly with code 0 after successful drain

### Claude's Discretion
- Exact system prompt wording for doctor and patient roles
- Internal data structures for conversation state management
- How to structure the ConversationManager class/module
- Event bus event naming conventions (build on Phase 1 patterns)
- Whether to use Promise.allSettled or manual tracking for concurrent conversations

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONV-01 | Multi-turn conversations with full message history sent each turn | ConversationRunner turn loop sends growing messages array via makeRequest |
| CONV-02 | Role-based system prompts (medical professional + patient) | Two system prompts: doctor and patient, swapped per turn to determine API role |
| CONV-03 | Medical professional initiates with "How are you feeling today?" | First message in messages array is doctor's opening, triggers patient API call |
| CONV-04 | Self-talking loop: each response becomes next turn's input | Turn loop appends response as assistant message, swaps role, calls API again |
| CONV-05 | Configurable number of turns per conversation (M) | turnsPerConversation config option controls loop iteration count |
| CONC-01 | Spin up N concurrent conversations | ConversationManager launches N ConversationRunners, tracked via Promise.allSettled |
| CONC-02 | Staggered ramp-up with jitter | Linear stagger with configurable base delay (200ms default) + random 0-50% jitter |
| CONC-03 | Error isolation per conversation | Each runner is independent; caught errors mark conversation errored, others continue |
| CONC-04 | Graceful stop with drain | Shared stopping flag + drain timeout (30s default) + lifecycle events |
</phase_requirements>

## Standard Stack

### Core (already installed from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai | 6.25.0 | Cortex API calls via `makeRequest` | Already integrated in Phase 1 client |
| pino | 10.3.1 | Structured logging | Already configured in Phase 1 |
| typescript | 5.9.3 | Type safety | Already configured |
| tsx | 4.21.0 | TypeScript execution | Already configured |

### Supporting (no new deps needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js EventEmitter | built-in | Inter-component communication | Already wrapped in typed event bus |
| Node.js timers/promises | built-in | `setTimeout` for stagger delays | Staggered ramp-up implementation |
| Node.js AbortController | built-in | Potential drain timeout signal | Force-close after drain timeout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual Promise tracking | p-queue v9 | p-queue adds pause/resume/dynamic concurrency but is overkill for Phase 2's "launch N with stagger" pattern; revisit in Phase 4 if dynamic concurrency control is needed |
| Promise.allSettled | Custom tracker | allSettled gives exactly the right semantics: wait for all, don't short-circuit on rejection, get per-promise status |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── api/            # Phase 1: client.ts, errors.ts
├── core/           # Phase 1: config.ts, event-bus.ts, logger.ts
├── conversation/   # Phase 2: NEW
│   ├── runner.ts           # Single conversation turn loop
│   ├── manager.ts          # N concurrent conversations orchestration
│   ├── prompts.ts          # Doctor/patient system prompts
│   └── __tests__/
│       ├── runner.test.ts
│       └── manager.test.ts
├── types/          # Phase 1: api.ts, events.ts, metrics.ts
│   └── conversation.ts     # Phase 2: NEW - conversation types
└── index.ts        # Update: wire ConversationManager for demo
```

### Pattern 1: ConversationRunner (Single Conversation Loop)

**What:** A function/class that owns one conversation's message history and runs M turns.
**When to use:** Each concurrent conversation is one runner instance.

```typescript
// Each runner owns its own messages array - no shared state
interface ConversationRunner {
  readonly id: number;
  readonly status: 'pending' | 'active' | 'completed' | 'errored';
  readonly turnsCompleted: number;
  run(): Promise<ConversationResult>;
}
```

Key design: The runner checks a shared `stopping` flag before each turn, not between API calls. This means an in-flight API call completes naturally.

### Pattern 2: Self-Talking Turn Loop

**What:** Alternating doctor/patient API calls with full history.
**When to use:** Core conversation mechanic.

```typescript
// Pseudocode for the turn loop
// messages starts with: [doctorSystem, doctorOpening]
// Turn 1: call API as patient (patientSystem + messages) -> get patient response
// Turn 2: call API as doctor (doctorSystem + messages) -> get doctor response
// Each turn appends the response and swaps the active role

// The key insight: system prompt determines which role the API plays
// messages array grows by one assistant message per API call
```

### Pattern 3: Staggered Launch

**What:** Launch conversations one at a time with delay + jitter.
**When to use:** Avoid thundering herd at test start.

```typescript
// Launch with stagger
for (let i = 0; i < numConversations; i++) {
  const runner = createRunner(i + 1, config);
  promises.push(runner.run()); // Don't await -- launch and continue

  if (i < numConversations - 1) {
    const jitter = Math.random() * 0.5 * rampUpDelayMs;
    await setTimeout(rampUpDelayMs + jitter);
  }
}
// All launched, now wait for all to finish
const results = await Promise.allSettled(promises);
```

### Anti-Patterns to Avoid
- **Shared message array:** Each conversation MUST own its own messages array. Sharing causes cross-contamination.
- **Awaiting each conversation sequentially:** Launch all (with stagger), then `Promise.allSettled` for concurrent execution.
- **Aborting in-flight requests on stop:** Let HTTP requests complete naturally. Only prevent NEW turns from starting.
- **Complex state machines:** A simple `status` field + `stopping` flag check is sufficient. No need for a formal FSM library.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent promise tracking | Custom counter/callback | `Promise.allSettled()` | Handles all settlement cases, gives typed results, no edge cases |
| Delay with jitter | Nested setTimeout callbacks | `import { setTimeout } from 'timers/promises'` | Async/await compatible, no callback nesting |
| Error type narrowing | Manual `instanceof` chains | Existing `classifyError()` from Phase 1 | Already handles all error types correctly |

**Key insight:** Phase 1 already built the hard parts (error classification, event bus, API client). Phase 2 is orchestration glue, not infrastructure.

## Common Pitfalls

### Pitfall 1: Message Array Mutation Across Conversations
**What goes wrong:** If conversations share a reference to a message array (or template), mutations in one affect others.
**Why it happens:** JavaScript arrays are passed by reference. Creating runners from a shared template without deep copy.
**How to avoid:** Each ConversationRunner creates its own fresh messages array. The only shared input is the system prompts (strings, immutable).
**Warning signs:** Conversations producing identical or cross-contaminated responses.

### Pitfall 2: Race Condition in Stopping Flag
**What goes wrong:** A conversation checks `stopping === false`, then starts an API call, then stop is issued -- the call is already in flight.
**Why it happens:** Check-then-act is inherently racy in async code.
**How to avoid:** This is EXPECTED and DESIRED behavior per the user's decision. In-flight requests complete naturally. Only check `stopping` before starting a NEW turn, not mid-turn.
**Warning signs:** None -- this is correct behavior.

### Pitfall 3: Drain Timeout Not Actually Force-Closing
**What goes wrong:** After 30 seconds, in-flight requests are still pending because the drain timeout only logs a warning but doesn't actually terminate anything.
**How to avoid:** Use `Promise.race` with a timeout promise. After drain timeout, resolve the manager's promise with partial results and emit a `drain:timeout` event. Do NOT try to abort HTTP connections (the OpenAI SDK doesn't support per-request abort cleanly).
**Warning signs:** Process hangs after stop signal.

### Pitfall 4: Forgetting to Emit Events for Each Turn
**What goes wrong:** The conversation engine runs turns but doesn't emit turn-level events, so Phase 3 metrics aggregation has nothing to subscribe to.
**Why it happens:** Focusing on getting the loop working and forgetting the event bus integration.
**How to avoid:** Emit `conversation:turn:complete` with latency, tokens, turn number, and conversation ID on EVERY turn. This is the primary data feed for Phase 3.
**Warning signs:** Metrics phase has no data to work with.

### Pitfall 5: Turn Counting Off-By-One
**What goes wrong:** If M=3 turns is configured, the conversation makes 4 or 2 API calls instead of 3.
**Why it happens:** Confusion between "turn" (one API call) vs "exchange" (doctor+patient pair).
**How to avoid:** Define clearly: one turn = one API call. M=3 means 3 API calls per conversation. The self-talking pattern means turn 1 is patient response, turn 2 is doctor follow-up, turn 3 is patient response.
**Warning signs:** API call count doesn't match N*M.

## Code Examples

### Event Types for Phase 2
```typescript
// Extend EventMap in src/types/events.ts
export interface ConversationStartEvent {
  conversationId: number;
  turnsTotal: number;
  timestamp: number;
}

export interface ConversationTurnCompleteEvent {
  conversationId: number;
  turnNumber: number;
  turnsTotal: number;
  role: 'doctor' | 'patient';
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  messageCount: number; // messages array length at this turn
  timestamp: number;
}

export interface ConversationCompleteEvent {
  conversationId: number;
  turnsCompleted: number;
  status: 'completed' | 'errored';
  errorMessage?: string;
  totalLatencyMs: number;
  timestamp: number;
}

export interface TestLifecycleEvent {
  type: 'starting' | 'running' | 'stopping' | 'draining' | 'stopped';
  conversationsTotal: number;
  conversationsActive: number;
  timestamp: number;
}
```

### System Prompts
```typescript
// Short, functional prompts -- this is a load tester, not a medical sim
export const DOCTOR_SYSTEM_PROMPT =
  'You are a medical doctor conducting a patient consultation. ' +
  'Ask follow-up questions based on the patient\'s responses. ' +
  'Keep responses concise (2-3 sentences).';

export const PATIENT_SYSTEM_PROMPT =
  'You are a patient visiting a doctor. ' +
  'Describe your symptoms naturally and answer questions honestly. ' +
  'Keep responses concise (2-3 sentences).';

export const DOCTOR_OPENING = 'How are you feeling today?';
```

### Graceful Shutdown Pattern
```typescript
// In ConversationManager
private stopping = false;
private activePromises = new Set<Promise<ConversationResult>>();

async stop(): Promise<void> {
  this.stopping = true;
  eventBus.emit('test:lifecycle', { type: 'stopping', ... });

  if (this.activePromises.size > 0) {
    eventBus.emit('test:lifecycle', { type: 'draining', ... });

    // Race between all promises settling and drain timeout
    await Promise.race([
      Promise.allSettled([...this.activePromises]),
      setTimeout(this.drainTimeoutMs).then(() => {
        logger.warn({ event: 'drain_timeout' }, 'Drain timeout reached, force-closing');
      }),
    ]);
  }

  eventBus.emit('test:lifecycle', { type: 'stopped', ... });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `timers.setTimeout` (callback) | `import { setTimeout } from 'timers/promises'` | Node.js 16+ | Async/await compatible delays |
| Manual promise tracking arrays | `Promise.allSettled()` | ES2020 | Typed results, no short-circuit on rejection |
| Worker threads for concurrency | Async/await + event loop | Always for I/O-bound | LLM API calls are I/O-bound, not CPU-bound; threads add complexity with no benefit |

## Open Questions

1. **Retry behavior at conversation level**
   - What we know: Phase 1 client has `maxRetries: 0` (retries disabled). The conversation engine should not retry failed turns.
   - What's unclear: Should the conversation engine add its own retry layer for transient errors (e.g., retry a turn once on 429)?
   - Recommendation: No -- per CONTEXT.md decision, "If a conversation's API call fails after client-level retries are exhausted: mark conversation as errored." Keep it simple. If retry-at-conversation-level is needed, it's a future enhancement.

2. **Turn definition clarity**
   - What we know: User says "M turns per conversation" and the self-talking loop alternates doctor/patient.
   - What's unclear: Is M=3 three API calls or three doctor-patient exchanges (6 API calls)?
   - Recommendation: Define 1 turn = 1 API call. M=3 means 3 API calls. This matches the success criteria: "5 concurrent conversations for 3 turns each produces 15 distinct API calls."

## Sources

### Primary (HIGH confidence)
- Phase 1 source code (src/api/client.ts, src/core/event-bus.ts, src/types/events.ts) -- verified existing patterns and interfaces
- Node.js docs -- `timers/promises`, `Promise.allSettled`, `AbortController`
- Project CONTEXT.md -- all locked decisions for this phase

### Secondary (MEDIUM confidence)
- Project research SUMMARY.md -- architecture recommendations, pitfall analysis
- ROADMAP.md -- phase goals and success criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies needed, building on verified Phase 1 code
- Architecture: HIGH -- straightforward async/await orchestration patterns with well-understood Node.js primitives
- Pitfalls: HIGH -- most pitfalls are explicitly addressed by CONTEXT.md locked decisions

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable patterns, no fast-moving dependencies)
