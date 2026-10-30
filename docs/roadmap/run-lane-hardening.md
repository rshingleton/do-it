---
title: Run lane hardening
approved: 2026-10-30
---

# Run lane hardening

## Destination
The complete-run lane's commits, caps and stops do what STOPS.md, COMMITS.md
and ADR 0008 say, and no secret reaches a run commit unscanned. The open
issues and the `should` findings of the complete-run-lane audit (T135 to
T145) are closed; no new feature is added.

- G1: No secret in a new, untracked file reaches a commit unscanned, including a run commit that stages by path.
- G2: A run commit stages only its slice's own files, survives a retry, leaves the branch and run record consistent when a hook rejects it, and lane M in `slice` mode commits its code.
- G3: The caps and stops in STOPS.md (audit rounds, slice count, stale verify, parked slices) fire where documented, and the finish-it loop and its `--resume` text name every call and id they need.
- G4: What the run reports is true: review-diff leaves out planning files, the final review reads the right change under any commit mode, the digest lists only this run's tags and its retry results, and assumption rejection is atomic and keyed by `n`.
- G5: Run orchestration lives in `gate.mjs`, so each rule in G3 and G4 has a unit test.

## Milestones

Slices share files (`skills/do-it/scripts/commit.mjs`, `gate.mjs`, `work.mjs`,
`changeset.mjs`), and concurrent uncommitted work items invalidate each
other's audit (T49), so build one slice at a time, in id order within a
milestone.

### M1: The guard holds
Exit: a new untracked file holding a secret, named on a `git commit <path>` line, is blocked in a test.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R1 | build | The commit guard scans untracked files named on a `git commit <path>` line, inside the existing time budget (issue: commit guard skips untracked files) | G1 | none | A test commits a new file holding a secret by path and gets a block; the 3,000-file budget test still passes | high | shipped 2026-10-30 guard-untracked-paths |

### M2: Run commits are safe
Exit: a run commit with a directory path, a retry, a rejecting hook and a lane M slice in `slice` mode each behave in a test as COMMITS.md says.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R2 | build | `run commit --paths` rejects a directory path, and a retried phase commit that finds `do-it/<id>/phase-N` already on HEAD is a no-op (T136, T137) | G2 | none | A directory path is refused and another slice's edit stays unstaged; a second commit call after a landed commit returns the same sha without throwing | med | shipped 2026-10-30 commit-dir-retry |
| R3 | build | `commitSlice` writes the run record and keeps the branch only after `git commit` succeeds, and restores the branch when a hook rejects (T138) | G2 | R2 (same function) | A rejecting `pre-commit` hook leaves the branch and the run record as before the call | med | shipped 2026-10-30 commit-after-success |
| R4 | build | Lane M in `slice` commit mode makes one code commit after its last phase verifies, then the closing-docs commit; COMMITS.md and ADR 0008 line 25 say so (T142) | G2 | R3 (same function) | A lane M fixture in `slice` mode commits its code and then its docs; code changed after `verify-phase` refuses | med |shipped 2026-10-30 lane-m-slice-commit |

### M3: Caps and stops fire
Exit: a fixture run hits the audit-round cap, the slice cap and a stale verify, and each parks or stops with the reason STOPS.md names.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R5 | enabler | `run gate` and `run verify` orchestration moves from the `work.mjs` dispatcher into `gate.mjs`, and the `run` usage error lists start, audit, gate, verify and reject-assumption (T144) | G5 | none | `gate.mjs` exports the two functions with unit tests; `work.mjs` only dispatches; `npm test` passes unchanged | low | |
| R6 | build | The audit-round cap and `max_slices` are checked before another round or slice is built, so a slice whose 5th round passed is not stopped and slice 2 is not built over the cap (T139) | G3 | R5 (the gate code it edits) | A test: 5th round passes, slice ships; `max_slices` 1 stops before slice 2 | med | |
| R7 | build | The finish-it loop text calls `run start`, `run verify` and `run audit` at the steps STOPS.md names, `--resume` names the id `run slice ... ready` needs, and a test fails if a stop code has no call site (T145, T135) | G3 | R6 (stop semantics settled) | The test fails when a stop code's call is removed from the loop text; the resume line names an id | med | |

### M4: The run reports what it did
Exit: a fixture run with `--commit none` and one with phase commits produce a final review and a digest that match what happened.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R8 | build | `review-diff` omits `docs/planning/` whether or not those files are committed (issue: review-diff reports a committed plan file) | G4 | none | A test commits a plan file after `base_ref` and asserts it is absent | low | |
| R9 | build | The final review reads the working tree against `base` when the run has `--commit none` or uncommitted closing docs, else `<base>...HEAD` (T141) | G4 | R8 (same diff code) | A `--commit none` fixture gives a non-empty final-review change set | med | |
| R10 | build | Digest rollback lists only this run's `do-it/<id>/phase-*` tags and gains a retry-result section (T140) | G4 | none | A fixture repo with another run's tags lists only this run's; the digest shows a retried slice's result | low | |
| R11 | build | `run reject-assumption` fires the plan event before writing the record and finds the plan entry by `n`, not `indexOf` text (T143) | G4 | R5 (same dispatcher code) | Two assumptions with equal text reject by `n`; a failing event leaves the record unchanged | low | |

## Open decisions
None.

## Fog
- The `nice-to-have` leftovers of the same audit (T146 to T150): assumption bookkeeping, run-script duplication, text accuracy, the `STOPS` code assertion, the `changeset.mjs` loosening. May become one debt slice after M4.
- Phase fixture walkthroughs that were never run (T153): a user-run check, not a build slice.
- Scoping each work item's fingerprint to its own paths (T49): may become a slice once concurrent items are routine.

## Out of scope
- Phases in parallel worktrees whenever free (T152): a feature.
- The lifecycle past a local commit: push, PR, changelog headings (T62).

## Decisions so far
- 2026-10-30 Decision: scope is the two issues and T135 to T145; T146 to T150 sit in Fog.
- 2026-10-30 Decision: T142 is a bug: lane M in `slice` mode commits its code once, then its closing docs.
- 2026-10-30 Decision: T145 is fixed in the finish-it loop text with a test that every stop code has a call site, not by having `run next` call `run start`.
- 2026-10-30 Decision: T144 goes before T139, T143 and T145 so they are unit-testable.

## Changes
- 2026-10-30: charted from the two open issues and T135 to T145 of the complete-run-lane audit.
- 2026-10-30: R1 shipped (guard-untracked-paths): the guard scans untracked files named on a `git commit <path>` line; one extra `ls-files` call, pinned at 8 in hook-trust.test.mjs.
- 2026-10-30: R2 shipped (commit-dir-retry): `run commit` refuses directory and glob paths and a landed phase commit is a no-op on retry; findings T155 to T157.
- 2026-10-30: R3 shipped (commit-after-success): a rejected run commit restores the branch and leaves the run record untouched; finding T158.
- 2026-10-30: R4 shipped (lane-m-slice-commit): lane M in `slice` mode commits its code once, then its closing docs; named files are compared to the hashes `run verify` recorded; findings T159 to T162.
