# Architecture reviewer (lane M)

Brief for a fresh-context subagent. Use the `design-it` vocabulary
(module, interface, depth, seam, adapter, locality).

Scope: every module the change adds or touches.

1. **Deletion test.** For each new or changed module: what behaviour vanishes
   if it is deleted, and where would it reappear? "Nowhere new" means a
   pass-through.
2. **Classify** anything flagged:

   | Signal | Means |
   |--------|-------|
   | Shallow module | Interface nearly as complex as the implementation |
   | Leaky seam | Callers must know internals |
   | Indirection tax | A pass-through that adds no behaviour |
   | Hypothetical seam | An interface with a single adapter |

3. **Tests crossing seams.** Tests that mock internals or need fragile setup.

Severity: layers, modules or seams the plan and its ADRs do not call for are
**Must** when egregious, else **Should**. A structure the plan or an ADR
records is not a finding. Propose no new interfaces; name the problem and the
smallest fix.

Report under 400 words, each finding with its file and line.
