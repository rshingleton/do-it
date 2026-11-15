---
title: Backlog cleanup 2026-11
approved: 2026-11-15
---

# Backlog cleanup 2026-11

## Destination
The concrete leftovers the 2026-11 to-do audit verified against the code are
cleared, so the skills and docs state what the code does, the tests pin
behaviour rather than wording, the run, commit, digest and usage scripts
behave on the states the audits named, and install and the path helpers
behave on Windows. No new behaviour: an item that turns out to need one goes
to Open decisions and waits.

- G1: Every line the audit cited in a skill, doc or issue file states what the code does, no `skills/*/SKILL.md` is over the 100-line guideline, and `npm run check` enforces the 80-column rule the text is written to.
- G2: Each test the audit named fails when its behaviour is removed and survives a reworded line; one `read` helper per test file replaces the copies, and the 1 MB status test runs in under 2 s.
- G3: The run, commit, digest and usage scripts behave on the states named: one record writer under concurrency, review-change after a rebase, one-line digest text, the documented `verified_files` rule, OpenCode agent and model attribution, window counts by run, and the Windows shell choice.
- G4: setup-it and install behave on Windows as documented: a comma in a branch name, a dangling `origin/HEAD`, `DO_IT_HOME`, a separate uninstall, both hosts removed on a partial failure, and one shared path helper.
- G5: The link-it limits have a recorded answer from a two-session hand test, and the contract says whether an agreed but unwritten Interface edit matters.

## Milestones

Slices share files: `commit.mjs` and its test, `gate.mjs` and its test,
`work.test.mjs`, and `install.mjs`. Build one slice at a time, in id order
within a milestone.

### M1: Text that tells the truth
Exit: `npm run check` passes with the 80-column rule, every `skills/*/SKILL.md` is 100 lines or fewer, and each line the audit cited states the rule the code follows.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R1 | build | Ship-it, finish-it and prove-it text leftovers: FINALIZE.md Paths names what it writes, the long lines in `do-it/SKILL.md:100` and `ship-it/SKILL.md:71` wrap, finish-it says which reviewer notice is final and reports `run next` `defects` at the close, prove-it's Route says the user runs `unblock`, debug-it names the `log-it` skill call and the `/deepen-it` slash form, the three deletion-test copies carry a source note, and the issue file's `source:` names `windows-support` (T223, T208, T216, T211, T238) | G1 | none | A grep for each garbled phrase (offer a created, offer e closed, when b added) finds nothing in FINALIZE.md; debug-it no longer says "file it with log-it"; `npm run check` passes | low | shipped 2026-11-15 r1-text-truth |
| R2 | build | Name-it, ship-it header and R13 test leftovers: name-it says a plan's ADRs are rewritten `accepted` at finalize, `ship-it/RESUME.md:13` stops repeating "always asks, no default", the churned lines beside R16's real edits are settled, the `/do-it --complete` level argument is documented as passed to `run new --level`, the R13 test pins the ATTRIBUTION and level behaviour instead of sentences, and `npm run check` gains the 80-column rule (T200, T201, T197) | G1 | none | `npm run check` fails on an 81-column line in a skill file and passes on the tree; the R13 test survives a reworded sentence | low | |
| R3 | build | Line budget: usage-it (107), finish-it (108), ship-it (104), roadmap-it (103) and build-it (101) SKILL.md move detail into sibling files they already link, to 100 lines or fewer (T215) | G1 | none | A line count of every `skills/*/SKILL.md` reads 100 or fewer; `npm run check` reports no line-budget warning | low | |
| R4 | build | The plan-body `## Link` section link-it keeps the contract under is written into the plan format that `do-it/STATE.md` names, and link-it points at it, so a replan keeps the section (T235) | G1 | none | The plan-format doc names `## Link` with its one-line rule; a plan fixture holding `## Link` still holds it after a scope-it replan | low | |

