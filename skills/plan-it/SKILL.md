---
name: plan-it
description: Turn a request or issue into an approved do-it plan scaled to its lane, with seams, verifiable steps, and ADRs only where warranted; optionally publishes phases to the tracker.
disable-model-invocation: true
argument-hint: "[request | issue ref | work id] [--lane s|m] [--publish]"
---

# plan-it

Read-only for code. Produces the plan and its state block
([STATE.md](../do-it/STATE.md)), then stops for approval.

## 1. Inputs

- An issue ref or path: fetch it with the `tracker` skill and list it under
  `sources:`. Several issues can feed one plan; merge overlapping ones.
- Free text: plan from it directly. No intake file is required.
- The lane from `do-it`, else size it with [LANES.md](../do-it/LANES.md).

## 2. Grill, scaled to the lane

| Lane | Grill |
|------|-------|
| S | 0-3 questions in one turn, each with a recommended answer. Zero when the issue already has acceptance criteria and the code answers the rest. |
| M | Call the Skill tool with "grilling", then with "domain-modeling". Add the agenda in [GRILL.md](GRILL.md). End the turn after each round. |

Find facts yourself (read code, ADRs, `GLOSSARY.md`); ask only for decisions.
For seams and interfaces, call the Skill tool with "codebase-design" and use
its vocabulary.

## 3. Write the plan

Follow [PLAN-FORMAT.md](PLAN-FORMAT.md):

- Lane S: one file, `docs/planning/<id>.md`.
- Lane M: `docs/planning/<id>/README.md` plus one `phase-N.md` per phase.

Every step or phase states how it is verified (`step → verify: check`).

## 4. ADR only when warranted

Write an ADR only for a decision that is hard to reverse, surprising without
context, and the result of a real trade-off. All three, or none: the decision
lives in the plan instead. Follow domain-modeling's ADR format, status
`Proposed`, next free number under `docs/adr/`, linked from the plan.

## 5. Approve

Present the plan in chat: the steps or the numbered phases with `Blocked by`
and what each delivers, plus any assumptions. End the turn.

On approval, record `approvals.plan: <date>` and `status: planned`. Edits the
user asks for are made and re-presented; approval of the edited plan counts.

## 6. Publish (optional)

With `--publish`, or when the tracker config sets `DO_IT_PUBLISH_PLANS=true`,
call the Skill tool with "tracker" and run `publish` for the plan. It records
the parent and per-phase refs under `tracker:` in the state block. Lanes S and
XS publish nothing by default.

## 7. Close

> Plan `<id>` approved: lane <lane>, <N> phase(s). **Next:** `/build-it <id>`.

When `do-it` called this skill, return `done` and let it continue.

## Rules

- No code edits, no commits.
- Out-of-scope work found while planning goes to `issue-it`.
- Rejected ideas get one line under the plan's `## Non-goals`.
