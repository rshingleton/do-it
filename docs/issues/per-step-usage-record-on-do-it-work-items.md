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

- Each step appends one usage record to the work item state: step, round
  (for prove), input and output tokens, cost, subagent count.
- Records are written only through `work.mjs` and survive `normalize()` on
  older plans that lack the field.
- A hook captures usage (SubagentStop and Stop, or the host equivalent) and
  fails open: missing or malformed usage data never blocks the agent.
- `ship-it` shows per-step and total usage in its summary.
- OpenCode gets the record too, or the gap is documented.

## Notes

- Retro handoff item 5; items 1 to 4, 6 and 7 were built on
  `do-it/retro-items`.
- Check what usage fields the SubagentStop and Stop hook inputs carry
  before designing the record; a transcript read may be needed.
