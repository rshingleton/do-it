---
name: name-it
description: Keep the project's domain language and its decision records honest while design work happens, by challenging vague or conflicting terms, writing settled terms into the area's CONTEXT.md, and recording ADRs only for decisions that warrant one. Use when the domain model or its terminology and naming is being shaped, discussed or disputed, when editing a CONTEXT.md or CONTEXT-MAP.md, or when recording or editing an ADR.
---

# name-it

The active side of the domain model: shaping words and decisions while they
are being made. Reading the area's context for vocabulary is not this skill;
every skill does that. This one changes the model.

## Where the files live

Repos differ, so never assume `CONTEXT.md` and `docs/adr/`. Use the
project-doc paths resolved for this repo (listed in session context by the
do-it hooks, or by `tracker.mjs config` under `docs`).

- One area: a root `CONTEXT.md` and one ADR directory.
- Several areas: a `CONTEXT-MAP.md` at the root lists each area's
  `CONTEXT.md`. Work in the area the topic belongs to; if that is unclear,
  ask.
- The shape of both, how to find the area for a path, and when a file or the
  map is created: [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md). A file is created
  only when a term has to go in it, with its map row.

## While the design is moving

- **Hold terms to the context.** A word used against its recorded meaning
  is raised at once: "Fulfilment's context says a Shipment is one parcel;
  this treats it as a whole order. Which do you mean?"
- **Replace vague words.** Overloaded words ("account", "item", "process")
  get a precise candidate term and the question of which concept is meant.
- **Probe with scenarios.** Invent concrete edge cases that force the
  boundary between two concepts into the open (a partial refund, a merged
  customer, an order split across warehouses).
- **Check claims against the code.** When the user says how something works
  and the code disagrees, show the conflict and ask which is right.

## Writing terms down

Write a term into the Terms section of the area's `CONTEXT.md` the moment it
settles, in the format in [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md). One term at
a time, as it happens; nothing is batched for later. A term shared by every
area goes in the root context.

Terms hold meaning only: no implementation detail, no specs, no notes. A term
earns a place only if it is particular to this domain. The other sections of
the file belong to `map-it`; leave them as they are.

## Decisions

Write an ADR only when the decision is all three of:

1. **hard to reverse**, so changing course later costs real effort;
2. **surprising without context**, so a reader of the code would ask why;
3. **a real trade-off**, with genuine alternatives that lost for a reason.

Missing any one: no ADR; the decision lives in the plan or the changelog.
Format, numbering, status and which directory (root or area) in
[ADR-FORMAT.md](ADR-FORMAT.md). An ADR written during planning starts
`proposed`; `ship-it` accepts it when the work ships.
