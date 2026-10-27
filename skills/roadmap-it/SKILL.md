---
name: roadmap-it
description: Chart an extra-large effort as a durable roadmap of buildable slices, then keep it current as slices ship.
disable-model-invocation: true
argument-hint: "[idea | roadmap file] [next | replan]"
---

# roadmap-it

For work too big or too foggy for one plan (lane L). Each slice is built
through the normal flow as an S or M item. Unlike a plan, the roadmap is kept
in the repo's roadmap directory (default `docs/roadmap/<slug>.md`).

## Modes

| Invocation | Does |
|------------|------|
| `/roadmap-it "<idea>"` | Chart a new roadmap (§1-§5) |
| `/roadmap-it <file> next` | Show where every slice stands and start the next one (§6) |
| `/roadmap-it <file> replan` | Re-plan after slices ship or facts change (§7) |

## 1. Destination first

Call the Skill tool with "grill-it" to pin down the destination: what is
true when this effort is done, for whom, and what it is not. Write it as a
short statement plus numbered requirements (`G1`, `G2`, ...), each one
checkable. Call the Skill tool with "name-it" for the terms it introduces.
The destination fixes the scope; everything else follows from it.

## 2. See the ground

- Existing code: read `docs/reference/` if mapped, else call the Skill tool
  with "map-it" in chat mode for the areas involved. A health check of a risky
  area: call the Skill tool with "sweep-it".
- External facts the effort depends on: one subagent per question, on the
  mid-tier model, each calling the Skill tool with "look-it-up", in parallel, each reply
  `done`, `blocked` or `failed` plus one line, under 100 words.
- A new project: the greenfield agenda in
  [GREENFIELD.md](../scope-it/GREENFIELD.md) shapes the first milestone.

## 3. Slice

Grill breadth-first across the whole destination, then cut slices per
[SLICING.md](SLICING.md): vertical, shippable, lane S or M, each with what it
delivers, covers, is blocked by, and the check that verifies it. What cannot
be cut yet goes to Open decisions (sharp) or Fog (not yet sharp). Decisions
that are hard to reverse get an ADR through name-it.

## 4. Sequence

Group slices into milestones, each ending in something a user or operator can
see. Order by blocks, then risk (spikes and risky slices early), then value.
The first milestone proves the path end to end.

## 5. Check, write, approve

Write the roadmap per [FORMAT.md](FORMAT.md), then run the checks in
[SLICING.md](SLICING.md) (coverage of every `G`, no cycles, exit checks,
slice sizes) and fix what fails before showing it.

Present the destination, the milestones with their slices, the open decisions
and the out-of-scope list; end the turn. On approval record the date in the
file. With `--publish` or `DO_IT_PUBLISH_PLANS=true`, call the Skill tool
with "track-it" and publish one parent per milestone with a child per slice;
record each milestone ref in the frontmatter and each slice ref in its row's
`Ref` cell, so ship-it closes the slice's own issue.

## 6. Next

`work.mjs roadmap <file>` (the work-item script, [STATE.md](../do-it/STATE.md))
derives each slice's state, none stored: shipped or dropped (Status says
so); stale (a plan names it but git tracks the plan, so it was committed
outside ship-it: ask whether to mark it shipped or re-scope); in flight (a
plan names it); blocked (a Blocked-by slice not shipped, or a decision still
under Open decisions); refine; ready.

Show the slices by state. A slice's `unmet` lists the unmet Verify clause of
each slice it depends on that shipped with `Verify unmet`; it does not wait,
but show the clause beside it. Its `blocking` lists each open decision with the
slices it blocks. Ask each before starting a slice: call the Skill tool
with "grill-it", one question with a recommended answer. A settled one
leaves Open decisions, gets a dated `Decisions so far` line, and is reread.
Its `next` is the first ready or refine slice by milestone, then risk (high
first), fewest blocks, id; offer a spike that blocks more slices instead.
Start it by reading [do-it](../do-it/SKILL.md) with `<file>#<id>`. A
`refine` slice gets a short grill first, then its Status is cleared.

## 7. Replan

After a slice ships, a spike or decision answers, or the destination moves:
1. Name the change and whether the destination moved or only the route.
2. Rewrite only slices that have not started; never touch shipped ones.
3. Turn sharp fog into slices or decisions; drop slices the shipped work made
   unnecessary (`dropped <date>: <why>`); re-cut any that grew past lane M.
4. Re-run the §5 checks, add a dated line to Decisions so far and to Changes,
   and show the diff for approval.

## Rules

- No code here: the roadmap decides what and in which order; scope-it decides
  how. Each slice is at most lane M.
- ship-it marks a slice `shipped`; the roadmap is never deleted at ship.
