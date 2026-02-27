# Feature Research

**Domain:** LLM API stress testing / load testing with multi-turn conversation simulation
**Researched:** 2026-02-26
**Confidence:** MEDIUM (web tools unavailable; drawn from training knowledge of k6, Locust, Artillery, LLMPerf, and OpenAI-compatible load testing patterns as of August 2025 — verify against current tools before roadmap finalization)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features any LLM/API load testing tool must have. Missing these = tool is not credible.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Configurable concurrency level | Core purpose of a stress test — test N simultaneous users | LOW | Simple worker pool or Promise.all pattern |
| Configurable number of requests/conversations | Users need to define test scope without code changes | LOW | CLI flag or config file; N conversations x M turns |
| Latency metrics per request | First thing anyone checks after a test | LOW | Time-to-first-byte and total response time; p50/p95/p99 are expected |
| Throughput reporting (req/s, tokens/s) | Validates gateway capacity claims | LOW | Derived from collected timestamps |
| Error rate tracking | Cannot interpret latency without error context | LOW | HTTP status codes + network errors separated |
| Real-time progress display | Without this, users don't know if the tool is working | MEDIUM | Terminal progress bar or live web UI |
| Test completion summary report | Users need a single artifact to share/compare runs | LOW | Printed to stdout and/or exportable file |
| API key configuration | Required to hit any authenticated endpoint | LOW | Env var (`CORTEX_API_KEY`) is the standard; never hardcode |
| Graceful error handling / test continuation | One failed conversation must not kill the whole test | MEDIUM | Isolated per-conversation error handling, continue others |
| Reproducible test runs | Same config = same test conditions | LOW | Deterministic seed for any random elements; config file |

### Differentiators (Competitive Advantage)

Features that set StressCortex apart from generic load testers. These align with the core value: simulating realistic, context-heavy LLM conversations at scale.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-turn conversation simulation with growing context | Generic tools send isolated requests; LLM gateways fail differently under accumulating token load — this is the actual failure mode to expose | HIGH | Full conversation history (`messages` array) sent every turn; context grows linearly per turn |
| Role-playing self-talk engine (medical professional + patient) | Realistic prompt variation unlike synthetic "hello world" requests; each turn's response shapes the next, creating genuine dialogue branching | HIGH | Two system prompts; each API response becomes next user message |
| Per-conversation turn-by-turn latency tracking | Reveals context-size degradation — does turn 10 take longer than turn 1? This is a critical LLM-specific insight generic tools miss | MEDIUM | Store latency array per conversation indexed by turn number |
| Token usage tracking (prompt + completion tokens) | LLM gateways throttle by tokens, not requests; token curves expose real capacity limits | MEDIUM | OpenAI-compatible response includes `usage.prompt_tokens`, `usage.completion_tokens` |
| Live web UI dashboard | Terminal output is not enough for monitoring a 20-minute stress test with 50 concurrent conversations | HIGH | Local web server (Fastify/Express) + WebSocket/SSE push to browser |
| Conversation-level status tracking (active / completed / errored) | Users need to see which conversations are healthy vs. stuck vs. failed — not just aggregate numbers | MEDIUM | Per-conversation state machine in memory |
| Context window growth visualization | Plot context size (tokens) vs. latency per turn — the insight that proves whether Cortex degrades under load | HIGH | Requires per-turn token counts + latency; chart in web UI |
| Streaming response support | The real API may return `stream: true`; non-streaming tests miss head-of-line blocking behavior | HIGH | SSE/chunked response parsing; time-to-first-token metric |
| Configurable turn delay / think time | Realistic users don't respond instantly; adding inter-turn delay prevents artificial thundering-herd patterns | LOW | `turnDelay` config option with min/max range |
| Export results to JSON/CSV | Enables external analysis (Excel, Python, Grafana) without building charts into the tool | LOW | Serialize in-memory results at test end |
| Test presets / scenario profiles | "Quick smoke test" vs "full soak test" without reading docs each time | LOW | Named configs in a presets file |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like good ideas but create scope creep or genuine problems for this tool.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Persistent database / historical run storage | "I want to compare this run to last week" | Adds schema management, migrations, query complexity — this is a local CLI tool, not an observability platform | Export each run to a timestamped JSON file; users compare externally |
| Authentication / user management | Multi-person teams want shared results | Single-user local tool by design; auth would double the build scope | Share exported JSON files manually; not in scope |
| Testing non-`/v1/chat/completions` endpoints | "While we're here, test the embeddings endpoint too" | Each endpoint has different semantics; multi-endpoint support fragments focus | Explicit project constraint: `/v1/chat/completions` only |
| Automatic LLM response quality scoring | "Detect if the model is hallucinating under load" | Quality evaluation requires a second LLM call or human judgment — this is a load tester, not an eval framework | Log conversation transcripts for manual review; defer to dedicated eval tools |
| Real-time Grafana / Prometheus integration | "Push metrics to our existing stack" | Adds infrastructure dependencies to a local-only tool; users would need Prometheus running locally | Export to JSON; users can ingest into Grafana separately |
| Distributed load generation (multi-machine) | "I want to generate traffic from 10 machines" | Cortex gateway is being tested; the machine running the test is not the bottleneck — Node.js handles thousands of concurrent HTTP requests | Single-machine async Node.js is sufficient for realistic LLM concurrency (LLM response times are seconds, not milliseconds) |
| Replay recorded conversations | "Let me feed in real patient conversation transcripts" | Adds file parsing, format validation, conversation ingestion pipeline | Start with synthetic generation; add replay as v2 feature if validated need arises |
| Interactive conversation editing in UI | "Let me tweak the system prompt mid-test" | Mid-test mutation introduces confounding variables; results become uninterpretable | Config before run; restart for changes |

