# Designing an interface more than once

The first interface you think of is rarely the best. When a candidate is
chosen (from `deepen-it`, or a seam `scope-it` is unsure about), design it
several ways in parallel and compare. Terms are from [SKILL.md](SKILL.md).

## 1. Lay out the problem for the user

Before starting any subagent, write the user a short account of:

- what any interface here must satisfy (callers, invariants, failure cases);
- what it depends on, sorted by kind as in [DEEPENING.md](DEEPENING.md);
- a rough code sketch that makes those constraints concrete. It illustrates
  the problem; it is not a proposal.

Send it and carry straight on; the user reads while the designs are drawn.

## 2. Draw three or more designs at once

Start at least three subagents together. Each gets the same technical brief
(file paths, how the pieces are coupled, the dependency kinds, what must sit
behind the seam, the `design-it` terms and the Terms in the area's `CONTEXT.md`) and
one different pull:

| Designer | Pull |
|----------|------|
| A | The fewest entry points that still serve every caller. |
| B | Room to grow: many uses, extension without edits. |
| C | The most common call is a one-liner; rare cases may cost more. |
| D (when dependencies cross the network) | Interfaces and adapters at every outside dependency. |

Each returns:

1. the interface: signatures plus invariants, call order and failure modes;
2. a caller using it;
3. what the implementation hides behind the seam;
4. which dependencies get adapters, and which adapters;
5. where it gives the most leverage and where it is thin.

## 3. Compare and recommend

Show the designs one after another, then compare them on depth, locality and
where each puts the seam. Finish with a recommendation: the design you would
build and why, or a combination of parts from two of them. Give a firm view;
the user can overrule it.
