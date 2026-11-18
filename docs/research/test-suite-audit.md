# Test-suite audit

Date: 2026-11-17. Scope: `tests/*.test.mjs`, 49 files, 11,478 lines, 721
tests by the runner's own count. Method: five read-only passes, one per group
of files, each classifying every test as keep, merge, drop or weaken and
estimating its process cost from the fixture it builds. No test was edited and
no timing run was made: wall-clock figures are either observed in a full
`npm test` run or estimated from fixture shape.

## Headline

The suite is not too big so much as unconsolidated. About 26% of it re-proves
a behaviour another test already pins, and the slowest 1% accounts for most of
the wall clock.

| Verdict | Tests | Share | Meaning |
|---------|-------|-------|---------|
| keep | 502 | 69% | pins a rule a skill, ADR or safety property depends on |
| merge | 146 | 20% | same behaviour as a named twin; fold the unique assertion in and delete |
| drop | 45 | 6% | asserts an internal helper, source shape, or one past bug's residue |
| weaken | 33 | 5% | a real rule tested at several redundant levels |

Group totals:

| Group | keep | merge | drop | weaken |
|-------|------|-------|------|--------|
| `run-gate`, `work` | 92 | 33 | 7 | 3 |
| hooks (`hook-trust`, `hooks-regressions`, `scripts-regressions`, `hooks`) | 91 | 40 | 17 | 6 |
| commit and install (`run-commit`, `changeset`, `install-links`, `version-gate`, `fileset`, `scripts`, `installer`) | 77 | 25 | 12 | 2 |
| usage, doctor, tracker, digest, codemap | 106 | 27 | 2 | 3 |
| tracks and mixed (32 files) | 136 | 21 | 7 | 19 |

Applying every merge and drop would leave roughly 490 tests, 32% fewer, with
no rule lost if each merge keeps the twin's unique assertion.

## Where the time goes

Observed in one full run (4 min 6 s):

- The `check.mjs` family in `scripts-regressions` runs the whole checker over
  a fresh copy of the checkout, about 20 copies per run. Single tests cost
  27.7 s, 17.5 s, 17.4 s, 16.9 s, 10.6 s, 9.9 s, 9.5 s, 9.1 s. That family is
  the dominant cost, not the 721-test count.
- `install.sh` and `install-hooks` tests re-clone and re-install into temp
  homes: 17.4 s, 17.0 s, 3.6 s, 3.5 s, 3.2 s.
- One test stages 3,000 files (30.5 s) to prove the scan stays inside the hook
  timeout. It is the only test in that shape and it is worth its cost once.
- `changeset` builds 29 temp repos, three of them with 20 MB or a million
  lines. `hook-trust` builds about 30 and writes 40 MB of random binary.
- `tracks-*` totals about 41 s, mostly real worktrees and `work.mjs` spawns.
- Nobody sleeps except `tracks-check-slot`, which waits on a real 1 s lock.

## Root causes

1. **Regression files were append-only.** `hooks-regressions`,
   `scripts-regressions`, `tracker-regressions`, plus tests tagged `(audit N)`,
   `(bug N)`, `(T87)`, added one test per past finding. Later general tests
   superseded many of them and nothing was retired. 40 merge verdicts sit in
   the four hook files alone.
2. **Tests at the wrong layer.** Pure functions are re-tested through a CLI,
   and CLI rules are re-tested at the hook seam. `test-it` asks for one seam
   per behaviour; the regressions came in at whichever seam the bug surfaced.
3. **Source shape as a proxy for behaviour.** Eight tests grep the scripts for
   call counts, handler placement, line counts, one id pattern, or an export
   shape. They fail on refactors and catch nothing a user can hit.
4. **Document prose pinned by tests.** About 19 tests assert exact doc wording,
   line counts (103, 101), fence indexes, table cells, separator rows or an
   anchor slug. A rewording of a skill breaks the suite without changing any
   behaviour.

## Findings, ranked by payoff

1. **Cut the `check.mjs` fixture copies.** Build the checkout once, mutate one
   file per test. Expected saving: 2 to 3 minutes, the single biggest win.
   Effort: medium, `tests/scripts-regressions.test.mjs` plus a shared fixture.
2. **Merge the 146 duplicates.** Highest-value: the 40 in the hook files and the
   33 in `run-gate`/`work`. Each merge keeps the twin's unique assertion.
   Effort: high but mechanical; do it file by file.
3. **Delete the 45 shape tests.** Includes the call-count and copy-count
   assertions, the `flat` test-helper test, `import-from-stdin` loader quirks,
   and the exact-sha re-derivation. Zero rule loss.
4. **Weaken the 33 over-asserted tests.** Drop line counts, whitespace regexes,
   `deepEqual` of whole records, and the 7 flag permutations in `shell`.
5. **Share the fixtures** that are rebuilt per test: `laneS` (5 tests),
   `checkout()` (3 seed-clone-push cycles), `fixture()` (21 tests).
6. **Split the fast and slow suites.** A `npm test -- --test-name-pattern` note
   in `AGENTS.md`, or a `test:fast` script excluding `run-commit`, `check.mjs`,
   `install-*`, `changeset` and `tracks-*`, would cut the inner loop from 4
   minutes to under a minute. Nothing in the repo currently tells an agent how
   to run a subset.
7. **Check the count in review, not only coverage.** The rule worth keeping,
   once: a regression test replaces or merges into the test that should have
   caught it; it does not append a new case to a regression file.

## What to keep as-is

The 502 keeps include the safety spine: secret blocking (including binaries and
textconv), fail-open on bad input, the commit staging rules, the freshness
fingerprint, `verify-phase` re-reading the plan, the merged-suite gate fact,
and the tracker never printing a token. `decide`, `env`, `opencode-check` and
`opencode-context` are entirely keep and cheap. Do not touch them.

## Limits of this audit

- Costs are estimated from fixture shape, not measured per test.
- Merge verdicts assume the twin keeps the unique assertion; each merge needs
  a read of both tests before deleting one.
- "Nothing user-facing reads" is a judgement from the code, not a grep of every
  consumer.
