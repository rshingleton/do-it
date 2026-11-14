# Audit rounds

Detail for [SKILL.md](SKILL.md) §2 to §5. It keeps a fix-and-audit cycle
finite: later rounds look at what changed, not the whole change again.

## Settled and Touched

Recorded in the plan's `## Audit` section (lane S) or `audit-report.md`
(lane M), as two sections, each with a `#### Round N` block per round, one
line per item, no repeats:

- `### Settled`: findings fixed or accepted that round (number, `file:line`,
  claim). prove-it creates both sections at round 1 and adds the accepted
  findings; build-it's fix mode adds the fixed ones.
- `### Touched`: the paths changed to fix them. build-it's fix mode adds them,
  and so does ship-it before a review-driven `reaudit`.

## Scope

Round 1 reads the whole change. Round N+1 reads round N's Touched paths and the
files named in round N's Settled lines. A Must found elsewhere still counts.
Every reviewer gets the Settled list from all earlier rounds, with the order:
do not re-raise these.

## Order

Reviewers first (§3). Then, once, only when no Must stands, the full test,
lint, format and type-check run (§2) and the scan, before `audit-pass`. A
FAIL round skips them: build-it's `verify-phase` already ran what the fix
needed. A failing check is a Must.

## Should and Nice

They never block and never start a re-audit. Fixing them is the user's call;
a re-audit after a PASS runs only when the user asks for it (`reaudit`).

## The cap

`work.mjs event <id> reaudit` is refused after 3 consecutive passes
(`audit.clean_passes`, [STATE.md](../do-it/STATE.md)). When it is refused:

1. Log every open Should and Nice as a to-do with `log-it`, `source` the work
   id.
2. Say so, and offer `/ship-it <id>`.
3. One more round only when the user asks: `reaudit --again`. Otherwise replan.
