# Neos Duel Agent

This directory contains a separate external LLM duel agent and its original MyCard-oriented tooling. It is not an integrated 706/TT client feature: the web product does not initialize MyCard SSO or offer an AI opponent. The commands below describe this optional tooling; they do not prove compatibility with the current 706 client or authorize model requests. See the [current architecture](../docs/ARCHITECTURE.md) for supported product paths.

The intended control path is:

```text
Neos browser page
    <-> Playwright
Duel Agent
    <-> LLM backend
```

The Agent owns browser automation, MyCard session reuse, prompt construction,
LLM authentication, decision validation, and translation from `actionId` to
Playwright actions. Neos still owns the real duel UI and the ygopro protocol.

## Commands

Start Neos separately:

```bash
npm run dev
```

Capture or refresh a MyCard browser session:

```bash
npm run agent:auth -- --mode headed --storage .agent/state/mycard.json
```

Run one dry Agent loop against the current page:

```bash
npm run agent:play -- --mode headed --storage .agent/state/mycard.json --max-steps 1 --dry-run
```

Inspect whether OpenAI/Codex auth is detectable without printing secrets:

```bash
npm run agent -- auth-status
```

Run the fastest local Codex credential-cache check:

```bash
npm run agent:codex-auth-check
```

Run a provider health check without opening Neos:

```bash
npm run agent:llm-check -- --llm-provider stub
```

Quickly verify the Codex harness path:

```bash
npm run agent:codex-check
```

Start the built-in Codex harness:

```bash
npm run agent:codex-harness
```

## LLM Auth

The first implementation uses a provider boundary:

- `stub`: deterministic fallback decisions, no network calls.
- `openai`: OpenAI Responses API transport, gated behind credentials.
- `codex`: an external Codex harness transport. The harness owns Codex/OAuth
  auth; the Agent does not send Codex cached tokens to the OpenAI Responses API.

By default, `play` uses the `stub` provider so the skeleton can run without
network access or secrets:

```bash
npm run agent:play -- --llm-provider stub
```

To experiment with OpenAI credentials:

```bash
NEOS_AGENT_LLM_PROVIDER=openai NEOS_AGENT_OPENAI_API_KEY=... npm run agent:play
```

To use a Codex-backed harness:

```bash
NEOS_AGENT_LLM_PROVIDER=codex \
NEOS_AGENT_CODEX_HARNESS_URL=http://127.0.0.1:8787/decision \
npm run agent:play
```

The built-in harness can be started in a separate terminal:

```bash
npm run agent:codex-harness
```

It listens on `http://127.0.0.1:8787/decision` by default. Each decision
request is converted into a pure JSON decision prompt and executed through
`codex exec` with `--ephemeral`, `--sandbox read-only`,
`--config approval_policy="never"`, and an output schema. This verifies that
the Codex CLI login can perform a real non-interactive model request without
giving the Agent direct access to Codex cached tokens.

By default, the Codex provider does not pass `--model` to `codex exec`; it uses
the model selected by your Codex CLI account/config. Pass `--model <name>` only
when you know that model is supported by your Codex login method.

For a faster auth/provider smoke test, run `npm run agent:codex-check` with
the harness running. That command sends a one-action semantic health-check
request to `http://127.0.0.1:8787/decision` and exits non-zero if Codex cannot
return a valid `actionId`.

For an even faster local-only check, run `npm run agent:codex-auth-check`. It
only verifies whether the Agent can see a Codex credential cache, so it does
not prove that a real model request can be made.

Codex caches login details in `~/.codex/auth.json` or an OS credential store.
That file contains access tokens; never commit it, print it, or put it into
logs. This Agent only reports whether a supported credential field exists.

The Codex provider follows the OpenClaw-style split between OpenAI API-key
transport and Codex runtime transport:

- OpenAI API key calls go through `--llm-provider openai`.
- Codex auth is treated as a separate runtime/harness profile.
- The Agent can detect Codex CLI login state for diagnostics, but it does not
  reuse those cached tokens as bearer tokens for `/v1/responses`.

The harness endpoint should accept:

```json
{
  "runtime": "codex",
  "authProfile": "codex-cli",
  "model": "gpt-5.1",
  "request": {
    "version": 1,
    "duelId": "...",
    "stepId": 1,
    "gameState": {},
    "legalActions": []
  }
}
```

It may return the decision directly:

```json
{
  "version": 1,
  "stepId": 1,
  "actionId": "a_001",
  "reason": "..."
}
```

or wrapped as `{ "decision": { ... } }`.
