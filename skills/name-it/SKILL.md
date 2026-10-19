---
name: name-it
description: Keep the project's domain language and its decision records honest while design work happens, by challenging vague or conflicting terms, writing settled terms into the glossary, and recording ADRs only for decisions that warrant one. Use when the domain model or its terminology and naming is being shaped, discussed or disputed, when editing the glossary (GLOSSARY.md, CONTEXT.md or a configured path), or when recording or editing an ADR.
---

# name-it

The active side of the domain model: shaping words and decisions while they
are being made. Reading the glossary for vocabulary is not this skill; every
skill does that. This one changes the model.

## Where the files live

Repos differ, so never assume `GLOSSARY.md` and `docs/adr/`. Use the
project-doc paths resolved for this repo (listed in session context by the
do-it hooks, or by `tracker.mjs config` under `docs`): the glossary may be
`CONTEXT.md` or `docs/GLOSSARY.md`, the ADR directory `docs/decisions/`.

- One context (most repos): one glossary file, one ADR directory.
- Several contexts: a `GLOSSARY-MAP.md` at the root points to each context's
  glossary and its own ADRs ([GLOSSARY-FORMAT.md](GLOSSARY-FORMAT.md)).
- Create a file only when there is something to put in it. Never start a
  second glossary beside an existing one.

## While the design is moving

- **Hold terms to the glossary.** A word used against its glossary meaning
  is raised at once: "the glossary says a Shipment is one parcel; this
  treats it as a whole order. Which do you mean?"
- **Replace vague words.** Overloaded words ("account", "item", "process")
  get a precise candidate term and the question of which concept is meant.
- **Probe with scenarios.** Invent concrete edge cases that force the
  boundary between two concepts into the open (a partial refund, a merged
  customer, an order split across warehouses).
- **Check claims against the code.** When the user says how something works
  and the code disagrees, show the conflict and ask which is right.

## Writing terms down

Write a term into the glossary the moment it settles, in the format in
[GLOSSARY-FORMAT.md](GLOSSARY-FORMAT.md). One term at a time, as it happens;
nothing is batched for later.

The glossary holds meaning only: no implementation detail, no specs, no
notes. A term earns a place only if it is particular to this domain.

## Decisions

Write an ADR only when the decision is all three of:

1. **hard to reverse**, so changing course later costs real effort;
2. **surprising without context**, so a reader of the code would ask why;
3. **a real trade-off**, with genuine alternatives that lost for a reason.

Missing any one: no ADR; the decision lives in the plan or the changelog.
Format, numbering and status in [ADR-FORMAT.md](ADR-FORMAT.md). An ADR written
during planning starts `Proposed`; `ship-it` accepts it when the work ships.
