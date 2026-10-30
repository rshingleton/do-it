---
title: Open backlog 2026-10
approved: 2026-10-30
---

# Open backlog 2026-10

## Destination
The open defects and debt on `docs/TODO.md`, and the audit-cap issue, are
cleared so a long `finish-it` run finishes without the user raising a cap,
the run scripts refuse unsafe states and say why, and the roadmap lifecycle
and the tests do what the docs claim. No new feature beyond the cap change.

- G1: A long roadmap whose slices each pass audit in a normal number of rounds finishes under default caps; a slice stuck in a failing audit loop, the final review and the run total each still stop, and `AUDIT_CAP` and the digest name which limit fired.
- G2: The `finish-it` loop text, its call-site tests and `STATE.md` agree with the code: the turn ends only when `run next` returns no slice, and a slice ships only after each reviewer's final notice.
- G3: The commit and verify path refuses unsafe states (untracked or retargeted paths, failed switch-back, a retry that is not a retry) and reports a failure instead of reading it as clean.
- G4: Each helper, id regex, git wrapper and record shape in the run scripts has one copy, each handler lives where its name says, and the digest cannot be forged by a reason or tag text.
- G5: The roadmap lifecycle behaves as documented: a finalized roadmap is described in FORMAT.md, reported honestly by `work.mjs roadmap`, and finalized without a missing offer or an unaccepted ADR.
- G6: Tests cover the cases the audits named, share one runner, and pin behaviour rather than wording.
- G7: A reviewer or sweep that errors or returns nothing is reported as unverified, never clean, and the small skill and usage gaps from the audits are closed.

## Milestones

Slices share files (`skills/do-it/scripts/gate.mjs`, `commit.mjs`, `run.mjs`,
`skills/ship-it/`), and concurrent uncommitted work items invalidate each
other's audit (T49), so build one slice at a time, in id order within a
milestone.

### M1: A long run finishes
Exit: a test run of 8 slices at two audit rounds each finishes under default caps, and `finish-it` text and `STATE.md` describe what ships.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R1 | build | Per-slice audit counter (default 3) recorded on each slice entry, the final review's own cap, the run total as backstop `max_slices x per-slice cap` (overridable), and `AUDIT_CAP` plus the digest naming the limit that fired; documented in CONFIG.md, STOPS.md and the `run new` usage (issue audit-cap; T164 lock and refusal-marker leftovers) | G1 | none | Tests: 8 slices at 2 rounds finish; a slice at its 4th round stops naming the slice; the final review stops on its own cap; the run total stops a runaway; lowering the cap back to a refusal value does not revive a marker | high | shipped 2026-10-30 r1-audit-cap |
| R2 | build | `finish-it` loop text fixed: "back to 1" wording, the FLAKY pointer, wait for each reviewer's final notice before `run gate`, turn ends only at §4, and call-site tests anchored to their allow-false line (T165) | G2 | R1 (same STOPS.md and AUDIT_CAP text) | A call-site test fails a fixture §2 that closes the turn before §4; `rg verify-phase skills/build-it` finds none | med | shipped 2026-10-30 r2-loop-text, Verify unmet: build-it keeps `verify-phase`, the real command for a run-less item |
| R3 | build | `STATE.md` `run` sub list, `reject-assumption` semantics, `retries`, `audit_refused` and the `run audit` return shape documented (T171, T164 doc part) | G2 | R1 (new audit fields) | Every `run` sub in `work.mjs` usage appears in `STATE.md`; the audit return shape sits in the `work.mjs` header | low | shipped 2026-10-30 r3-state-docs |

### M2: The commit and verify path refuses unsafe states
Exit: each audit case for `commit.mjs`, `gate.mjs` and `changeset.mjs` has a regression test that fails when the fix is removed.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R4 | build | Lane M `verified_files` compares normalized repo-relative names, refuses a named path in neither record unless tracked and clean, hashes with `lstatSync` and `readlinkSync` and records mode, bounds `git status` output, and records only mapped paths; tests for rename, delete, spaced name and a file clean at verify then edited (T159, T162) | G3, G6 | none | An absolute path, a case-variant path, a retargeted link and a mode-only change each fail a test; 1 MB of status output does not read as clean | high | shipped 2026-10-30 r4-verified-files, Verify met; `verified_files` still lists every dirty path (T159 keeps that part) |
| R5 | build | `commitSlice` path checks read `ls-files -z` and compare against the resolved relative path, the retry no-op compares paths to `git show --name-only HEAD`, the retry covers lane S and `--docs`, and rollback git calls pass `env: ENV`; submodule and rename tests (T156) | G3 | R4 (same files) | A quoted name and an absolute in-repo path commit; a retry with a different path set throws; a lane S retry succeeds | med | shipped 2026-10-30 r5-commit-paths |
| R6 | build | `commitSlice` `undo` checks a failed switch back, keeps a branch that gained a hook commit, and tests the reused-branch and detached-start paths (T158) | G3 | R5 (same function) | Tests for a failed switch-back, a hook commit on the scratch branch and a detached start | med | shipped 2026-10-30 r6-undo |
| R7 | build | `run next` stops on MAX_SLICES only when a slice is left and reports an in-flight slice at the cap, a plain double verify failure parks like FLAKY, gate reasons asserted against `STOPS` keys, and `runVerify` tests use `--in` and flaky parking (T164, T149, T163) | G3, G6 | R1 (same cap code) | Tests: no stop when nothing is left; an in-flight slice is named at the cap; changing `path.resolve(cwd, opts.in)` to `root` fails a test | med | shipped 2026-10-30 r7-run-caps, Delivers unmet: a plain double verify failure still only throws, since parking it would stop build-it's own fix loop (T149 keeps it) |
| R8 | build | `runReviewChange` checks `.status` of `git status` and `merge-base`, tests a null base and a modified tracked file under the planning dir, and `changeset.mjs` snapshot keeps only the loosening phase 1 asked for, `run base` refuses a dirty tree and a tag failure after commit is reported (T167, T150) | G3 | R6 (same gate and commit area) | A failed `git status` returns an error, not clean; a dirty tree fails `run base` in a test | low | shipped 2026-10-30 r8-review-change, Delivers unmet: the snapshot loosening and the dirty-tree refusal at `run new` (it breaks about 30 fixtures that start a run on a modified tree; T150 keeps both) |

