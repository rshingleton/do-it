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
| `<roadmap file>#R<n>` | A roadmap slice. `work.mjs roadmap <file>` gives its state: only `ready` or `refine` may start (`refine` per [roadmap-it](../roadmap-it/SKILL.md) §6). Scout and size it (S or M); scope-it records `roadmap:`. |
| A request with `todo: <id>` | New work promoted by log-it from the to-do list. scope-it records `todo:`; lane XS passes `--todo <id>` to ship-it. |
| A work id, or nothing | Resume. `work.mjs show <id> --brief`; with no argument, `work.mjs list` (every plan there is open) and pick the only one, or ask which. |
| Free text asking to understand or examine, not change | Explore instead: hand off per [EXPLORE.md](EXPLORE.md). |

`work.mjs` is the work-item script in [STATE.md](STATE.md). Resuming
continues from `status` (§3); never redo a step the state block records as
done unless the code it verified has changed.

## 2. Scout, then size

Before picking a lane, look at the code the request points at, per
[SCOUT.md](SCOUT.md): decide whether this is a new or an existing project,
find what already exists, and read only enough to judge reach and risk. The
scout never asks the user anything.

Then pick the lane from [LANES.md](LANES.md). State it in one line with the
reason and what the scout found, then proceed; the user can override with
`--lane` or by saying so: "Lane S: `RateLimiter` exists in `src/auth/`;
only the login wiring is new."

When unsure between two lanes, pick the larger. Raise the lane mid-flight
when scope grows (`work.mjs set <id> lane` and say so); never lower it
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
| `draft` | `scope-it` re-presents the plan for approval |
| `planned` | `build-it` |
| `building` | `build-it` (it resumes from the frontier, or fixes `audit.must` and `fix:`) |
| `blocked` | Show `blocker:` (after a third failed audit, prove-it's question); once the user answers, `build-it`, or `scope-it` after `replan` |
| `auditing` | `prove-it` |
| `shipping` | `ship-it` (a prepared ship resumes at the commit question) |
| (no plan file) | Already shipped, or never planned: say which |

Each step ends with an outcome: `done`, `blocked` or `failed`.

- `done`: run the next row at once, asking only at the §4 stops. A step run
  from here never closes the turn: no closing message or `Next:`; only §6 does.
- `blocked`: stop and show the question or blocker.
- `failed` from `prove-it`: route back to `build-it` with the numbered Must
  findings. The third failed round comes back `blocked` instead.

## 4. Where it stops

Only these points wait for the user:

- `scope-it`: lane S's 0-3 questions (skipped when nothing is open) and its
  plan approval; lane M's grill rounds, the last of which approves the plan.
- Lane L: roadmap approval in `roadmap-it`.
- `build-it`: a stop condition it reports as `blocked`.
- `prove-it`: round 3 of a failing audit.
- `ship-it`: its one question (at most three answers), and after a review,
  one line to commit.

Everything between plan approval and ship runs without asking. At a boundary,
continue, or suggest a fresh session per [BOUNDARIES.md](BOUNDARIES.md).

## 5. Lane XS

No files under `docs/planning/`. Follow the `it-core` posture, build test-first
when the change has logic, run the project's checks, then self-review the diff
against the request (each changed line traces to it; no secrets; nothing left
half-done). Then follow [ship-it](../ship-it/SKILL.md) with `--lane xs`, plus
`--ref <ref>` for an issue and `--todo <id>` for a to-do item, so both close.

## 6. Closing message

First line: the lane and where the work stands. Then `Skipped / Not checked /
Risk`. Last line: the next step, or the stop waiting for the user.
