---
name: scope-it
description: Turn a request or issue into an approved do-it plan scaled to its lane, with seams, verifiable steps, and ADRs only where warranted; optionally publishes phases to the tracker.
disable-model-invocation: true
argument-hint: "[request | issue ref | work id] [--lane s|m] [--publish]"
---

# scope-it

Read-only for code. Produces the plan and its state block
([STATE.md](../do-it/STATE.md)), then stops for approval.

## 1. Inputs

- An issue ref or path: fetch it with the `track-it` skill and list it under
  `sources:`. Several issues can feed one plan; merge overlapping ones.
- Free text: plan from it directly. No intake file is required.
- A roadmap slice: its Delivers is the goal, its Verify becomes the plan's
  done-when, its Covers names the requirements to satisfy; it is recorded as
  `roadmap: <file>#<id>` (§3), and its `Ref` cell, if any, as `tracker`, so
  build-it starts and ship-it closes it. A slice that turns out bigger than lane M goes back
  to `/roadmap-it <file> replan`, not into a bigger plan.
- The lane from `do-it`, else size it with [LANES.md](../do-it/LANES.md).

## 2. Grill, scaled to the lane

| Lane | Grill |
|------|-------|
| S | 0-3 questions in one turn, each with a recommended answer. Zero when the issue already has acceptance criteria and the code answers the rest. |
| M | Call the Skill tool with "grill-it", then with "name-it". Add the agenda in [GRILL.md](GRILL.md). End the turn after each round. |

A new project (no source yet; see the do-it scout) adds the agenda in
[GREENFIELD.md](GREENFIELD.md) at either lane.

Find facts yourself (code, ADRs, the area's context per it-core,
`docs/reference/`); ask only for decisions. A library, API or standard fact
the code does not settle: call the Skill tool with "look-it-up". For seams,
call the Skill tool with "design-it" and use its vocabulary.

No `CONTEXT.md` for the plan's area: never write one while scouting; propose
"create `<area>/CONTEXT.md` with `/map-it <area>`" as a step at approval (§5).

## 3. Write the plan

Create the plan file with `work.mjs new <id> --lane s|m --title "<title>"`
(the work-item script, [STATE.md](../do-it/STATE.md)); it writes the full
state block, `status: draft`. Then fill the block with `work.mjs set`:
`sources`, `phases` (lane M), `assumptions`, and `roadmap` or `todo` when
the input carried one. Write the body per [PLAN-FORMAT.md](PLAN-FORMAT.md):

- Lane S: below the block in `docs/planning/<id>.md`.
- Lane M: below the block in `docs/planning/<id>/README.md`, plus one
  `phase-N.md` per phase.

Every step or phase states how it is verified (`step → verify: check`).

Then run the two passes in [CHECKS.md](CHECKS.md) before showing anything:
an analyze pass (coverage both ways, verify checks, names, blocks, rules)
and a builder check (a fresh subagent reads only the plan and returns the
questions a builder would ask). Fix the plan from both; questions only the
user can answer join the approval turn.

## 4. ADR only when warranted

Write an ADR only for a decision that is hard to reverse, surprising without
context, and the result of a real trade-off; otherwise it lives in the plan.
Follow [name-it's ADR format](../name-it/ADR-FORMAT.md), status `Proposed`,
next free number in the repo's ADR directory, linked from the plan.

## 5. Approve

Present the plan in chat: the steps or the numbered phases with `Blocked by`
and what each delivers, the assumptions, and any builder-check questions for
the user (each with a recommended answer). The plan stays `status: draft`.
End the turn; lane M makes this its last grill round ([GRILL.md](GRILL.md)).

On approval, `work.mjs event <id> approve`. Edits the user asks for are made
and re-presented; approval of the edited plan counts.

## 6. Publish (optional)

With `--publish`, or when the tracker config sets `DO_IT_PUBLISH_PLANS=true`,
call the Skill tool with "track-it" and run `publish` for the plan. For Jira,
settle the spec's `project`, `components` and `parent` epic in the approval
turn (config values recommended; `none` when the user says not to). Record
the parent and per-phase refs it returns with `work.mjs set <id> tracker
'{"kind":"<kind>","ref":"<ref>","phases":{"1":"<ref>"}}'`. Lanes S and XS
publish nothing by default.

## 7. Close

> Plan `<id>` approved: lane <lane>, <N> phase(s). **Next:** `/build-it <id>`.

When `do-it` called this skill, return `done` and let it continue.

## Rules

- No code edits, no commits.
- Out-of-scope work found while planning goes to `log-it`.
- Rejected ideas get one line under the plan's `## Non-goals`.
