# Phase 3: Acceptance from both issues

Plan: run-caps-count-work. Blocked by: 2.

## Goal

The two source issues' scenarios hold end to end on one run record, not only in
each cap's own unit test, and each issue says what its acceptance means under
the new counters.

## Scope

Tests and the two issue files. The R17 sequence from the audit-cap issue and
the parked-day sequence from the slice-cap issue, each walked through the
record's real commands, plus the full check run. No script changes here: a
failing acceptance test sends the phase back, it does not get a test rewritten
to pass. One acceptance bullet in the audit-cap issue was written against the
old counter and is amended in the issue, not silently dropped.

## Files

tests/run-gate.test.mjs
docs/issues/the-slice-cap-counts-the-time-a-slice-is-parked-waiting-for.md
docs/issues/the-per-slice-audit-cap-parks-a-slice-whose-rounds-each-foun.md

## Seams

- A record driven only through `run new`, `run start`, `run slice`, `run
  audit`, `run verify` and `run gate`: catches a cap that fires where the loop
  would not, which is the whole point. It misses a loop step the record does
  not see, such as a prove-it round that never reached `run audit`.

## Steps

1. The interruption acceptance: with a 30-minute cap, start the slice two days
   back with `run start --at`, verify ten minutes in, start it again ten minutes
   back, verify and gate `allow`; the same record without the second start
   refuses with `SLICE_CAP`. Then park a slice, advance a day, resume it, verify
   and gate `allow`; then a fresh record with no cap and a day-old span →
   verify: all four cases, named for the issue.
2. The converging-audit acceptance: two rounds that each raise a new Must, a
   third call allowed with `audit_spent` 0, then rounds repeating the same Must
   until the refusal names the unreviewed fix → verify: one test walks R17's
   shape and one walks the same-Must loop.
3. Amend the source issues: the slice-cap issue gains the interrupted-session
   bullet its acceptance lacked, and the audit-cap issue's "a slice that fails
   twice on the same Must is still parked" becomes the repeat rule the cap now
   counts, with the number it parks at → verify: neither issue names a rule the
   code does not hold.
4. Full checks: `npm test && npm run check` → verify: exit 0.

## Done when

- Every acceptance bullet in both source issues is named by a test in
  `tests/run-gate.test.mjs`, or amended in its issue with a reason.
- `npm test && npm run check` passes.

## Starting points

tests/run-gate.test.mjs (the slice-cap, audit-cap and resume tests)
docs/issues/the-slice-cap-counts-the-time-a-slice-is-parked-waiting-for.md
docs/issues/the-per-slice-audit-cap-parks-a-slice-whose-rounds-each-foun.md
