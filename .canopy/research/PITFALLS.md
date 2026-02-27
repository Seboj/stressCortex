# Pitfalls Research

**Domain:** LLM API stress testing tool — multi-turn concurrent conversations, OpenAI-compatible gateway
**Researched:** 2026-02-26
**Confidence:** MEDIUM (training knowledge; WebSearch/WebFetch denied during research session — flag for validation)

---

## Critical Pitfalls

### Pitfall 1: Measuring Latency on the Node.js Event Loop (Coordinator Thread)

**What goes wrong:**
All outbound HTTP requests and all timer calls (`Date.now()`, `performance.now()`) run on the same Node.js event loop. When many concurrent requests are in flight, the event loop is processing I/O callbacks, SSE chunks, and metric updates simultaneously. Timer reads happen _after_ the event loop wakes up from a callback queue, not at the true moment of network activity. This means recorded latencies include event-loop queue wait time in addition to actual network time, producing measurements that appear accurate but are systematically inflated — and the inflation grows non-linearly as concurrency increases.

**Why it happens:**
Developers assume `Date.now()` is a syscall that returns the real wall clock. In Node.js it is, but the _value_ is only captured when JavaScript executes that line — which waits in the microtask/macrotask queue. Under 50+ concurrent HTTP connections, event loop lag of 5–50ms per measurement is common. At 100+ concurrent streaming connections it can exceed 100ms per measurement.

**How to avoid:**
- Capture timestamps _inside_ the `fetch`/`http.request` callback at the exact moment data arrives, not outside the callback. Use `performance.now()` (sub-millisecond, high-res) rather than `Date.now()` (millisecond only).
- Use `perf_hooks.monitorEventLoopDelay()` to continuously measure event loop lag and include it as a metric in the dashboard — this makes the distortion visible.
- For time-to-first-token (TTFT) measurement in streaming responses: record the timestamp _inside the first `data` event callback_ from the SSE stream, not after the `fetch()` promise resolves (which resolves when headers arrive, not when the first token arrives).
- Consider `worker_threads` for the HTTP driver to isolate load generation from the metrics collection process — they share no event loop.

**Warning signs:**
- Measured P95 latency increases super-linearly with concurrency even when the server reports stable processing times.
- The gap between P50 and P95 widens as you add more concurrent conversations.
- Event loop lag visible in Node.js performance metrics exceeds 10ms during test runs.

**Phase to address:**
Core conversation engine and metrics collection — establish correct measurement patterns from the first commit, not retrofitted.

---

### Pitfall 2: Not Distinguishing Time-to-First-Token (TTFT) from Total Completion Time

**What goes wrong:**
Projects record a single "latency" number per API call — typically the time from request start to response complete. For LLM APIs, this is almost meaningless because it conflates two fundamentally different things: (1) how long the model took to start generating (TTFT — a proxy for GPU queue depth and model load) and (2) how long generation took in total (a function of output token count). Under load, TTFT degrades first and most dramatically. A single aggregate latency hides the model actually being saturated.

**Why it happens:**
Developers coming from REST API load testing tools (Artillery, k6) are used to a single request-response latency. The streaming nature of LLM responses isn't modeled by those mental models.

**How to avoid:**
Track three separate metrics per API call:
1. **TTFT** — time from request send to first SSE `data` chunk received.
2. **Inter-token latency** — time between consecutive tokens (mean and P95). Spikes indicate GPU contention.
3. **Total completion time** — TTFT + generation time. Subtract TTFT to get pure generation time for normalization.

For the Cortex gateway specifically: if it proxies to a backend, TTFT captures the proxy overhead + backend queue wait. That's the most important stress signal.

**Warning signs:**
- Dashboard shows "latency" as a single number.
- No distinction in metrics between streaming and non-streaming response shapes.
- P50 latency looks acceptable but users report the UI "feeling slow" — TTFT is the culprit.

**Phase to address:**
Metrics design phase. Define these three metrics before writing any HTTP client code — retrofitting requires touching the stream parser everywhere.

---

