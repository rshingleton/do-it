---
title: A refused audit round leaves a stale parked entry after a later passing round
type: bug
status: open
source: r1-countaudit
---

## Context

Found by R1's merge review (`r1-countaudit`), in `skills/do-it/scripts/gate.mjs` (`countAudit`) and the run record it writes.

## Problem

When `run audit` refuses a round at a slice's cap it parks the slice. After the fix in R1 a later passing round clears the refusal marker and `audit_stop`, but the record's `slices` entry stays `{status: "parked"}`.

Case, at `audit_cap` 1:

1. spend the slice's round (`run audit road R1`);
2. ask for another (`run audit road R1`) - refused, R1 parked;
3. `work.mjs event api audit-pass`;
4. ask again (`run audit road R1`) - refused; the marker and `audit_stop` are cleared, the parked entry is not.

`run next` then returns `parked: ["R1"]` and picks the next slice, so a slice that can ship is held back by a stale park. `tests/tracks-record.test.mjs` runs exactly this sequence and asserts only the marker and the stop.

## Acceptance

- A refused round after the slice's last allowed round passed leaves no `slices` entry for that slice parked by the earlier refusal, so `run next` does not list it as parked.
- A promise kept from the failing case still parks the slice.

## Notes

`skills/do-it/scripts/gate.mjs:126-130`; `tests/tracks-record.test.mjs:131-146`. Filed during the `todo-clearance-2026-11` run by slice R1 (`r1-countaudit`).
