---
title: The slice cap counts the time a slice is parked waiting for the user
type: bug
status: open
source: user
---

## Context

Found running `/finish-it docs/roadmap/build-ini-to-yaml.md` in a consumer repo (MAT-496). Touches `skills/do-it/scripts/gate.mjs` (the `SLICE_CAP` check at line 153), `skills/do-it/scripts/run.mjs` (`slice_cap_min`, `run start`, `run slice ... ready`) and `skills/finish-it/STOPS.md`.

The user's words: "This cap issue seems to be a bug, this was a small effort."

## Problem

`run gate` refused a slice with `SLICE_CAP` when `started` was more than `slice_cap_min` (default 120) minutes ago. `started` was set by `run start` and the wall clock kept running while the slice was parked for a user decision.

Sequence seen: R6 was built and started, parked with `--needs decision`, and waited for the user for most of a day. After the user answered, the slice passed its audit and `run gate` returned `{"allow":false,"reason":"SLICE_CAP","detail":"1035 min, cap 120"}`. The work itself took well under an hour.

Calling `run start` again did not reset the clock, and `run slice ... ready` did not either. The only way through was `run set <slug> slice_cap_min <n>`, a change to a guard the run's own safety rails then (correctly) treated as sensitive.

## Acceptance

- A slice's cap counts only the time it is in flight (building, auditing, shipping), not the time it is parked
- `run slice <slug> <id> ready` after a park starts the slice's in-flight clock fresh, or subtracts the parked time
- A session interrupted between commands (a machine that slept, a lost host) resumes into a fresh in-flight span on its next `run start`, so the gap is not counted; the same record without that second start still refuses `SLICE_CAP`
- A test in `tests/run-gate.test.mjs` parks a slice for longer than `slice_cap_min`, resumes it, and expects `run gate` to allow
- `skills/finish-it/STOPS.md` says what the cap measures

## Notes

Related: the same gate returned `STALE_VERIFY` after other slices committed to the tree between this slice's verify and its gate; the fingerprint covers the whole change since `base_ref`, so a concurrent slice invalidates an earlier slice's verify. Worth a separate issue if it recurs.

The gate already subtracts queue time (`waited_ms`, gate.mjs lines 149-152: "Queue time is not work time"); parked time is the same kind of wait and could be subtracted the same way.
