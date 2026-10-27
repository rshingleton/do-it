# Lenses

Look through each lens at the scope. Order of importance: correct, safe,
holds under the expected load, tested, fast, lean.

## Correctness and risk

1. **Bug.** Wrong result, crash, missed edge case (empty, zero, last item,
   rounding, time zones, encoding); callers that disagree with what a
   function returns; the same rule implemented differently in two places.
2. **Risk.** Injection, missing checks on user input, weak randomness,
   secrets in code, authorization gaps; data loss through swallowed errors,
   writes in the wrong order, missing transactions.
3. **Scale.** Fine for one user, wrong for many: check-then-write races, a
   query per item, memory or lists that only grow, per-process state that
   must be shared, O(n²) on real input sizes.

## Tests

4. **Test gap.** Risky logic (a branch, a parser, money, auth, data writes)
   with no test that would fail if it broke. Flaky, skipped or
   environment-dependent suites. Recommend one good test per gap, at the
   level that catches it (unit, integration, contract, e2e), as a `TR-n`.

## Debt, drift and lean

5. **Debt.** `TODO`, `FIXME`, `HACK` with no owner or trigger; duplication;
   feature flags stuck on; dependencies far behind or pinned to vulnerable
   versions (name the manifest, do not run a full CVE audit). Collect the
   shortcut ledger:

   ```bash
   git grep -nE '(#|//|/[*]|--|<!--) ?shortcut:'
   ```

   One row per marker: limit, upgrade trigger, or `no-trigger`.
6. **Drift.** Code that contradicts an accepted ADR, `docs/reference/`, the
   README, or an area's `CONTEXT.md`; config documented but unused, or used but not
   documented.
7. **Lean.** Dead code, unused options and config, a dependency doing what a
   few lines or the platform does, an interface with one implementation, a
   pass-through wrapper, near-copies that must change together, a function
   doing several unrelated jobs.

## Architecture (brief)

8. Apply the deletion test ([design-it](../design-it/SKILL.md)) to the
   modules the scope leans on; note shallow modules, leaky seams and
   hypothetical seams in one line each, in the `design-it` vocabulary. Do not
   design fixes here; point to `deepen-it` for anything worth deepening.
