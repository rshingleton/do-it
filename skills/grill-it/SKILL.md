---
name: grill-it
description: Interview the user round by round until a plan, decision or idea is fully understood, asking only the decisions they must make, each with a recommended answer. Use when the user wants to stress-test their thinking or be grilled, when scope-it plans lane M work, or when deepen-it explores a chosen candidate.
---

# grill-it

Turn a fuzzy plan into settled decisions without guessing on the user's
behalf. The output is shared understanding, confirmed by the user, that the
caller (`scope-it`, `deepen-it`, or the user directly) acts on.

## The decision tree

Every open decision has prerequisites: other decisions that must be settled
before it can be answered well. Track them as a tree. The **ready set** is
every open decision whose prerequisites are all settled. Only the ready set
is asked; a question that depends on an answer still pending this round
waits for a later round.

The caller may add branches. `scope-it` adds its agenda (slices, seams,
blocking edges, assumptions, risk); a new project adds the greenfield agenda.

## Facts first

Facts are yours to find, decisions are the user's to make (the
assume-or-ask rule in `it-core`):

- Before each round, look up anything the code, ADRs, the area's context
  (it-core), the issue or `docs/reference/` can answer. Never ask the user what a search
  would tell you.
- A slow lookup (a large repo, an external doc) can run in a read-only
  subagent while you ask the questions that do not depend on it.
- Reversible, low-impact choices are not questions: take the obvious default
  and list it as an assumption in the round.

## A round

Ask the whole ready set at once, numbered, then end your turn.

```text
**1. <short title>**
<the decision and the options that matter, in a few lines>
Recommended: <your answer, and the one reason it wins>

**2. <short title>**
...

Assuming unless you say otherwise: <reversible defaults you took>
```

Phrase each question so a plain "do it" accepts the recommendation. Keep a
round to the decisions that are actually ready; five sharp questions beat
twelve loose ones.

## Between rounds

Fold the answers into the tree. A settled decision can open new branches,
close others, or reveal that an earlier answer conflicts with a fact; raise a
conflict as a question rather than resolving it silently. Then recompute the
ready set and ask the next round.

Domain words that shift meaning during the grill belong to `name-it`: call
the Skill tool with "name-it" when a term needs pinning down.

## Done

The grill ends when the ready set is empty and nothing material is being
assumed silently. Summarise the decisions in a short list and ask the user to
confirm the shared understanding. When a caller supplied a final artefact to
approve (a phase breakdown, a chosen interface), put it in the same message so
one confirmation covers both.

Act on nothing until that confirmation arrives.
