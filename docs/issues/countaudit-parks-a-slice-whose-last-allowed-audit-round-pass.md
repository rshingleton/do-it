---
title: countAudit parks a slice whose last allowed audit round passed
type: bug
status: open
source: tracks-mode
---

## Context

Found by the tracks-mode audit (phase 5). Modules: `skills/do-it/scripts/gate.mjs` (`countAudit`, `gate`).

## Problem

`countAudit` refuses a round at a slice's cap and parks the slice with "its last audit did not pass", even when that last allowed round passed and `gate` would allow the ship. A caller that asks for one more round after a passing last round loses a slice that could have shipped.

## Acceptance

- A slice whose last allowed audit round passed is not parked by a refused later round.
- A slice whose last allowed round failed is still parked.

## Notes

`skills/do-it/scripts/gate.mjs` `countAudit`; surfaced in tracks-mode phase 5; `tests/tracks-record.test.mjs` covers the refusal path.