### Pitfall 3: Concurrent Request Avalanche (Missing Concurrency Ramp)

**What goes wrong:**
The test spins up all N conversations simultaneously at t=0. This creates a request spike that may be rejected by the gateway (rate limiting, connection queue overflow) before the test even measures steady-state behavior. The test fails immediately with 429s or connection errors, making results look catastrophic when the gateway may handle ramped load fine.

**Why it happens:**
The natural implementation of "run N concurrent conversations" is `Promise.all(conversations.map(run))` — which fires all requests at the same instant. This is a thundering herd, not realistic load.

**How to avoid:**
Implement a concurrency ramp with configurable parameters:
- `rampUpSeconds`: time over which to start all N conversations (default: 30s).
- Stagger conversation starts using a jitter: `delay = (index / total) * rampUpSeconds + Math.random() * jitterMs`.
- Use a semaphore/token-bucket to cap simultaneous in-flight requests per second, separate from total concurrency count.

For the self-talking dialogue pattern specifically: conversation N starts turn 2 while conversation 1 is still on turn 1 — the ramp ensures the API sees realistic mixed-phase load.

**Warning signs:**
- Test results show all errors in the first 2–5 seconds, then stable behavior.
- Gateway logs show a burst of 429 responses at test start.
- Server CPU/memory spikes sharply then stabilizes.

**Phase to address:**
Conversation spawning and concurrency control — build the ramp from the start, not as an afterthought.

---

### Pitfall 4: Growing Context Window Causing Silent Memory Explosion

**What goes wrong:**
Each conversation turn appends to the `messages` array, which is sent as JSON on every request. For a 20-turn conversation, the last request sends all 19 prior messages. If 50 conversations are running in parallel at turn 20, you're holding ~50 × 20-turn conversation histories in memory simultaneously. Each medical consultation message is verbose — easily 200–500 tokens = 800–2000 bytes per message. At 50 conversations × 20 turns × 1500 bytes = 1.5MB of JSON just for message bodies. This is manageable, but token usage explodes the *API cost* and request payload size simultaneously.

More insidiously: if message histories are kept as object references inside closures that get passed into promise chains, they can be held in memory well past their useful life by unresolved promise chains, causing heap growth that looks like a memory leak.

**Why it happens:**
The natural implementation keeps each conversation's history as a mutable array that grows unboundedly. No attention is paid to when histories are eligible for GC.

