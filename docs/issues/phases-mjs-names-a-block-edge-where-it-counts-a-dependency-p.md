---
title: phases.mjs names a block edge where it counts a dependency path
type: bug
status: open
source: r8-plan-text
---

## Context

Surfaced by R8 (`r8-plan-text`) while reconciling the plan-format text with the code. `skills/scope-it/scripts/phases.mjs` is the Locality check's script; its error text is the only place left that says "block edge".

## Problem

`skills/scope-it/scripts/phases.mjs:133` reports a shared file as "two phases no block edge separates", but the rule it implements is a dependency path in either direction, direct or through other phases, and the same rule now reads that way in `skills/scope-it/CHECKS.md` and `GRILL.md`. A reader who hits the error is told a narrower rule than the script applied.

## Acceptance

- The message names the dependency path (either direction, direct or through other phases), matching CHECKS and GRILL.
- `npm test` passes, including whichever test pins the message.

## Notes

Found by R8, whose files did not include the script. Filed during the `todo-clearance-2026-11` run with source slice R8 (`r8-plan-text`).
