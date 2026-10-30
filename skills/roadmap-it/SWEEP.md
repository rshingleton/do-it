# Decision sweep (complete runs)

Runs after the §5 checks and before the roadmap is approved, when the run
will be `/do-it <file> --complete` (see [do-it](../do-it/SKILL.md)). Goal:
no slice plan asks the user anything later. Without `--complete` skip it.

## 1. Collect

List every decision the run could raise:

- each entry under Open decisions;
- for each slice, the questions its scope-it grill would ask (scout the code
  first; ask only what the code, ADRs and sources do not settle).

Give each a stable name (`D1`, `D2`, ...) and the slices it touches.

## 2. Give each one a state

| State | Means | Record |
|-------|-------|--------|
| `ready` | The user answered it | Dated line under Decisions so far; remove it from Open decisions |
| `weak-but-explicit` | A recommended default, accepted knowingly | The default and a stop-if-wrong note ("revisit if X"), as an assumption in the run record |
| `ask-when-reached` | The user will not decide now | Stays in Open decisions; the slice that needs it parks when the run reaches it |

A decision left in none of the three is a sweep failure: fix it before the
approval turn. Settle in the grill-it style, one recommended answer each,
batched by theme.

## 3. Ultra

At `ultra`, also challenge each slice the destination does not justify
(no `G` it covers, or a G another slice already delivers). The user keeps it,
cuts it or defers it; a cut or deferral is a dated line under Changes.

## 4. Approve

The final sweep round is the single plan approval: the slices by milestone,
every decision with its state, the weak-but-explicit defaults with their
stop-if-wrong notes, and the ask-when-reached list. End the turn. On approval
record the date in the file and write the settled defaults to the run record
with `work.mjs run set <slug> assumptions '<json array>'`.

`lite` keeps today's flow: the sweep still runs, but each slice's scope-it grill
still asks its own questions and the run stops after every slice (the lite level).

## 5. Handoff to scope-it

After approval a slice plan is non-interactive: see the run path in
[scope-it](../scope-it/SKILL.md) (§2) and [NONINTERACTIVE.md](../scope-it/NONINTERACTIVE.md).