---

## Feature Dependencies

```
[API key configuration]
    └──requires──> [Core HTTP client to /v1/chat/completions]
                       └──requires──> [Single-turn request/response]
                                          └──requires──> [Multi-turn conversation loop]
                                                             └──requires──> [Concurrent conversation spawning]

[Multi-turn conversation loop]
    └──requires──> [Per-turn latency tracking]
                       └──enhances──> [Context window growth visualization]

[Token usage tracking]
    └──requires──> [Parsing OpenAI usage field from response]
    └──enhances──> [Context window growth visualization]
    └──enhances──> [Throughput reporting (tokens/s)]

[Live web UI dashboard]
    └──requires──> [In-memory conversation state store]
    └──requires──> [Real-time push mechanism (WebSocket or SSE)]
    └──enhances──> [Per-conversation status tracking]
    └──enhances──> [Context window growth visualization]

[Streaming response support]
    └──conflicts with──> [Simple JSON response parsing]
    (streaming requires SSE/chunked parsing, changes latency measurement semantics)

[Test completion summary report]
    └──requires──> [Per-turn latency tracking]
    └──requires──> [Error rate tracking]
    └──requires──> [Token usage tracking]
```

### Dependency Notes

- **Multi-turn loop requires single-turn request first:** The conversation engine is built on top of a working single-turn HTTP call. Validate the single-call path before layering in history management.
- **Web UI requires in-memory state store:** The dashboard reads from a central state object updated by the conversation engine. That state object must exist and be well-typed before the UI layer is built.
- **Context window visualization requires both token tracking and per-turn latency:** Both data streams must be captured simultaneously at the turn level; they cannot be added independently after the fact.
- **Streaming conflicts with standard response handling:** Choosing to support streaming (`stream: true`) fundamentally changes how the HTTP response is read and how time-to-first-token vs. total latency are measured. This decision should be made early — retrofitting streaming onto a non-streaming architecture is painful.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to run the first real stress test against Cortex and get actionable results.

- [ ] **Core conversation engine** — single HTTP client calling `/v1/chat/completions` with OpenAI message format
- [ ] **Multi-turn loop** — send full conversation history each turn; loop for M turns per conversation
- [ ] **Role-based system prompts** — medical professional and patient system prompts hardcoded (configurable later)
- [ ] **Concurrent conversation spawning** — spin up N conversations simultaneously; configurable N
- [ ] **Per-turn latency tracking** — record time for each API call, per conversation, per turn number
- [ ] **Token usage tracking** — parse `usage.prompt_tokens` + `usage.completion_tokens` from each response
- [ ] **Error handling** — isolate failures per conversation; record error, continue others
- [ ] **Test summary report** — printed at completion: p50/p95/p99 latency, total tokens, error rate, throughput
- [ ] **API key via environment variable** — `CORTEX_API_KEY` env var; fail fast with clear error if missing
- [ ] **Live web UI dashboard** — local Express/Fastify server; browser shows real-time conversation status, latency, token curves; WebSocket or SSE push

The web UI is included in v1 because without it the test is opaque — you cannot see what is happening across 20+ concurrent conversations. Terminal progress is insufficient.

### Add After Validation (v1.x)

Features to add once core works and the tool has been used for at least one real test run.

