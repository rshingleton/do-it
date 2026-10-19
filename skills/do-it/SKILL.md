---
name: do-it
description: Size a piece of work and carry it from request to ship, running only the steps its size needs; also resumes an existing work item.
disable-model-invocation: true
argument-hint: "[request | issue path | tracker ref | work id] [--lane xs|s|m|l]"
---

# do-it

One entry for the whole flow: `log-it` → `scope-it` → `build-it` →
`prove-it` → `ship-it`. Each step is also callable on its own; this skill
decides which ones the work needs and runs them in order.

## 1. Resolve the input

| Input | Means |
|-------|-------|
| Free text asking for a change | New work. Scout and size it (§2). |
| `docs/issues/<slug>.md`, `#42`, `ABC-123`, an issue URL | New work from an issue. Fetch it with the `track-it` skill, then scout and size it. |
| A work id, or nothing | Resume. Read the state block ([STATE.md](STATE.md)); with no argument, list items under `docs/planning/` whose `status` is not `done` and pick the only one, or ask which. |
| Free text asking to understand or examine, not change | Explore instead: hand off per [EXPLORE.md](EXPLORE.md). |

Resuming continues from `status` (§3). Never redo a step the state block
records as done unless the code it verified has changed.

## 2. Scout, then size

Before picking a lane, look at the code the request points at, per
[SCOUT.md](SCOUT.md): decide whether this is a new or an existing project,
find what already exists, and read only enough to judge reach and risk. The
scout never asks the user anything.

Then pick the lane from [LANES.md](LANES.md). State it in one line with the
reason and what the scout found, then proceed; the user can override with
`--lane` or by saying so.

> Lane S: `RateLimiter` exists in `src/auth/`; only the login wiring is new.
> Plan, build, audit, ship.

When unsure between two lanes, pick the larger. Raise the lane mid-flight
when scope grows (record it in the state block and say so); never lower it
silently.

## 3. Run the lane

Run each step by reading its file and following it, one at a time, with the
work id: [scope-it](../scope-it/SKILL.md), [build-it](../build-it/SKILL.md),
[prove-it](../prove-it/SKILL.md), [ship-it](../ship-it/SKILL.md). The steps
are user-invoked, so the host refuses to load them as skills; reading the
file is how this skill runs them. Resolve each step's own links
(`GRILL.md`, `../do-it/STATE.md`) from that step's directory.

| `status` | Next step |
|----------|-----------|
| (none, lane XS) | Build in place, self-review, then `ship-it` |
| (none) | `scope-it` |
| `planned` | `build-it` |
| `building` | `build-it` (it resumes from the frontier, or fixes the Musts after a failed audit) |
| `blocked` | Show `blocker:`; once the user resolves it, `build-it` |
| `auditing` | `prove-it` |
| `shipping` | `ship-it` (a prepared ship resumes at the commit question) |
| (no plan file) | Already shipped, or never planned: say which |

Each step ends with an outcome: `done`, `blocked` or `failed`.

- `done`: continue to the next step without asking, except at the stops below.
- `blocked`: stop and show the question or blocker.
- `failed` from `prove-it`: route back to `build-it` with the numbered Must
  findings. The third failed audit round stops and asks the user.

## 4. Where it stops

Only these points wait for the user:

- `scope-it`: lane S's 0-3 questions (skipped when nothing is open), grill
  rounds (lane M and up), and plan approval (lane S and up).
- Lane L: capability map approval.
- `build-it`: a stop condition it reports as `blocked`, and round 3 of a
  failing audit.
- `ship-it`: its one question (docs, assumptions, tracker, commit message,
  feature branch on a protected branch, commit or leave for review).

Everything between plan approval and ship runs without asking. At a step
boundary, decide whether to continue or suggest a fresh session per
[BOUNDARIES.md](BOUNDARIES.md).

## 5. Lane XS

No files under `docs/planning/`. Follow the `it-core` posture, build test-first
when the change has logic, run the project's checks, then self-review the diff
against the request (each changed line traces to it; no secrets; nothing left
half-done). Then follow [ship-it](../ship-it/SKILL.md) with `--lane xs`, plus
`--ref <ref>` when the work came from an issue, so the commit carries its key
and the issue is closed.

## 6. Closing message

First line: the lane and where the work stands. Then `Skipped / Not checked /
Risk`. Last line: the next step, or the stop waiting for the user.
