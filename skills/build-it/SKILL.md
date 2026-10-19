---
name: build-it
description: Build an approved do-it plan test-first at its agreed seams, leaving every change uncommitted in the working tree; runs ready phases in parallel when it can.
disable-model-invocation: true
argument-hint: "<work id> [phase N]"
model: sonnet
---

# build-it

Builds what the plan approved, and nothing else. Leaves the whole change
uncommitted for the user to review; `ship-it` commits.

## 1. Start

- Read the state block ([STATE.md](../do-it/STATE.md)). No `approvals.plan`:
  stop, `blocked`, "plan not approved".
- First run: set `base_ref` to `git rev-parse HEAD` and `status: building`.
- Discover standards and tooling once per session per [STANDARDS.md](STANDARDS.md).
- Tracker: when the state block names a tracker ref, call the Skill tool with
  "track-it" and run `start` on it (and on the phase ref). A tracker failure
  is noted and never blocks the build.

## 2. Pick the work

- **Fix mode** (`audit.verdict: FAIL`): the work is only the Must findings
  listed in `audit.must`, read from the audit report (lane M) or the plan's
  `## Audit` section (lane S). Fix each one test-first where it has a seam,
  run the project's checks, then go to §5. Phases are not rebuilt.
- Lane S: the plan's steps, in order, as one unit.
- Lane M: the **frontier**, every phase not `done` whose `blocked_by` phases
  are all `done`. With `phase N`, just that phase if it is on the frontier.
- More than one frontier phase, a host that runs background subagents, and no
  uncommitted changes outside `docs/planning/` and the item's own `sources:`
  issue files (which `start` just edited): build them in parallel per
  [PARALLEL.md](PARALLEL.md). Otherwise build them one at a time in place.
- Resuming from `status: blocked`: show the recorded blocker; continue only
  once the user has resolved it, and set `status: building`.

## 3. Build one unit

1. Call the Skill tool with "test-it". Pass the unit's `## Seams` and say they
   were agreed in planning, so tests go only there and are not re-confirmed.
   No seams listed: propose them with what each catches and misses, record
   them as an assumption, continue.
2. Follow the `it-core` posture: reuse ladder, scope list, surgical edits,
   `shortcut:` markers.
3. A failure you cannot explain in one hypothesis, a flaky one, or one still
   failing after three fix rounds: call the Skill tool with
   "debug-it", passing the assumption that may be wrong.
4. Run the project's test, lint, format and type-check commands.
5. Run the self-check in [STANDARDS.md](STANDARDS.md) §3.
6. Record in the state block: the phase `status: done` and `verified:` with
   the commands that passed. New assumptions go under `assumptions:`.

Out-of-scope problems go to `log-it`, not into the diff.

## 4. Stop conditions

Stop the run and report `blocked`, recording one line of why as `blocker:`.
Lane M: on the phase (`status: blocked`). Lane S, or when nothing else can
run: on the item itself (`status: blocked`), so `do-it` resumes here. Stop
when:

- an unknown fails the assume-or-ask test in the `it-core` posture;
- a failure survives `debug-it`;
- the plan is wrong (a seam does not exist, scope is larger than planned:
  suggest raising the lane);
- the next action cannot be undone from the working tree (a migration
  against a shared database, a call to a production service, a force push).

Other ready phases that do not depend on a blocked one keep going.

## 5. Finish

When no phase is left to build (or fix mode has fixed every listed Must), set
`status: auditing` and return `done`.

> Built <id>: <N> phase(s), uncommitted on `<branch>` since `<base_ref>`.
> Skipped: ... Not checked: ... Risk: ...
> **Next:** `/prove-it <id>`.

## Rules

- No commits, no pushes, no stashes on the user's branch. Parallel scratch
  branches are the only commits, and they never reach the user's branch.
- No edits to ADR status, `GLOSSARY.md` or the changelog; `ship-it` owns them.
- Do not change the plan's scope. Raise it with the user instead.
