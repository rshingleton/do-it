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

They never block and never start a re-audit. They are fixed when the fix is
cheap, and the run still ends:

- A Should in a failing round is fixed with the Musts and recorded under
  `### Settled`, like a Must.
- After a clean PASS, the Shoulds that are small and local (one file, no
  interface, no behaviour change) are fixed once per work item, as a review
  edit is: edit at ship, run `verify-phase`, then one scoped `reaudit`. The
  pass spends no audit cap but uses one of the three clean passes. Record a
  `Should pass` line under that round's `### Settled`; with one in any earlier
  round, log the open Shoulds instead.
- A Must that `reaudit` raises is fixed in the normal fail round; a Should it
  raises is logged, never fixed.
- A Nice is fixed only when trivial. Anything bigger is logged.
- A fixed Should is not validated ([VALIDATE.md](VALIDATE.md)). A fix that
  fails `verify-phase` is reverted and logged.

## The cap

`work.mjs event <id> reaudit` is refused after 3 consecutive passes
(`audit.clean_passes`, [STATE.md](../do-it/STATE.md)). When it is refused:

1. Log every open Should and Nice (not fixed, not reverted) as a to-do with `log-it`, `source` the work
   id.
2. Say so, and offer `/ship-it <id>`.
3. One more round only when the user asks: `reaudit --again`. Otherwise replan.