### M3: The run scripts carry one copy
Exit: `gate.mjs` holds no `run*` handler, no helper has a second copy, and `npm test` passes unchanged.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R9 | enabler | `runVerify`, `runReviewChange` and `runRejectAssumption` move to `runs.mjs`; `commitSlice` splits into `assertCommittable` and `phaseAlreadyLanded`; `audit_refused` documented beside `audit_cap`; `dirtyHashes` `hash()` tells a non-file from a failure (T170) | G4 | R5, R6, R7, R8 (they edit these functions) | `npm test` passes; no `run*` handler in `gate.mjs`; `commitSlice` is under 60 lines | med | shipped 2026-10-30 r9-split-run-handlers, no `dirtyHashes` change: R4 already made a non-file `dir` and a hash failure a throw |
| R10 | enabler | One record read-modify-write (owned by `run.mjs`), one id regex, one git wrapper with consistent `env`, one `verified_files` shape, and the dead `instead ?` branch, `ready` pseudo-status and in-writer timestamp gone (T147) | G4 | R9 (same files) | `rg` finds one id regex and one git wrapper; `npm test` passes | low | shipped 2026-10-30 r10-one-copy |
| R11 | build | Digest sanitizes `--reason` and tag names (only `^do-it/<id>/phase-<n>$`), keeps a works list across a resumed slice, drops the redundant `now()` branch, and tests repeated retries (T168) | G4 | R10 (same files) | A multi-line reason cannot render a heading; a tag with shell text is not printed; a resumed slice keeps its old tag in Rollback | med | shipped 2026-10-30 r11-digest-safe |
| R12 | build | Run assumption bookkeeping: `run set assumptions` refused, rejection matched by text among remaining plan entries, sweep-origin assumptions rejectable, greedy regex fixed, `instead` whitespace-collapsed, `building` and `items.get` errors no longer read as closed (T146) | G4 | R11 (same files), D3 (reject semantics) | Tests for a ship-it plan-side rejection, a re-add, `feat#1: see x#2: y` and a plan in `building` | high | shipped 2026-10-30 r12-assumption-bookkeeping |
| R13 | build | Text accuracy: the do-it line named a constant in COMMITS.md and `commit.mjs`, wrap fixed, the long `do-it/SKILL.md` bullet split, the level flag mapped to `run new --level` (T148) | G2 | R2 (same finish-it text), R10 | `npm run check` passes; no "from the user's rules" text remains for the do-it line | low | shipped 2026-10-30 r13-text-accuracy |

### M4: The roadmap lifecycle is whole
Exit: a finalized roadmap is described, reported and finalized as documented, and the FINALIZE pin test survives a rewrap.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R14 | build | FINALIZE edge cases (a `completed` roadmap with no edits, offer e on a second `--roadmap` run, the paths to stage) and ship-it §2 Show list and Ask item 2 agree with every-offer-by-default (T176, T177) | G5 | none | Fixture walkthroughs for each case produce the offers a to e and name the paths | med | shipped 2026-10-30 r14-finalize-edges |
| R15 | build | `roadmapSlices` reports a `reopened` note for a `completed` roadmap with unshipped slices, and FORMAT.md describes `completed:` and `## Shipped` and drops `## Changes` from its example (T178, T179) | G5 | none | A test: `completed` plus an unshipped slice gives `finished: false` and a note; a re-chart of a finalized fixture keeps `completed:` | med | shipped 2026-10-30 r15-reopened-note, Verify met in text: FORMAT.md says a re-chart keeps `completed:` (a re-chart is an agent step, so only the text is tested) |
| R16 | build | Offer a writes ADRs as the owner decides in D2, and the FINALIZE and ship-it wrap and ADR execution-note churn is removed (T180, T181, T182) | G5 | R14 (same files), D2 | A finalized fixture leaves no `proposed` ADR with nobody to accept it; `npm run check` shows no overlong line in the named files | low | |
| R17 | build | The FINALIZE pin test pins behaviour (the offers and the paths), not 19 fragments, and drops the duplicate line-count assertion (T183) | G6 | R14, R16 (they change the pinned text) | A rewording of a pinned sentence passes; removing offer c fails | low | |

