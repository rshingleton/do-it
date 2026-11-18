---
title: "finish-it runs a roadmap in the repo that holds it, never a sibling checkout"
type: bug
status: open
source: user
---

## Context

User report, 2026-11-16. They ran `/finish-it docs/roadmap/polish.md` in
`C:\projects\do-it`. No `docs/roadmap/polish.md` exists in do-it. A file of
that name exists in `C:\projects\game-skillet`. The agent found it there and
ran the complete loop in game-skillet: it moved the session, read that repo's
AGENTS.md, and started scoping its slices, while the user believed the work
was in do-it.

Verbatim: "docs/roadmap/polish.md was in another fucking project. Do it needs
to put the fucking roadmaps in the project/repo space that is being worked
on, not in the fucking wrong place."

## Problem

`skills/finish-it/SKILL.md` §1 says the input is a roadmap file and resolves
it against the working directory, but nothing refuses a path outside the
working tree's repo root and nothing checks that the roadmap belongs to the
repo being worked on. A same-named roadmap in a sibling checkout is accepted
silently. The run record lands in that checkout's planning directory and
every plan, worktree and commit happens there, so one wrong path moves the
whole run out of the repo the user is working in.

## Acceptance

- finish-it §1 refuses a roadmap path that does not resolve inside the
  working tree's repo root, naming the path and the repo root, before
  `run new` and before any slice is scoped.
- A roadmap outside the repo root starts only when the user names that repo
  explicitly; the run then reports the repo root in its first line and in the
  record, and never moves the session to it on its own.
- `work.mjs run new` stores the repo root the roadmap resolves to and
  `run show` prints it; a run command issued from another checkout refuses
  instead of reading a record that is not its own.
- A test pins the refusal: a roadmap in a sibling temp checkout cannot start
  a run from the repo under test.
- A valid roadmap inside the repo behaves exactly as today.

## Notes

- `skills/finish-it/SKILL.md` §1; `skills/roadmap-it/SKILL.md` §7.
- `skills/do-it/scripts/work.mjs` (`run new`, `run show`).
- do-it's live roadmaps are `backlog-cleanup-2026-11.md` (R1 shipped) and
  `todo-clearance-2026-11.md`; `polish.md` belongs to game-skillet.