**How to avoid:**
- Set a hard cap on conversation history length (configurable `maxTurns` — already in scope).
- After a conversation completes, explicitly null out its messages array to help GC.
- Track `promptTokens` per turn (from API response `usage.prompt_tokens`) — this is the authoritative measure of growing context cost and should be charted over turn number to make the growth curve visible.
- Alert in the UI if `promptTokens` exceeds a threshold (e.g., 80% of model's context window) — the API will return a 400 context length exceeded error otherwise.

**Warning signs:**
- Node.js heap size grows monotonically over the test run and doesn't stabilize.
- P95 latency per turn increases with turn number even at low concurrency.
- API returns `context_length_exceeded` errors on later turns.
- `usage.prompt_tokens` in API responses grows linearly (expected) while `completion_tokens` stays flat (indicates the growing context is the driver).

**Phase to address:**
Multi-turn conversation management — the messages array design must account for this from the beginning.

---

### Pitfall 5: Treating 429 Rate Limit Errors as Test Failures Instead of Backpressure Signals

**What goes wrong:**
The test records every 429 response as an "error" in the error rate metric. Under high concurrency this inflates error rate to 30–50%, making the test look like the gateway is broken when it's actually correctly enforcing rate limits. The test tool doesn't back off, so it continues hammering the API with requests it knows will be rate-limited, generating meaningless load and obscuring the real capacity signal.

**Why it happens:**
Standard HTTP clients return 429 with the same error handling as 500. Developers don't distinguish classes of errors.

**How to avoid:**
- Separate error classification: `rate_limited` (429) vs `server_error` (500/502/503) vs `client_error` (400/401) vs `timeout`. Each is a different signal.
- On 429, read the `Retry-After` header (seconds) or `X-RateLimit-Reset-Requests` / `X-RateLimit-Reset-Tokens` headers (OpenAI format). Wait that duration before retrying that specific conversation.
- Implement exponential backoff with jitter for retry logic: `delay = min(baseDelay * 2^attempt + random(0, baseDelay), maxDelay)`.
- Track `rate_limited` as its own metric — the rate at which the API rate-limits you IS meaningful data (it tells you where the gateway's throttle sits).
- Distinguish between per-request rate limits (RPM) and per-token rate limits (TPM) — LLM gateways often have both.

**Warning signs:**
- Error rate metric is high but the gateway feels otherwise functional.
- Logs show repeated 429s from the same conversation ID in rapid succession.
- No `Retry-After` header is being read or logged.

**Phase to address:**
HTTP client implementation — build error classification before the first real test run.

---

### Pitfall 6: SSE Stream Parsing Fragmentation

**What goes wrong:**
When reading Server-Sent Events from a streaming LLM response in Node.js, the `data` events from the HTTP response stream do not arrive one-chunk-per-SSE-line. A single `data` event callback may contain multiple SSE lines, or an SSE line may be split across two `data` events. Naive parsers that do `JSON.parse(chunk.toString().replace('data: ', ''))` on each chunk produce intermittent JSON parse errors on busy systems — errors that appear random and are hard to reproduce.

**Why it happens:**
TCP is a stream protocol. Node.js `http` module gives you data as it arrives from the network buffer, which has no relationship to SSE message boundaries. This is well-documented in the SSE spec but easy to miss when testing at low concurrency (small responses fit in one TCP packet, masking the fragmentation).

**How to avoid:**
- Maintain a string buffer per connection. Append each `data` event to the buffer. Split on `\n\n` (SSE message delimiter). Process complete messages. Carry the remainder into the next callback.
- Use a battle-tested SSE parsing library (`eventsource-parser` on npm) rather than hand-rolling — it handles fragmentation, reconnection, and `[DONE]` sentinel correctly.
- Test streaming parsing specifically by setting `content-type: application/json` with `transfer-encoding: chunked` in your test fixtures at low-level to force multi-chunk scenarios.
- The `[DONE]` sentinel in OpenAI SSE format (`data: [DONE]`) must be checked before attempting `JSON.parse` — `JSON.parse('[DONE]')` throws.

**Warning signs:**
- `SyntaxError: Unexpected token` errors that appear intermittently during streaming, more frequently under high concurrency.
- Conversations silently drop the last token (the `[DONE]` sentinel gets mishandled).
- Token count in UI doesn't match what the API reports.

**Phase to address:**
Conversation engine HTTP client — SSE parsing must be correct before any load testing is meaningful.

---

### Pitfall 7: Real-Time Dashboard Overwhelming the Browser with WebSocket Updates

**What goes wrong:**
The backend emits a WebSocket (or SSE) update for every token received from the Cortex API. At 50 concurrent conversations each streaming at ~20 tokens/second, that's 1000 WebSocket messages per second to the browser. Each message triggers a React re-render (or equivalent). The browser's main thread becomes the bottleneck — the dashboard lags and eventually freezes — while the load test itself continues correctly. The developer concludes the tool is broken when only the UI is struggling.

**Why it happens:**
The simplest implementation is "emit update on every token" because it's trivially correct. The performance cost only appears at high concurrency.

**How to avoid:**
- Batch UI updates on the server side: buffer events and flush every 100–250ms per conversation, not per token.
- On the client side, use a debounced/throttled state update — never call `setState` more than ~20 times per second for dashboard metrics.
- Separate "live conversation text" (where token-by-token feels natural for 1–2 active conversations) from "aggregate metrics" (counters, charts) — throttle aggregate metric updates to 1–2 Hz.
- Use a virtual list for the conversation list when N > 20 — rendering 50+ conversation rows with live-updating text causes layout thrashing.
- Consider not showing live conversation text for all conversations simultaneously — show aggregate status (turn count, status, latency) and allow drilling into one conversation's text.

**Warning signs:**
- Browser CPU usage spikes to 80–100% during tests.
- Dashboard frame rate drops below 30fps (visible lag).
- `window.performance.now()` timing in the browser shows 200ms+ between animation frames.
- React DevTools (or equivalent) shows re-renders firing hundreds of times per second.

**Phase to address:**
Web UI implementation — design the update batching strategy before building the WebSocket emission layer.

---

### Pitfall 8: Not Accounting for Token Usage in Bidirectional Self-Talk Cost

**What goes wrong:**
The "API talks to itself" pattern doubles token usage invisibly. Each turn consumes tokens for both the "doctor" side and the "patient" side. The full conversation history is sent on every turn — so turn N sends N messages. Token usage is not just `turns × average_response_tokens`. It's the triangular number `sum(1..N) × avg_tokens_per_message`. For a 20-turn conversation, the last 10 turns consume more tokens than the first 10 combined. If the Cortex gateway has token-based rate limits (TPM), hitting them will be unpredictable if the tool doesn't track this.

**Why it happens:**
Developers think "20 turns = 20 API calls" and estimate cost linearly. The growing context makes actual token consumption quadratic in the number of turns.

**How to avoid:**
- Extract `usage.total_tokens` from every API response and accumulate it per conversation.
- Display cumulative token usage on the dashboard — both per-conversation and aggregate.
- Add a pre-test estimate: `estimated_tokens = conversations × sum(1..turns) × avg_tokens`. Show this before starting.
- Make turn count a conscious decision by showing the cost curve in the UI ("At 20 turns, each conversation will send ~4000 prompt tokens by the final turn").

**Warning signs:**
- Test runs at high turn counts fail with `rate_limit_exceeded` errors after running fine for several minutes.
- Costs are higher than expected — each conversation costs 3–5x what a simple turn-count estimate predicts.
- API responses include `usage.prompt_tokens` growing faster than `usage.completion_tokens`.

**Phase to address:**
Metrics and conversation design — estimate token consumption before beginning a test run.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `Promise.all()` to spawn all conversations | Simple, one-liner | Thundering herd, all-or-nothing failure, no ramp control | Never — replace with staggered spawning from day one |
| Single "latency" metric per request | Fast to implement | Hides TTFT vs total time split, useless for LLM diagnosis | Never — TTFT must be separate from the start |
| `Date.now()` for timing | Familiar | Millisecond resolution, susceptible to clock drift | Use `performance.now()` always; zero additional complexity |
| `JSON.parse(chunk.replace('data: ', ''))` for SSE | Works in happy path | Breaks on multi-chunk SSE lines, on `[DONE]`, under load | Never — use `eventsource-parser` or equivalent buffer approach |
| Emit WebSocket update on every token | Simplest correct behavior | Browser overload at >10 concurrent conversations | Only acceptable during single-conversation debugging |
| Keep all conversation histories in-memory indefinitely | No cleanup code needed | Heap growth, prevents GC of completed conversations | Never — null refs after conversation ends |
| Record 429s as generic errors | Simpler error handling | Masks rate limiting signals, obscures true error rate | Never — classify from day one |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Cortex `/v1/chat/completions` streaming | Assuming `usage` is in every SSE chunk | `usage` is only in the final chunk (or not present in streaming at all for some gateways — verify behavior with Cortex specifically) |
| OpenAI-compatible format | Assuming `finish_reason` is always `"stop"` | Under load/errors, `finish_reason` can be `"length"` (context overflow), `"content_filter"`, or `null` (stream interrupted) — handle all cases |
| Authorization header | Sending API key in URL query param as fallback | Always use `Authorization: Bearer` header — never query param (logged in server access logs) |
| SSE `[DONE]` sentinel | `JSON.parse('data: [DONE]'.replace('data: ', ''))` throws | Always check `if (data === '[DONE]') return;` before parsing |
| HTTP keep-alive | Creating a new TCP connection per request | Use an `http.Agent` with `keepAlive: true` to reuse connections; 50 conversations × N turns = many requests — connection overhead matters |
| Token counting | Trusting `prompt_tokens` in streaming responses | Some OpenAI-compatible gateways omit `usage` from streaming responses entirely or only include it in the final chunk — implement a fallback token estimator |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Event loop lag inflating latency | P95 latency grows non-linearly with concurrency | Use `perf_hooks.monitorEventLoopDelay()`, consider worker_threads | 20+ concurrent streaming connections |
| Per-token WebSocket emit | Browser CPU at 100%, dashboard freezes | Batch updates server-side, throttle client-side to 20Hz max | 5+ concurrent streaming conversations in UI |
| No HTTP connection pooling | High overhead, many TCP handshakes visible in timing | `http.Agent({ keepAlive: true, maxSockets: N })` | 10+ requests/sec to same host |
| Synchronous JSON stringify of full message history | Blocks event loop briefly on each request | Message histories are strings-only — serialization is fast, but profile at 50 conversations with 20-turn histories | 100+ concurrent conversations |
| Unbounded conversation history array | Heap grows, GC pauses increase | Null ref after conversation ends; set max turns | After 1000+ completed conversations in a session |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging the API key in request logs or console output | Key exposure in log files, terminal scrollback | Never log `Authorization` header; redact in any debug output |
| Storing API key in source code or `.env` committed to repo | Key exposure in version history | Always use process.env loaded at runtime; add `.env` to `.gitignore` from the start |
| Displaying API key in the web UI | Key visible in browser history, screenshots | Show only last 4 characters (`...xxxx`) after entry; treat as a password field |
| No input validation on concurrency/turns parameters | Accidental extreme load or memory exhaustion | Set reasonable maximums: concurrency ≤ 100, turns ≤ 50, enforce in backend before test starts |
| Self-signed or missing TLS verification | MITM if testing against local Cortex proxy | Default to `rejectUnauthorized: true`; only disable with explicit CLI flag and warning |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No pre-test estimate of duration and token cost | Test runs much longer or costs much more than expected; user kills it early | Show "Estimated duration: ~N minutes, ~M total tokens" before starting |
| No way to stop a running test cleanly | User Ctrl+C kills the process, half-finished conversations leave dangling API calls | Implement a graceful stop: signal all in-flight conversations to finish their current turn, then exit |
| Dashboard shows only final results, not live progress | No visibility into whether test is working or stuck | Show live per-conversation status (turn N/M, last latency, status) from the first turn |
| Error messages from API shown as raw JSON | Incomprehensible to the user | Parse `error.message` from OpenAI error format and display human-readable |
| No indication of rate limiting happening | User thinks test is just slow | Distinguish "waiting (rate limited, retry in Xs)" from "waiting (normal LLM generation)" in per-conversation status |

---

## "Looks Done But Isn't" Checklist

- [ ] **SSE parsing:** Verify with a chunked response that splits a JSON payload across two TCP packets — use `net.createConnection` to send malformed chunks manually and confirm the parser handles it correctly.
- [ ] **TTFT measurement:** Confirm the TTFT timer stops on the _first token data event_, not on headers arrival or promise resolution.
- [ ] **Rate limit handling:** Trigger a 429 deliberately (send requests exceeding known limits) and confirm the tool backs off and retries rather than crashing or spinning.
- [ ] **Graceful stop:** Start a 50-conversation test, click Stop after 30 seconds, confirm no zombie HTTP connections remain (`lsof -p <pid> | grep ESTABLISHED`).
- [ ] **Context length limit:** Configure a conversation to run more turns than the model's context window allows; confirm the tool catches the `context_length_exceeded` error and records it as a distinct error type — not a generic failure.
- [ ] **Concurrency ramp:** Verify conversations start staggered (not all at t=0) using request timestamps in API access logs.
- [ ] **Memory stability:** Run a 100-conversation test to completion; heap size before and after should be within 50MB (Node.js heap profiler snapshot comparison).
- [ ] **Token usage accuracy:** Cross-check displayed token counts against the sum of `usage.total_tokens` from API responses across all conversations.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong latency measurement (event loop confusion) | HIGH | Instrument `monitorEventLoopDelay()`; shift timestamp capture into stream callbacks; re-baseline all measurements |
| Missing TTFT metric | HIGH | Requires touching SSE stream parser in every conversation; add TTFT capture point; invalidates historical comparison data |
| No concurrency ramp | MEDIUM | Add staggered spawn logic; existing `Promise.all()` becomes a wrapper with delays |
| Browser UI overwhelm | MEDIUM | Add server-side batching layer between event emitter and WebSocket; client throttle on state updates |
| Undifferentiated error types | MEDIUM | Add error classifier function; re-label existing error metric storage keys |
| SSE parse bugs | MEDIUM | Drop hand-rolled parser; swap in `eventsource-parser`; test with synthetic chunked responses |
| API key logged accidentally | HIGH | Rotate API key immediately; audit all log outputs; add redaction middleware |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Event loop latency inflation | Conversation engine (core HTTP client) | Measure event loop lag via `monitorEventLoopDelay()` during test runs; confirm P95 lag < 5ms at max concurrency |
| Missing TTFT/inter-token metrics | Metrics design (before any HTTP code) | Produce a test run where TTFT and total time are both logged; compare against non-streaming baseline |
| Request avalanche (no ramp) | Concurrency control implementation | Verify via Cortex access logs that requests arrive spread over ramp window, not spiked at t=0 |
| Context window memory growth | Multi-turn conversation management | Run heap profiler over 20-turn × 50 conversation test; confirm heap stabilizes |
| 429 not handled as backpressure | HTTP client error handling | Intentionally exceed rate limits; confirm retry with backoff fires, `rate_limited` metric increments |
| SSE stream fragmentation | HTTP streaming parser | Inject synthetic fragmented chunks in unit tests; confirm parser reconstructs correctly |
| Dashboard UI overload | WebSocket/UI layer | Run 50-conversation test; confirm browser CPU < 30% and frame rate > 30fps |
| Quadratic token cost surprise | Metrics and pre-test estimation | Display pre-test token estimate; verify it matches actual `usage.total_tokens` sum ±10% |

---

## Sources

- Node.js official guide "Don't Block the Event Loop" — https://nodejs.org/en/docs/guides/dont-block-the-event-loop (HIGH confidence — stable official documentation)
- Node.js `perf_hooks` module documentation for `monitorEventLoopDelay` — https://nodejs.org/api/perf_hooks.html (HIGH confidence)
- OpenAI API reference for chat completions streaming format and `usage` field behavior — https://platform.openai.com/docs/api-reference/chat (MEDIUM confidence — training knowledge, verify Cortex gateway behavior matches exactly)
- OpenAI rate limits documentation covering 429 response headers (`Retry-After`, `X-RateLimit-*`) — https://platform.openai.com/docs/guides/rate-limits (MEDIUM confidence — standard OpenAI-compatible format)
- SSE specification (W3C) on message boundary delimiting — https://html.spec.whatwg.org/multipage/server-sent-events.html (HIGH confidence — stable specification)
- `eventsource-parser` npm package documentation — https://www.npmjs.com/package/eventsource-parser (MEDIUM confidence — training knowledge, verify current version)
- Node.js `http.Agent` documentation for connection pooling and `keepAlive` — https://nodejs.org/api/http.html#class-httpagent (HIGH confidence — stable official documentation)

**Note:** WebSearch and WebFetch tools were denied during this research session. All findings are based on training knowledge (cutoff: August 2025). The technical claims here are grounded in stable, well-documented behaviors of Node.js internals, the SSE specification, and the OpenAI API format — these are unlikely to have changed materially. However, Cortex-specific behavior (whether `usage` is included in streaming responses, exact rate limit header names) MUST be validated empirically during Phase 1 development.

---
*Pitfalls research for: LLM API stress testing tool (StressCortex)*
*Researched: 2026-02-26*