### M2: Tests that pin behaviour
Exit: `npm test` passes, a reworded sentence in the named files no longer breaks a test, and deleting a pinned behaviour still does.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R5 | build | Test hygiene in `work.test.mjs`, `run-gate.test.mjs` and `run-commit.test.mjs`: the FINALIZE test pins the path reference, counts rules by content and guards `indexOf` -1; the ship-it, finalize, finish-it and build-it tests pin headings, links and offer letters instead of sentences; one file-level `read` and `readFlat` replace six copies; the two-assert line and the weak `/unmet/i` are split; the 1 MB status test uses fewer, longer names (T202, T213) | G2 | none | Rewording a pinned sentence leaves `npm test` green; deleting the `[FINALIZE.md](FINALIZE.md)` Paths line fails it; the 1 MB test finishes under 2 s | low | |
| R6 | build | Gate and export tests: the "reasons are STOPS codes" test calls `nextSlice` (or is retitled), the flaky fixture quotes its temp path and removes `ran-once`, the STOPS test shares one date constant, the audit-stop resume test gains an R1-vs-R10 prefix case, the unused-export check scans tests, hooks and `.opencode`, and the equal-text reject tests tell a plan-side reject from a hand-edited followup (T191, T222) | G2 | none | Renaming `MAX_SLICES` in `run.mjs` fails the test; an export used only in `tests/` is not flagged unused; the two equal-text tests fail for different reasons | low | |
| R7 | build | Gate leftovers: the `gate.mjs` header names runs.mjs and work.mjs as callers, the structure test finds `commitSlice` by its closing brace at any indent and reads `runs.mjs` once, a test pins that a reading `gate` adds no gates entry, `run audit` on an unknown slice adds no entry and spends no run-total round, and `STOPS.md` says resumed rounds stay in the run total (T193, T185) | G2 | none | `run audit road R9` leaves no R9 gates entry; removing the read-path `find` fails a test; the header names both callers | med | |
| R8 | build | Guard and commit-undo tests: the guard subdirectory test splits into four assertions and the `git add` `all` untracked branch is pinned; `rejectedCommit` sets `core.hooksPath`; `--no-guess` carries its comment; the unborn-repo undo has a test; a rethrown error keeps its stack; the wording assertions keep one loose match each (T210, T190) | G2 | none | A developer's global `core.hooksPath` no longer changes the new tests; the unborn undo is exercised; removing the untracked branch changes an assertion | med | |

### M3: Scripts do what they say
Exit: `npm test` passes, and each named edge has a test that fails on the old code: parallel record update, rebase, digest line, usage attribution, default branch.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R9 | build | Commit path leftovers: the tag-failure message says "fix that, then run the same command again" and a test deletes the blocker ref and retags; the outside-root filter refuses `..` and `..\x` but allows a file named `..env`, in `commit.mjs` and `closingDocsExclude`; `dirtyHashes` reads a worktree-side rename (` R`) as a rename; `changeset.mjs` imports the shared `git` (T192, T217, T218) | G3 | none | A repo file named `..env` commits; a worktree-side rename records both paths; a failed tag retries green in the test; `changeset.mjs` holds no local `git` | high | |
| R10 | build | Run-record and review leftovers: `updateRun` takes a lock, or a compare-and-write that reports the lost update, so two processes cannot undercount rounds; `run review-change` after a rebase reports the right change, not upstream commits (T164, T167) | G3 | none | Two `run audit` calls started together spend two rounds; a rebased branch's review-change names none of the upstream commits | high | |
| R11 | build | Digest and verify record: the digest header (`started`, `id`, `commit`) and the usage values pass through `oneLine`; `origin()` parses an `earlier <key>` prefix so those lines keep the `id #n` form; `run verify` without `--paths` does what `STATE.md` says and a test pins it (T220, T221) | G3 | none | A newline in `started` or a usage value cannot open a heading; an `earlier feat#1` line renders `feat #1`; verify with then without `--paths` matches STATE.md | med | |
| R12 | build | Usage: OpenCode v2 runs take agent and model from `session.step.started` when the context hook did not fire; `--json` `whole` counts runs (`r.runs`) not records; the "before time buckets" label applies only to records with no timestamps; a message with no time is bucketed or marked `partial`; the ledger's `shell: true` on win32 is fixed or carries its reason (T214, T219, T242) | G3 | none | A v2 fixture with only `step.started` rows names its agent and model; a record with `runs: 2` adds two; a timestamped old record is not labelled "before time buckets" | med | |
| R13 | build | setup-it default branch: a default branch whose name holds a comma is skipped (`write: false`), a dangling `origin/HEAD` is checked with `rev-parse --verify`, the SKILL bullet says a clone with no `origin/HEAD` or a remote not named origin is skipped, `default-branch.mjs` states what it does when git cannot spawn, and the three tests move to `tests/default-branch.test.mjs` with a `feature/x` default and an extra kept branch (T212) | G4 | none | A `feature/x` default is added to `DO_IT_PROTECTED_BRANCHES`; a comma name leaves `value` unchanged; a dangling `origin/HEAD` proposes nothing | med | |

