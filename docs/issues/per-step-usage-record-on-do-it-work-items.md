---
title: Per-step usage record on do-it work items
type: feature
status: open
source: retro-it
---

## Context

Retro of the `named-model-agents` work item (3983317). Round 1 audit
reviewers (`it-reviewer`) cost about 20k to 37k tokens each, and nobody saw
it until the retro. Involves the work item state block
(`skills/do-it/STATE.md`, `skills/do-it/scripts/work.mjs`, `state.mjs`),
the Claude Code hook (`hooks/claude.mjs`) and `ship-it`. Idea from the
"band" in dietrichgebert/ponytail.

## Problem

A do-it work item records no usage. The user cannot see what a step
(scope, build, prove, ship) cost, or which subagents drove that cost,
until someone reconstructs it by hand.

## Acceptance

Rescoped 2026-10-22: capture is done (see the Answered note below), and a
`work.mjs` state field is deferred until the ledger's numbers have been acted
on. What remains is attributing usage to a work item.

- [x] A hook captures usage (SubagentStop and Stop) and fails open: missing or
  malformed usage data never blocks the agent. Done as `skills/usage-it`.
- [x] Subagent counts: runs per agent in `/usage-it`.
- [ ] A work item's usage can be read per phase (scope, build, prove, ship)
  without a second capture path: derive it from the ledger's session id and
  timestamps against the time each phase skill ran. Only if that proves too
  coarse, add a record in the state block written through `work.mjs` (survives
  `normalize()` on older plans) and show it in `ship-it`'s summary.
- [ ] OpenCode gets the record too, or the gap stays documented
  (`docs/DESIGN.md`).
- [ ] Decide whether "cost" is wanted: the ledger is tokens only, since prices
  change.

## Notes

- OpenCode: no usage or cost hook is documented in v1 or v2 plugin docs
  (`docs/research/opencode-v2-integration.md`), but the v1 `event` hook does
  carry them (next note). v2 holds session and message `cost` and `tokens` in
  its server API (not in plugin hooks), with child sessions linked by
  `parentID`; a host-neutral record is `{agent, model, tokens: {input, output,
  reasoning, cache.read, cache.write}, cost_usd}`. OpenCode work is tracked
  as step 6 of that issue.
- Verified 2026-10-21 on OpenCode 1.18.35 (`docs/research/opencode-v2-integration.md`):
  a plugin's v1 `event` hook receives `message.updated` for each assistant
  message with `agent`, `modelID`, `providerID`, `cost` and `tokens` (`total`,
  `input`, `output`, `reasoning`, `cache.read`, `cache.write`); subagent
  messages carry their own `sessionID`. So OpenCode can feed the record once
  `work.mjs` has a usage field; no OpenCode code is written before that
  exists. On OpenCode 2.1.2 (verified) `ctx.event.subscribe` yields
  `session.step.ended` and `session.usage.updated` with `cost` and `tokens`,
  without agent or model; the `context` hook has those per request.

- Retro handoff item 5; items 1 to 4, 6 and 7 were built on
  `do-it/retro-items`.
- Check what usage fields the SubagentStop and Stop hook inputs carry
  before designing the record; a transcript read may be needed.
- Answered 2026-10-21: the Stop and SubagentStop hooks give `transcript_path`, `session_id`, `agent_id`, `agent_type` (and `agent_transcript_path`); a transcript read is needed. `skills/usage-it/scripts/ledger.mjs` now sums it (each `message.id` once) into a per-agent ledger (30 days raw, then a 365-day daily rollup), so this issue needs only the step attribution and the `work.mjs` field, not a second capture path. Claude Code only; OpenCode is unchanged. Covered so far: the hook capture and a subagent count (runs per agent), as `/usage-it` (`--days`, `--hours`). Still open: the per-step record in the state block through `work.mjs`, `normalize()` for older plans, `ship-it` showing per-step and total usage, and OpenCode. The ledger is tokens only, so the acceptance line's "cost" needs a decision.
- First use case: `docs/research/caveman-baseline.md` measured the terse-voice change by hand from transcripts (one run per side, inconclusive); a recorded per-step usage would replace that script and give real work items as the sample.
