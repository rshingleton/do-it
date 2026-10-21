---
title: Spawn caps above the agent cap are dead and unchecked
type: bug
status: open
source: user
---

## Context

prove-it audit of the terse-voice work. Each `it-*` agent states a word cap and "or the brief's lower cap". Spawn paragraphs in skills state their own cap.

## Problem

Where a spawn cap is higher than the agent's, the agent cap wins and the spawn number is dead: `skills/map-it/SKILL.md:37` says 500 (scout cap 300), `skills/doubt-it/SKILL.md:19` says 300 (skeptic cap 200). Nothing checks the two numbers agree, so they drift.

## Acceptance

- The two spawn caps equal or fall below the agent caps
- `npm run check` fails a spawn paragraph naming `it-x` whose cap exceeds the cap in `agents/it-x.md`
- A regression test covers the new rule

## Notes

`agents/it-scout.md:15`, `scripts/check.mjs:170-188`.
