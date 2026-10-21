---
title: Terse brief output for the other work.mjs commands and state-block text
type: defer
status: open
source: user
---

## Context

Non-goal of the terse-voice work (apply-caveman-terse-contracts-to-internal-agent-communicatio): only `work.mjs show --brief` got a terse output form. Source: prove-it audit.

## Problem

Other `skills/do-it/scripts/work.mjs` commands (`list`, `event`, `set`, `verify-phase`) print full JSON, and state-block free text (`blocker`, `assumptions`, `verified`) is not held to the terse voice. Agents that only need a result still read the whole item.

## Acceptance

- Each work.mjs command that agents call mid-flow has a brief form, or a recorded reason it does not
- State-block free-text fields follow `skills/it-core/VOICE.md`, stated in STATE.md
- `npm test` covers each new brief form

## Notes

Related: docs/issues/per-step-usage-record-on-do-it-work-items.md, docs/DESIGN.md "Terse internal voice".
