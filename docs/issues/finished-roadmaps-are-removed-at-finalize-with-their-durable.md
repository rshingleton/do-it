---
title: "Finished roadmaps are removed at finalize, with their durable content moved first"
type: feature
status: open
source: user
---

## Context

User request, 2026-11-16, while charting `docs/roadmap/todo-clearance-2026-11.md`:
"old roadmaps should be removed when finished. Items need to be logged or
moved to adrs or durable docs. No fucking old roadmap files should be left
after finished. Needs to happen before commits either through ship it or after
final steps."

`skills/ship-it/FINALIZE.md` says the opposite today: "A finished roadmap
keeps its file in `docs/roadmap`; this turns it into a lasting record" (line 3)
and "Never delete the roadmap" (line 60). Offers `a` to `d` already make ADRs,
file Fog lines as to-dos and turn `## Changes` into `## Shipped`, but the file
stays.

Five completed roadmaps sit in `docs/roadmap/`: `backlog-hardening.md`,
`debt-simplification.md`, `open-backlog-2026-10.md`, `run-lane-hardening.md`,
`should-backlog-2026-10.md`. `work.mjs roadmap` offers no slice from a
completed one, so they are read-only weight.

## Problem

Nothing ever removes a finished roadmap. The parts that still matter (a
decision that never became an ADR, a Fog line, the Shipped list) have no
durable home, and `FINALIZE.md` forbids the deletion that would close the
loop. The repo therefore accumulates `docs/roadmap/*.md` files that only git
history needs, and a reader cannot tell an active roadmap from a closed one by
the directory listing.

## Acceptance

- Finalizing a finished roadmap triages its content before anything is
  deleted: each Decisions-so-far entry that passes name-it's three-part test
  becomes an accepted ADR, each Fog line is filed through `log-it`, and the
  Shipped list lands in a named durable doc under `docs/reference/` (or the
  area's existing record), listing each slice, its date and its outcome.
- The roadmap file is deleted in the same change, before the commit ship-it
  makes, so the commit that finalizes a roadmap also removes it.
- A check fails when a roadmap file with `completed:` in its frontmatter is
  still in the tree, wired where commits happen (`scripts/check.mjs` or the
  commit guard), so the rule holds for a commit made outside ship-it too.
- The five completed roadmaps are removed this way in the same change, their
  decisions, Fog lines and Shipped bullets triaged first.
- `npm test && npm run check` pass, and a fixture proves a finalize leaves no
  roadmap file and does leave the durable record.
- `FINALIZE.md` no longer says "Never delete the roadmap"; `roadmap-it` and
  any other doc that says a completed roadmap keeps its file is updated.

## Notes

- `skills/ship-it/FINALIZE.md:3`, `:26-32` (Paths), `:45-50` (offers c and d),
  `:60`.
- `skills/roadmap-it/SKILL.md` §7 and `FORMAT.md:75-83` describe `completed:`
  and `## Shipped`; both need the new ending.
- The repo has no changelog (`docs.changelog` resolves to null), so the
  durable record is a reference doc, not a changelog entry.
- Existing ADRs under `docs/adr/` may already carry some of the five
  roadmaps' decisions; check before creating duplicates.
- 2026-11-16: the five completed roadmaps were removed by hand. Their
  destinations, Shipped lists, decisions, Fog and Out-of-scope lines are in
  `docs/reference/roadmap-history.md`. The rule this issue asks for is still
  unimplemented: finalize must do this itself.
