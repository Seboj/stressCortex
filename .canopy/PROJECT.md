# StressCortex

## What This Is

A stress testing tool for the Cortex LLM Gateway conversation API (`https://cortex.nfinitmonkeys.com`). It simulates realistic multi-turn medical consultations by having the API talk to itself — one side as a medical professional, the other as a patient — while tracking performance, concurrency, and conversation quality through a local web interface.

## Core Value

Validate that the Cortex conversation API handles high concurrency with multi-turn, context-heavy conversations without degradation — proving it works under real-world load before production use.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Conversation engine that drives self-talking medical dialogues via the Cortex API
- [ ] Multi-turn conversation management with full history sent as JSON context each turn
- [ ] Concurrent conversation spawning (many simultaneous dialogues)
- [ ] System prompt engineering for medical professional and patient roles
- [ ] Local web UI dashboard showing live conversation tracking
- [ ] Performance metrics (latency, throughput, error rates, token usage)
- [ ] API key configuration (user provides their Cortex API key)
- [ ] Configurable test parameters (number of conversations, turns per conversation, concurrency level)

### Out of Scope

- Production deployment — this runs locally only
- Authentication/user management — single-user local tool
- Persistent storage — in-memory during test runs, optional export
- Testing non-conversation endpoints — focused on `/v1/chat/completions` only

## Context

**Target API:**
- Base URL: `https://cortex.nfinitmonkeys.com`
- Endpoint: `POST /v1/chat/completions` (OpenAI-compatible format)
- Auth: `Authorization: Bearer <api-key>`
- Health check: `GET /health` returns `{"status":"ok","service":"cortex"}`
- The API is a secure LLM inference gateway (proxy to LLM backends with auth, rate limiting, usage tracking)

**Conversation Pattern:**
1. Medical professional sends: "How are you feeling today?"
2. Patient (same API, different system prompt) responds naturally
3. Medical professional follows up based on patient's response
4. Loop continues, always sending full conversation history
5. Each message includes role-appropriate system prompts instructing how to respond

**Stress Pattern:**
- Spin up N concurrent conversations simultaneously
- Each conversation runs M turns
- All conversations hit the same API endpoint
- Track everything: latency per turn, total conversation time, errors, token counts

## Constraints

- **Tech stack**: Node.js/TypeScript — runs locally, simple `npm start`
- **API format**: OpenAI-compatible chat completions (messages array with role/content)
- **Runtime**: Local development machine only
- **API key**: User-provided at startup (environment variable or UI input)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenAI-compatible format | Cortex API follows this standard | — Pending |
| Self-talking conversations | Realistic load pattern with growing context windows | — Pending |
| Medical professional scenario | Domain-specific prompts create realistic, varied conversations | — Pending |
| Local web UI | Real-time visibility into test progress and results | — Pending |

---
*Last updated: 2026-02-26 after initialization*