### M5: Trust and small gaps
Exit: every remaining audit case has a test or a decision, and nothing on the to-do list in scope is left.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R18 | build | review-it and sweep-it report an errored, timed-out or malformed reviewer as unverified, and a clean or Healthy verdict needs coverage evidence (T173) | G7 | none | A fixture with one failed reviewer reports unverified; routing eval still passes | med | |
| R19 | build | One copy-and-spawn test runner serves the eval-routing and `check.mjs` tests; the in-hunk `+++ <path>` case and the R1 guard subdirectory and glob cases are pinned (T131, T134, T154) | G6 | none | Each new test fails when its guard is broken on purpose | low | |
| R20 | spike | Walk a swept fixture roadmap to every decision in a legal state, and a non-interactive scope-it plan with no question turn; findings go to log-it (T153) | G6 | R2 (loop text settled) | Both walkthroughs recorded; each defect filed or fixed | med | |
| R21 | build | design-it pointer decision for the prove-it Architecture brief and sweep-it LENSES item 8, and debug-it's "no honest seam" finding routed (T107, T7) | G7 | none | The decided sentence is inline or the link is kept with the reason recorded; `npm run check` passes | low | |
| R22 | build | usage-it windows follow D1 (per-message split or labelled as run-based) (T76) | G7 | D1 | The straddling-session fixture counts as D1 decides | med | |
| R23 | spike | Confirm the v2 `session.step.ended` shape on a live OpenCode 2 and fix the `assistantMessageID` drop (T115) | G7 | none | A live session produces usage rows, or the shape is recorded and the parser matches it. Needs OpenCode 2 on this machine; if absent, move to Fog on replan | med | |
| R24 | build | setup-it writes `DO_IT_PROTECTED_BRANCHES` from the remote's default branch when it is not main or master (T6) | G7 | none | A fixture repo with default branch `trunk` gets it written | low | |

## Open decisions
- none

## Fog
- T78 doctors: a tracker reachability check and an install doctor (may become one `/setup-it` check slice, or two).
- T62 push, PR and rollback ownership at the end of the lifecycle (ADR-sized; may become slices after a decision on which skill owns it).
- T2 dogfood `/setup-it` on another repo (needs a second repo; may produce slices).

## Out of scope
- The `idea` and `question` items stay on `docs/TODO.md`: T4, T13, T14, T17, T19, T20, T22, T23, T24, T26, T27, T28, T29, T31, T32, T44, T45, T46, T47, T49, T82, T152, T175.
- Any new skill.

## Decisions so far
- 2026-10-30 Decision: scope is defects, debt and the audit-cap issue; ideas and questions stay on the to-do list.
- 2026-10-30 Decision: audit cap becomes per slice (default 3), the final review keeps its own cap, and the run total is `max_slices x per-slice cap`.
- 2026-10-30 Decision: one slice at a time, `should` before `nice-to-have`, high risk first; no tracker publish.
- 2026-10-30 Decision (D1, settled in the run sweep as an assumption): usage-it splits a straddling session by per-message timestamps, with the run-based label as the fallback; revisit if transcripts lack per-message times.
- 2026-10-30 Decision (D2, settled in the run sweep as an assumption): a roadmap finalize's offer a writes its ADRs `accepted`; revisit if a finalize can run with no user turn.
- 2026-10-30 Decision (D3, settled in the run sweep as an assumption): assumption rejection matches by text among the remaining plan entries; revisit if entries can carry identical text.

## Changes
- 2026-10-30: charted and approved.
- 2026-10-30: R1 shipped (r1-audit-cap).
- 2026-10-30: R2 shipped (r2-loop-text).
- 2026-10-30: R3 shipped (r3-state-docs).
- 2026-10-30: R4 shipped (r4-verified-files).
- 2026-10-30: R5 shipped (r5-commit-paths).
- 2026-10-30: R6 shipped (r6-undo).
- 2026-10-30: R7 shipped (r7-run-caps), without parking a plain double verify failure.
- 2026-10-30: R8 shipped (r8-review-change), without the snapshot narrowing or the dirty-tree refusal.
- 2026-10-30: R9 shipped (r9-split-run-handlers).
- 2026-10-30: R10 shipped (r10-one-copy).
- 2026-10-30: R11 shipped (r11-digest-safe).
- 2026-10-30: D1, D2 and D3 moved from Open decisions to Decisions so far: the run sweep had settled them as assumptions, and an open entry held R12, R16 and R22 back.
- 2026-10-30: R12 shipped (r12-assumption-bookkeeping).
- 2026-10-30: R13 shipped (r13-text-accuracy).
- 2026-10-30: R14 shipped (r14-finalize-edges).
- 2026-10-30: R15 shipped (r15-reopened-note).
