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

- Read the state block ([STATE.md](../do-it/STATE.md)); every change to it
  goes through `work.mjs`, the work-item script described there. No
  `approvals.plan`: stop, `blocked`, "plan not approved".
- `status: blocked`: show the recorded blocker; continue only once the user
  has resolved it, then `work.mjs event <id> unblock`. A blocked phase
  (lane M): `unblock --phase <n>` once its blocker is resolved.
- `work.mjs event <id> start --brief`: sets `status: building`, and `base_ref` on the
  first run only. Before that first run, `git status --porcelain` showing
  changes outside `docs/planning/`: the audit will flag them as unplanned.
  Ask the user to commit them first or add them to the plan.
- Discover standards and tooling once per session per [STANDARDS.md](STANDARDS.md).
- Tracker: when the state block names a tracker ref, call the Skill tool with
  "track-it" and run `start` on it (and on the phase ref). A tracker failure
  is noted and never blocks the build.

## 2. Pick the work

- **Fix mode** (`audit.verdict: FAIL`, or a non-empty `fix:` list): the work
  is only the Must findings listed in `audit.must`, read from the audit
  report (lane M) or the plan's `## Audit` section (lane S), and each `fix:`
  entry (an assumption the user rejected at ship). Fix each one test-first
  where it has a seam, run the project's checks, then go to §5. Phases are
  not rebuilt.
- Lane S: the plan's steps, in order, as one unit.
- Lane M: the **frontier**, every phase not `done` whose `blocked_by` phases
  are all `done`. With `phase N`, just that phase if it is on the frontier.
- More than one frontier phase, a host that runs background subagents, and no
  uncommitted changes outside `docs/planning/` and the item's own `sources:`
  issue files (which the tracker `start` may have edited): build them in
  parallel per [PARALLEL.md](PARALLEL.md). Otherwise build them one at a
  time in place.

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
4. Run the self-check in [STANDARDS.md](STANDARDS.md) §3.
5. Run the project's test, lint, format and type-check commands through
   `work.mjs verify-phase <id> [n] --brief -- "<commands>"` (quoted, so a chain
   runs whole under the gate): it records the phase
   (lane S: the item) as verified only when they exit 0. New assumptions:
   `work.mjs set <id> assumptions '<json list>' --brief`, the old ones included.

Out-of-scope problems go to `log-it`, not into the diff.

## 4. Stop conditions

Stop the run and report `blocked` with one line of why. Lane M:
`work.mjs event <id> block "<why>" --phase <n>`. Lane S, or when nothing
else can run: `work.mjs event <id> block "<why>"`, so `do-it` resumes here.
Stop when:

- an unknown fails the assume-or-ask test in the `it-core` posture;
- a failure survives `debug-it`;
- the plan is wrong (a seam does not exist, scope is larger than planned:
  suggest raising the lane);
- the next action cannot be undone from the working tree (a migration
  against a shared database, a call to a production service, a force push).

Other ready phases that do not depend on a blocked one keep going.

## 5. Finish

When no phase is left to build (or fix mode has fixed every listed Must and
`fix:` entry), `work.mjs event <id> build-done` (status `auditing`) and
return `done`.

> Built <id>: <N> phase(s), uncommitted on `<branch>` since `<base_ref>`.
> Skipped: ... Not checked: ... Risk: ...
> **Next:** `/prove-it <id>`.

## Rules

- No commits, no pushes, no stashes on the user's branch. Parallel scratch
  branches are the only commits, and they never reach the user's branch.
- No edits to ADR status, a `CONTEXT.md`, the context map or the changelog;
  `ship-it` owns them.
- Do not change the plan's scope. Raise it with the user instead.
