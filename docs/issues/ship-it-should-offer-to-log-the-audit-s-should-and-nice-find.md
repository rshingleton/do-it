---
title: "ship-it should offer to log the audit's Should and Nice findings"
type: feature
status: open
source: ship-it spawn-caps-carries-voice
---

## Context

Raised at the ship-it question for roadmap slice R12 (spawn-caps-carries-voice). prove-it returned PASS with four Should/Nice findings. They were non-blocking, so nothing carried them forward: ship-it's question 2 asks only about `shortcut:` markers, and prove-it says ship-it carries Should and Nice findings into "the changelog or ADR notes", which a repo with no changelog and no ADR to touch (this one) never writes. The user had to ask whether to log them.

## Problem

A passing audit's Should and Nice findings have no durable home unless the repo keeps a changelog. They are lost when the plan is deleted at close.

## Acceptance

- ship-it's one question lists the audit's Should and Nice findings and asks whether to log them, defaulting to log-it as to-dos (`source: <work id> audit`)
- A repo with no changelog still records them; one with a changelog keeps the current behaviour
- prove-it's Route section says where they go, matching ship-it
- `npm run check` passes; the ship-it line budget does not grow (it is at 112 against a budget of 100)

## Notes

`skills/ship-it/SKILL.md` section 2 (question 2), `skills/prove-it/SKILL.md` section 5, `skills/log-it/SKILL.md` section 5 (callers pass `source`).
