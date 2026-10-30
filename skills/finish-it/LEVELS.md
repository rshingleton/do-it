# Levels

The record's `level` (`work.mjs run show <slug>`). One branch each; the loop
in [SKILL.md](SKILL.md) is the same.

## lite

Decisions are still settled up front, but the run keeps a human gate per
slice. Scope-it follows its normal grill, not the non-interactive form. Ship-it
asks its one question and the commit question as it does outside a run. After
each slice, close per SKILL.md §4 with the slice shipped; the user resumes with
`/finish-it <file>` for the next one.

## full (default)

Chain every slice that can go on. Scope-it is non-interactive, ship-it runs in
[run mode](../ship-it/RUNMODE.md), and commits follow the record's `commit`.
One close, when `run next` returns no slice.

## ultra

Everything in `full`. The up-front sweep also challenges each slice the
destination does not justify, per [SWEEP.md](../roadmap-it/SWEEP.md) §3. The
run itself pushes back no further: a slice the user kept is built.
