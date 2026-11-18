# Phase 1: The slice cap counts in-flight minutes

Plan: run-caps-count-work. Blocked by: none.

## Goal

`run gate` refuses a slice with `SLICE_CAP` only when the minutes it spent in
flight exceed `slice_cap_min`. Time between sessions is not work: a park the
user must settle, a machine that slept, a lost session, all fall outside the
in-flight spans. An unset cap means no cap.

## Scope

The gate entry accumulates in-flight spans instead of counting from one start
time: `active_ms` for closed spans and `active_since` for the open one, plus
`last_seen`, the last moment a command showed the slice was alive. `run start`
opens a span, and a second call closes the old one at the earlier of its own
time and `last_seen`, so the gap since the last evidence of work is not
charged, then opens a new span. One helper closes a span, clamping at zero, for
both `run slice <id> parked` and the audit cap's auto-park; `ready` opens a new
span and stamps `last_seen`. `gate` sums the spans and subtracts the queue time
it already subtracts. A record written before this change, which has `started`
and no spans, reads its open span from `started`, so it gates as it does today
until its next `run start`, park or resume opens a fresh one, which is also how
the issue's own record is fixed without a migration. `run.mjs` accepts a null
`slice_cap_min` at `run new` and `run set`. `runs.mjs` records the queue time a
merged verify spends, which it takes today and drops. Docs and tests follow.
The cap's number and its default stay as they are.

## Files

skills/do-it/scripts/gate.mjs
skills/do-it/scripts/run.mjs
skills/do-it/scripts/runs.mjs
skills/do-it/scripts/work.mjs
skills/do-it/scripts/stops.mjs
skills/do-it/STATE.md
skills/finish-it/SKILL.md
skills/finish-it/STOPS.md
skills/track-it/CONFIG.md
tests/run-gate.test.mjs
tests/work.test.mjs
tests/tracks-check-slot.test.mjs

## Seams

- `gate(record, id, {now})` with `active_ms`, `active_since` and `waited_ms`:
  catches the span sum, the queue subtraction and a null cap refusing anyway.
  It misses a caller that never opens a span, which then reads as no work.
- `startSlice` called twice: catches a resumed session closing the old span at
  `last_seen` instead of at its own time. It misses a session that resumes
  without calling it, which is the documented limit.
- `run slice parked` and the audit cap's auto-park: one helper closes the span
  and clamps at zero, so an audit park cannot leave a clock running and a
  resumed slice cannot refund work. It is exported from `run.mjs` and used by
  `gate.mjs`, so the unused-export test sees it used.
- `run start`, `run verify` and `run audit` each write `last_seen`: catches a
  slice whose last activity was hours before the command that ends its span. A
  `run audit --final` writes none, so the final review does not create a gate
  entry with no slice id.
- A merged or in-place verify stamps `last_seen` after the check returns from
  the check slot, so its queue wait is not both charged and subtracted.
- `run verify --merged` under a held check slot: catches the dropped
  `recordWaited`. It misses a wait that returns before the slot is held.
- A record with `started` and no span fields: catches a pre-change record
  gating as it always did, and the first new span replacing that fallback.

## Steps

1. Accept a null cap: `validate` and `createRun` take `slice_cap_min` as
   optional, `gate` skips the check when it is null, and `CONFIG.md` and
   `STATE.md` say empty means no cap → verify: `run set <slug> slice_cap_min
   null` stores null, and a slice whose span is a day long still gates `allow`
   when the cap is null.
2. Count spans: `run start`, `run verify` (both trees) and `run audit` write
   `last_seen`, a `--final` audit writes none; `run start` closes an open span
   at the earlier of its own time and `last_seen` (clamped at zero) and opens a
   new one; one helper does the same close for `run slice <id> parked` and the
   audit cap's auto-park, while `ready` opens a new span and stamps
   `last_seen`; `gate` counts `active_ms + (now - active_since) - waited_ms`,
   with a record that has only `started` reading `active_since = started`.
   `run slice`, `run verify` and `run audit` take `--at` for their record write
   only, as `run start` does, while `--date` stays the plan's date → verify:
   with a 30-minute cap, a session that started two days back, verified ten
   minutes in and started again ten minutes ago gates `allow`; the same record
   without the second start refuses with `SLICE_CAP`; parking and resuming a day
   later also allows.
3. Record queue time in a merged verify: `runVerifyMerged` calls `recordWaited`
   as `runVerify` does (T260) → verify: a merged verify that waited for the
   slot leaves `waited_ms` greater than zero on the slice's gate entry.
4. Reword the notes and the loop: `stops.mjs` and `STOPS.md` say the cap
   measures in-flight minutes, and finish-it's step (b) says a slice already in
   flight calls `run start` again, which opens a new span → verify: the existing
   test comparing `STOPS.md` to `STOPS` keys passes, and the loop-call-sites
   test still finds every call.

## Done when

- Both acceptance bullets of
  `docs/issues/the-slice-cap-counts-the-time-a-slice-is-parked-waiting-for.md`
  hold in tests, and a session interrupted for a day gates `allow` after its
  next `run start`.
- `npm test` passes.

## Starting points

skills/do-it/scripts/gate.mjs (`gate`'s cap block, `startSlice`)
skills/do-it/scripts/run.mjs (`cap`, `createRun`, `sliceRun`, `resumeSlice`)
skills/do-it/scripts/runs.mjs (`runVerify`, `runVerifyMerged`)
tests/run-gate.test.mjs (the slice-cap test)
