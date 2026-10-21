# Grill agenda (lane M)

Add these branches to the `grill-it` design tree:

- **One plan or several.** Merge overlapping issues; split work that ships
  independently. A split into several shippable efforts means lane L: a
  roadmap (roadmap-it) instead of one plan.
- **Vertical slices.** Each phase is a narrow path through every layer it
  touches, verifiable on its own, and fits one fresh context window.
  Prefactoring goes first, in its own phase if it is more than trivial.
- **Wide mechanical refactors** are the exception: expand (add the new form
  beside the old), migrate call sites in batches each blocked by the expand,
  contract (delete the old form) blocked by every batch.
- **Blocking edges.** For each phase, the phases that must finish first.
- **Seams.** For each phase, the public interfaces tests will sit at, what a
  test there catches and what it misses. A phase with no code seam names its
  observable check instead.
- **Assumptions.** Reversible defaults the build may take without asking.
- **Deferred decisions and risk.**

When the open branches are down to confirmations, write the plan and run its
checks (scope-it §3) before asking again. That last round is the plan
approval: the phases with `Blocked by`, the assumptions and any builder
questions, in one turn. The user's "do it" approves both; there is no separate
approval stop.
