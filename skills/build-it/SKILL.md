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
  "tracker" and run `start` on it (and on the phase ref). A tracker failure
  is noted and never blocks the build.

## 2. Pick the work

- Lane S: the plan's steps, in order, as one unit.
- Lane M: the **frontier**, every phase not `done` whose `blocked_by` phases
  are all `done`. With `phase N`, just that phase if it is on the frontier.
- More than one frontier phase, a host that runs background subagents, and no
  uncommitted changes outside `docs/planning/`: build them in parallel per
  [PARALLEL.md](PARALLEL.md). Otherwise build them one at a time in place.

## 3. Build one unit

1. Call the Skill tool with "tdd". Pass the unit's `## Seams` and say they
   were agreed in planning, so tests go only there and are not re-confirmed.
   No seams listed: propose them with what each catches and misses, record
   them as an assumption, continue.
2. Follow the `core` posture: reuse ladder, scope list, surgical edits,
   `shortcut:` markers.
3. A failure you cannot explain in one hypothesis, a flaky one, or one still
   failing after three fix rounds: call the Skill tool with
   "diagnosing-bugs", passing the assumption that may be wrong.
4. Run the project's test, lint, format and type-check commands.
5. Run the self-check in [STANDARDS.md](STANDARDS.md) §3.
6. Record in the state block: the phase `status: done` and `verified:` with
   the commands that passed. New assumptions go under `assumptions:`.

Out-of-scope problems go to `issue-it`, not into the diff.

## 4. Stop conditions

Stop the run, set the unit `status: blocked` with one line of why, and report
`blocked` when:

- an unknown fails the assume-or-ask test in the `core` posture;
- a failure survives `diagnosing-bugs`;
- the plan is wrong (a seam does not exist, scope is larger than planned:
  suggest raising the lane);
- the next action cannot be undone from the working tree (a migration
  against a shared database, a call to a production service, a force push).

Other ready phases that do not depend on a blocked one keep going.

## 5. Finish

When no phase is left to build, set `status: auditing` and return `done`.

> Built <id>: <N> phase(s), uncommitted on `<branch>` since `<base_ref>`.
> Skipped: ... Not checked: ... Risk: ...
> **Next:** `/audit-it <id>`.

## Rules

- No commits, no pushes, no stashes on the user's branch. Parallel scratch
  branches are the only commits, and they never reach the user's branch.
- No edits to ADR status, `GLOSSARY.md` or the changelog; `ship-it` owns them.
- Do not change the plan's scope. Raise it with the user instead.
