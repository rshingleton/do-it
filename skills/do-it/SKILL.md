---
name: do-it
description: Size a piece of work and carry it from request to ship, running only the steps its size needs; also resumes an existing work item.
disable-model-invocation: true
argument-hint: "[request | issue path | tracker ref | work id] [--lane xs|s|m|l]"
---

# do-it

One entry for the whole flow: `issue-it` → `plan-it` → `build-it` →
`audit-it` → `ship-it`. Each step is also callable on its own; this skill
decides which ones the work needs and runs them in order.

## 1. Resolve the input

| Input | Means |
|-------|-------|
| Free text | New work. Size it (§2). |
| `docs/issues/<slug>.md`, `#42`, `ABC-123`, an issue URL | New work from an issue. Fetch it with the `tracker` skill, then size it. |
| A work id, or nothing | Resume. Read the state block ([STATE.md](STATE.md)); with no argument, list items under `docs/planning/` whose `status` is not `done` and pick the only one, or ask which. |

Resuming continues from `status` (§3). Never redo a step the state block
records as done unless the code it verified has changed.

## 2. Size

Pick the lane from [LANES.md](LANES.md). State it in one line with the
reason, then proceed; the user can override with `--lane` or by saying so.

> Lane S: one module, no schema or API change. Plan, build, audit, ship.

When unsure between two lanes, pick the larger. Raise the lane mid-flight
when scope grows (record it in the state block and say so); never lower it
silently.

## 3. Run the lane

Call each step's skill with the Skill tool, one at a time, passing the work id.

| `status` | Next step |
|----------|-----------|
| (none, lane XS) | Build in place, self-review, then `ship-it` |
| (none) | `plan-it` |
| `planned` | `build-it` |
| `building` | `build-it` (it resumes from the frontier) |
| `auditing` | `audit-it` |
| `shipping` | `ship-it` |
| `done` | Report it is done; nothing to run |

Each step ends with an outcome: `done`, `blocked` or `failed`.

- `done`: continue to the next step without asking, except at the stops below.
- `blocked`: stop and show the question or blocker.
- `failed` from `audit-it`: route back to `build-it` with the numbered Must
  findings. The third failed audit round stops and asks the user.

## 4. Where it stops

Only these points wait for the user:

- `plan-it`: grill rounds (lane M and up) and plan approval (lane S and up).
- `build-it`: a stop condition it reports as `blocked`.
- `ship-it`: assumption confirmation and the commit question.

Everything between plan approval and ship runs without asking.

## 5. Lane XS

No files under `docs/planning/`. Follow the `core` posture, build test-first
when the change has logic, run the project's checks, then self-review the diff
against the request (each changed line traces to it; no secrets; nothing left
half-done). Call `ship-it` with `--lane xs`.

## 6. Closing message

First line: the lane and where the work stands. Then `Skipped / Not checked /
Risk`. Last line: the next step, or the stop waiting for the user.
