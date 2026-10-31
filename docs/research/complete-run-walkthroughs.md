# Complete-run walkthroughs

The two phase 2 walkthroughs of the complete-run lane that were never run
(T153): a swept roadmap ending with every decision in a legal state, and a
non-interactive scope-it plan with no question turn. Run on 2026-10-30, the
second one live across the 19 slices of the open-backlog roadmap.

## Swept roadmap, every decision in a legal state

Fixture: a one-slice-blocked roadmap (`R1` blocked by `D1`, `R2` free) with
`D1` under Open decisions, swept as `weak-but-explicit` the way
[SWEEP.md](../../skills/roadmap-it/SWEEP.md) §2 says: the default recorded as an
assumption in the run record (`run add-assumptions walk sweep`), nothing else.

- `work.mjs run next` offers `R2` and never `R1`; after `R2` ships it has
  nothing left to offer for `R1` either.
- `work.mjs roadmap` still reports `R1` `blocked`, "waiting on D1", and
  `finished: false`.

So a decision the sweep has settled is still an open one to the roadmap. The
run ends with `R1` neither shipped nor parked, and `run next` does not list it
under `parked` or `waiting`, so the closing message has nothing to say about
it. The live run hit the same thing: R12, R16 and R22 were held back by D3, D2
and D1 until the three were moved to Decisions so far by hand.

A `ready` decision is legal (dated line, removed from Open decisions). A
`weak-but-explicit` one has no such step in SWEEP.md, which is silent about
Open decisions for it, so it is not legal as written. An `ask-when-reached` one stays in
Open decisions by design, but the slice it blocks is left unparked and
unreported, which is the same gap.

## Non-interactive scope-it plan, no question turn

Run live over the slices of the open-backlog roadmap, planned, built, audited
and shipped through `work.mjs` (the scope-it
[NONINTERACTIVE.md](../../skills/scope-it/NONINTERACTIVE.md) path). Every
plan was written from the roadmap row and the run record's assumptions, and no
slice plan put a question to the user; the one unknown that failed
assume-or-ask, a paid model call in R23, parked its slice instead.

Defects the walk found:

- Closing docs written after `run verify` (the roadmap row's Status, the
  to-do list) change the work item's fingerprint, so `run gate` returns
  `STALE_VERIFY` and the slice needs a replan and a new audit. The loop text
  does not say to write them before the verify.
- `run verify` on an item that is no longer `building` fails before the check
  runs, with "phase-done is not allowed from shipping; allowed: ...". It lists
  the allowed events but never says the item must be `building` or how to get
  back there (replan).
- A reviewer's final report can arrive before its closing completion notice,
  and the notice can say its own background work is still running; the loop's
  "wait for each reviewer's final notice" does not say which one counts.

Findings are on the to-do list as T205 to T208.
