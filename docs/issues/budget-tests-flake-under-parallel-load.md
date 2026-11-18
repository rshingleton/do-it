---
title: Budget tests flake under parallel load
type: bug
status: open
source: user
---

## Context

Surfaced by the `run-caps-count-work` build (phase 3) and again by a
`work.mjs verify-phase` run: the suite failed once with an assertion in a
budget test, then passed on the same command run again.

Reported by the builder as: "changeset and hook-trust budget tests flake under
parallel load; pass alone and on rerun."

## Problem

`npm test` runs every `tests/*.test.mjs` in parallel (`scripts/test.mjs` passes
the whole file list to `node --test`). Some tests assert a wall-clock budget
("stays fast", "within budget"). Under parallel load the machine is saturated,
so the measured time crosses the ceiling and the assertion fails, though nothing
regressed. The failure is non-deterministic: `node --test <file>` alone passes,
and a rerun passes.

A flaky budget test is worse than no test: it aborts `verify-phase`, so a phase
is not recorded and the loop stalls on a machine-load artefact.

## Acceptance

- Every wall-clock budget assertion is either scoped to run serially, given a
  ceiling wide enough for a saturated machine, or replaced by a count that does
  not depend on timing (bytes scanned, patterns compiled, files opened).
- `npm test` passes repeatedly on a loaded machine (run it 3 times with the
  suite also running, or with `stress`-style CPU pressure).
- A failure names the test that failed, so the next run is a diagnosis rather
  than a guess.

## Notes

- Reported files: `tests/changeset.test.mjs` and `tests/hook-trust.test.mjs`
  budget cases. The exact test name was not captured before the rerun passed.
- The suite was consolidated from 721 to 550 tests on 2026-11-17; the remaining
  slow files are `run-commit`, `changeset`, `scripts-regressions`,
  `install-links` and `tracks-*`.
- A parallel run also makes `timing` assertions in `tests/hooks-regressions`
  suspect (the "fast on its own prefixes" ReDoS test is one worth keeping, so
  widen it rather than delete it).
