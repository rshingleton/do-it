---
title: "Open roadmap decisions (D#) are never asked, so slices they block stay stranded"
type: bug
status: open
source: user
---

## Context

User report (2026-10-26): "need to settle decision markers better. Currently the skill seems to silently skip D# items when presenting tasks or doing do it. This causes roadmap slices to be skipped leaving blockers open as the plan completion will skip these for later items over just asking and settling decisions."

Seen in `docs/roadmap/backlog-hardening.md`: D1 ("does the usage ledger record cost") blocks R21. Slices R1-R14 and R22 were offered and started in order; D1 was never raised, and R21 stays `blocked` ("waiting on D1") until someone notices.

Code: `skills/do-it/scripts/roadmap.mjs` derives `next` from `ready`/`refine` slices only (`ready[0]?.id`); open decisions are returned as `openDecisions` but never surface as an offer. `skills/roadmap-it/SKILL.md` §6 says to "offer instead an open decision or spike that blocks more slices", but nothing implements or enforces that. `skills/do-it/SKILL.md` §1 starts only `ready` or `refine` slices.

## Problem

An open decision (`Dn` under "Open decisions") only ever blocks slices; no step asks it. The roadmap's `Answer by:` clause ("grill with the user when R21 is next") is prose that no step reads. So the flow runs every ready slice, finishes, and leaves decision-blocked slices stranded, when a short question would have unblocked them earlier.

## Acceptance

- `work.mjs roadmap <file>` reports, beside `next`, the open decisions that block at least one slice and how many each blocks (`blocking: [{id, blocks: [...]}]`)
- When `do-it` is given a roadmap file or a slice, and when a slice ships, it states each open decision blocking slices and asks the user to settle it (a grill-it round with a recommended answer), rather than only naming the next ready slice
- A settled decision is recorded: removed from "Open decisions", a dated line under "Decisions so far", the blocked slices' state recomputed
- A decision whose `Answer by:` names a slice is asked no later than just before that slice would start, never skipped for later items
- `npm test && npm run check` pass; a test for the roadmap output (a decision blocking two slices appears with both) and the pin that roadmap-it and do-it name the ask

## Notes

Related: roadmap-it §6 and §7, do-it §1 and §4 (the stops list has no decision stop), `skills/do-it/scripts/roadmap.mjs:59,100-118`. A to-do or Fog item is not the right home; D# items are first-class blockers.