### M4: Windows and install debt
Exit: a Windows install and uninstall removes both hosts' hooks, `DO_IT_HOME` moves the root, and one path helper serves code and tests.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R14 | build | Install: `install.mjs` reads and defaults `DO_IT_HOME`, `uninstall()` becomes its own function, and a failed Claude hook removal still runs the OpenCode removal; a failed hook step no longer skips the rest (T237, T239, T244) | G4 | none | `DO_IT_HOME` moves the install root; a stubbed Claude hook failure still removes the OpenCode hooks; the install header names the split | med | |
| R15 | build | One path helper: `tests/links.mjs` imports `norm` and `sameTarget` from `install.mjs`, the path.sep-to-slash idiom uses one shared helper where hooks and scripts can share an import, and `check-shell.mjs` covers every `shell:` caller with bash syntax (T240, T241, T243) | G4 | none | One `split(path.sep)` helper remains; `tests/links.mjs` has no local `norm`; the shell check lists every spawning script and fails on a new unlisted one | low | |

### M5: link-it hand test
Exit: the hand test's answer is recorded, and T233 is either a new slice or dropped with a reason.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R16 | spike | Run `link-it` across a named repo pair through a compaction between adjacent file operations, and record whether an agreed but unwritten Interface edit (T233) or that compaction (T234) actually bites (T234) | G5 | none | The answer is recorded in `skills/link-it/CONTRACT.md` or an ADR, the test repos are removed, and T233 is sliced or dropped with a reason | med | |

## Open decisions
- none

## Fog
- T233: whether an agreed but unwritten Interface edit needs a rule; waits on R16's answer.
- T149 and T150: each is a decision, not a fix (whether a second failed verify round parks; whether `run new` refuses a dirty tree). They become slices only after an owner call.

## Out of scope
- The 21 `idea` and 4 `question` items stay on `docs/TODO.md`: T4, T13, T14, T17, T19, T20, T22, T23, T24, T26 to T32, T44 to T47, T49, T62, T78, T82, T152, T175, T236 and T246.
- T29 (transcript mining) is new behaviour, and T245 waits for its third `shell:` caller.
- T2 stays a circle-back.

## Decisions so far
- 2026-11-15 Decision: scope is the concrete items the 2026-11 audit verified, about 36; the `idea` and `question` items stay on the to-do list (T13, T20, T23 and T152 are cited by T246).
- 2026-11-15 Decision: no new behaviour; a slice that finds a behaviour question stops at Open decisions.
- 2026-11-15 Decision: promoted lines leave `docs/TODO.md` at approval, and the roadmap carries them.

## Changes

- 2026-11-15 Change (R1): shipped as r1-text-truth. prove-it's unverified bullet says
  the user answers and `unblock` records it, since `unblock` is the runner's event.
  The two wraps leave `do-it/SKILL.md` at 103 lines and `finish-it` at 111; both are
  logged as T247 for R3, whose Verify counts every `skills/*/SKILL.md`.
