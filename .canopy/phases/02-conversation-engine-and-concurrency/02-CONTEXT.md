# Phase 2: Conversation Engine and Concurrency - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-turn self-talking medical dialogues running N concurrent conversations against the Cortex API. Each conversation sends full message history every turn, conversations launch with staggered ramp-up, and failures are isolated per conversation. Graceful shutdown drains in-flight requests. Metrics collection and dashboard are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Conversation flow design
- Two distinct system prompts per conversation: one for the "medical professional" role, one for the "patient" role
- Doctor initiates with "How are you feeling today?" as the first user message (per CONV-03)
- Self-talking loop: doctor message -> API call as patient -> patient response -> API call as doctor -> repeat
- Each turn sends the complete message history array (growing context window is the point of this stress test)
- Each conversation gets a sequential integer ID (1, 2, 3...) — simpler than UUIDs for a local test tool
- Conversations are fully independent — each maintains its own messages array, no shared state

### System prompt approach
- Medical professional prompt: instruct the model to act as a doctor conducting a patient consultation, asking follow-up questions based on responses
- Patient prompt: instruct the model to act as a patient experiencing symptoms, responding naturally with details
- System prompts are hardcoded defaults but could accept overrides via config for future flexibility
- Keep prompts short and functional — this is a load tester, not a medical simulation

### Ramp-up strategy
- Linear stagger: launch conversations one at a time with a configurable base delay between each (default 200ms)
- Add random jitter of 0-50% of base delay to avoid synchronized request patterns
- Configurable via a `rampUpDelayMs` option (setting to 0 launches all at once for burst testing)
- Log each conversation launch with timestamp so stagger is visible in output

### Error isolation boundaries
- Each conversation runs as its own async task (Promise)
- API-level retries (429, 5xx) are handled by the Phase 1 client — conversation engine just calls the client
- If a conversation's API call fails after client-level retries are exhausted: mark conversation as `errored`, emit error event, do NOT retry the conversation from scratch
- Errored conversations stop immediately — no partial recovery or turn skipping
- Other conversations continue unaffected

### Graceful shutdown mechanics
- Stop signal sets a shared `stopping` flag checked before each new turn begins
- In-flight API requests complete naturally — do not abort active HTTP connections
- Drain timeout of 30 seconds (configurable) — if in-flight requests haven't completed by then, force-close with warning
- Emit lifecycle events: `stopping` (signal received), `draining` (waiting for in-flight), `stopped` (all done)
- Process exits cleanly with code 0 after successful drain

### Claude's Discretion
- Exact system prompt wording for doctor and patient roles
- Internal data structures for conversation state management
- How to structure the ConversationManager class/module
- Event bus event naming conventions (build on Phase 1 patterns)
- Whether to use Promise.allSettled or manual tracking for concurrent conversations

</decisions>

<specifics>
## Specific Ideas

- The growing message history per turn is the core stress test mechanic — each turn sends MORE tokens as context accumulates, so the conversation engine must not trim or summarize history
- Conversation IDs should appear in all log output and events for easy correlation
- The configurable turns-per-conversation (M) should be a simple number — all conversations in a run use the same M value
- Stagger visibility in logs is important for verifying CONC-02 — each launch should log its conversation ID and timestamp

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-conversation-engine-and-concurrency*
*Context gathered: 2026-02-26*
