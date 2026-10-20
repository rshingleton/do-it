# ADRs

An ADR records that a decision was made and why, so nobody "fixes" it later.
Short is the norm: most fit in one paragraph.

## Location and numbering

The ADR directory is the one resolved for this repo (`docs/adr/` by
default). Files are `NNNN-kebab-title.md`, numbered one past the highest
existing number in that directory. Create the directory with the first ADR,
not before.

In a repo with a context map, an area may keep its own ADRs in
`<area>/docs/adr/`. Read them, beside the root ones, for work in that area.
Write a decision there only when the area already has that directory and the
decision is the area's alone; otherwise write it in the root directory.

## Shape

```markdown
---
status: proposed
---

# Retry payments from a queue, not inline

Card declines from the provider are often transient, and retrying inside the
request held checkout open for up to 40 s. We retry from a queue with
backoff and tell the customer the payment is pending. Inline retry and no
retry were both rejected: one hurts checkout, the other loses sales.
```

Status is one of `proposed`, `accepted`, `deprecated`, or
`superseded by NNNN`. A plan's ADRs start `proposed`; `ship-it` moves them to
`accepted` and adds `## Execution notes` with what the build learned.

Add a section only when it pays for itself:

- `## Options considered` when a rejected option is likely to be suggested
  again;
- `## Consequences` when a downstream effect is not obvious from the
  decision.

## What tends to qualify

All three tests (hard to reverse, surprising, real trade-off) still apply;
these are where decisions that pass them usually come from:

- the overall shape of the system or of how two parts talk to each other;
- a technology that would take weeks to swap out (store, queue, identity,
  hosting), not every library;
- ownership lines: which part owns which data, and what others may not do;
- a deliberate departure from the conventional choice, which a later reader
  would otherwise undo;
- an outside constraint the code cannot show (a contract, a regulation, a
  partner's limits);
- an alternative rejected for a reason that is not obvious.

Easy to reverse, unsurprising, or the only real option: skip the ADR.