- [ ] **Config file support** — JSON/YAML config instead of hard-coded defaults; load N, M, delay, endpoint
- [ ] **Export to JSON/CSV** — serialize results at test end for external analysis
- [ ] **Configurable turn delay** — inter-turn think time to simulate realistic pacing
- [ ] **Test presets** — named scenarios ("smoke", "soak", "spike") with pre-tuned parameters
- [ ] **Context window growth chart** — visualize tokens vs. latency curve in the web UI

### Future Consideration (v2+)

Features to defer until the tool has proven value and specific needs are confirmed.

- [ ] **Streaming response support** — time-to-first-token metric; requires significant architecture change; only add if Cortex streaming is a real use case
- [ ] **Replay recorded conversations** — feed real conversation transcripts; requires transcript format specification
- [ ] **Custom scenario plugins** — allow non-medical conversation scenarios without code changes
- [ ] **Prometheus/metrics push** — for teams who already have an observability stack

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Core HTTP client + single turn | HIGH | LOW | P1 |
| Multi-turn conversation loop with history | HIGH | LOW | P1 |
| Concurrent spawning (N conversations) | HIGH | LOW | P1 |
| Per-turn latency tracking | HIGH | LOW | P1 |
| Token usage tracking | HIGH | LOW | P1 |
| Error isolation per conversation | HIGH | LOW | P1 |
| Test summary report | HIGH | LOW | P1 |
| API key via env var | HIGH | LOW | P1 |
| Live web UI dashboard | HIGH | HIGH | P1 |
| Role-based system prompts (hardcoded) | MEDIUM | LOW | P1 |
| Config file support | MEDIUM | LOW | P2 |
| Export JSON/CSV | MEDIUM | LOW | P2 |
| Configurable turn delay | MEDIUM | LOW | P2 |
| Context window growth chart | HIGH | MEDIUM | P2 |
| Test presets | LOW | LOW | P2 |
| Streaming response support | MEDIUM | HIGH | P3 |
| Replay recorded conversations | LOW | HIGH | P3 |
| Custom scenario plugins | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — without this the tool cannot fulfill its core purpose
- P2: Should have — adds significant value, low risk to defer to v1.x
- P3: Nice to have — validate need before building

---

## Competitor Feature Analysis

Analyzed against: k6, Locust, Artillery, LLMPerf (Anyscale), and generic OpenAI stress test scripts found in open source.

| Feature | k6 / Locust / Artillery (generic load testers) | LLMPerf (dedicated LLM tester) | StressCortex approach |
|---------|------------------------------------------------|--------------------------------|-----------------------|
| Multi-turn conversation | Not built-in; requires custom scripting | Single-turn only (measures TTFT, throughput) | Native: core loop is multi-turn |
| Growing context window handling | Not built-in | Not applicable | Native: full history sent every turn |
| LLM-specific metrics (TTFT, tokens/s) | Not built-in | Core feature | Tokens/turn natively; add TTFT if streaming |
| Role-play scenario | Not built-in | Not applicable | Native: medical professional/patient |
| Real-time web dashboard | k6 has k6 Cloud (paid); Locust has basic web UI | None | Native: local web server |
| Per-conversation tracking | Aggregate only | None | Native: individual conversation state |
| Concurrency | Core feature of all | Core feature | Core feature |
| OpenAI-compatible format | Not format-aware | Yes | Yes (built for this format) |
| Local-only operation | Yes (k6, Locust) | Yes | Yes (by design) |
| Config without code | Yes (all) | Partial | v1.x target |

**Key insight:** No existing tool combines multi-turn conversation simulation + growing context + per-turn metrics + live dashboard in a single local tool. Generic load testers require significant scripting to simulate LLM conversation patterns. LLMPerf measures raw throughput but not conversation-level behavior. StressCortex fills a real gap.

---

## Sources

- Training knowledge of k6 (https://k6.io), Locust (https://locust.io), Artillery (https://artillery.io), Gatling as of August 2025 — MEDIUM confidence
- Training knowledge of LLMPerf (Anyscale open source LLM benchmarking tool) as of August 2025 — MEDIUM confidence
- OpenAI chat completions API response format (`usage` field, `messages` array) — HIGH confidence (stable API, well-documented)
- Project context from `/Users/kybernet/Projects/stressCortex/.canopy/PROJECT.md` — HIGH confidence (primary source)
- Web search tools unavailable during this research session; findings are not verified against current competitor feature pages

**Note:** Because web search and WebFetch were unavailable, all competitor analysis is from training data (cutoff August 2025). The competitor landscape should be verified before roadmap finalization — search for "LLM load testing tools 2026" and check if any new dedicated tools have emerged.

---
*Feature research for: LLM API stress testing / multi-turn conversation load simulation*
*Researched: 2026-02-26*
