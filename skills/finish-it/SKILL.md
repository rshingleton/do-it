---
name: finish-it
description: Carry an approved roadmap through scope, build, prove and ship slice by slice with no user turn, parking what cannot proceed.
disable-model-invocation: true
argument-hint: "<roadmap file> [lite|full|ultra] [--commit phase|slice|none] [--max-slices N] [--resume R<n>] [--tracks N]"
---

# finish-it

The loop behind `/do-it <roadmap> --complete`. It chains lane S and M slices
until none can go on, then closes once. `work.mjs` is the work-item script in
[do-it STATE.md](../do-it/STATE.md); `run` is its run-record command.

## 1. Resolve and gate

- Input is a roadmap file; with no file, chart one first per
  [roadmap-it](../roadmap-it/SKILL.md). The slug is the file name without `.md`.
- Resolve it against the working tree and refuse a path outside the repo root,
  naming both: "the roadmap `<path>` is outside the repo root `<root>`". This
  comes before `run new` and before any slice is scoped. A roadmap in another
  repo starts there with a `cd`, never by moving the session: this skill never
  moves it.
- The run's first notice names its repo root: `<root>`, then the roadmap slug.
- `work.mjs run show <slug>`. No record: `work.mjs run new <slug> --roadmap
  <file>` with the flags given, then the decision sweep in
  [SWEEP.md](../roadmap-it/SWEEP.md) and its approval turn. That turn and the
  final one are the only two the run waits on.
- A record exists but the sweep never ran or was not approved: run it now.
- Level is the record's `level`, set by `work.mjs run new <slug> --level
  lite|full|ultra` (the `--complete` argument of `/do-it`); per-level rules and
  flag precedence: [LEVELS.md](LEVELS.md).
- `tracks` is the record's too: `work.mjs run new <slug> --tracks N` (default
  and cap in [TRACKS.md](TRACKS.md)); above 1, §2 runs by it.

## 2. Loop

The turn ends only at §4, when `run next` returns no `next`. A parked or
resumed slice, a status question, a long wait and a finished step are not
stops: go on to the next slice. At `tracks` >1: [TRACKS.md](TRACKS.md)
replaces step 1 with its dispatch and adds its merge before step (f); the rest
is as written here.

1. `work.mjs run next <slug> <file>` gives `next`, `parked`, `waiting` and
   `defects` (open decisions and the slices each holds). It
   skips parked and blocked slices and anything that waits on one, resumes a
   slice already in flight first, and otherwise takes the roadmap's order.
2. `next` is null: go to §4, naming its `stop` (`MAX_SLICES`) when there is one.
3. Size the slice (S or M) per [do-it](../do-it/SKILL.md) §2 and
   [LANES.md](../do-it/LANES.md), then run the lane in this order, as do-it §3
   does. A step that finishes returns here; none closes the turn.
   - (a) [scope-it](../scope-it/SKILL.md) in its [non-interactive form](../scope-it/NONINTERACTIVE.md).
   - (b) Right after it, before build-it, start the slice's clock:
     `work.mjs run start <slug> <slice> --work <work id>` (`<slice>` is the
     roadmap id, not the work id). A slice already in flight calls it again on
     resume: the old span closes and a new one opens, so unwatched time is not charged.
   - (c) [build-it](../build-it/SKILL.md), its checks through
     `work.mjs run verify <slug> <slice> [--phase n] [--paths a,b] -- "<checks>"`
     instead of `verify-phase`: one call per lane M phase with `--phase n`, none for
     lane S, `--paths` the slice's mapped files (needed for a lane M slice-mode
     commit). A flaky result parks the slice (FLAKY, as step 5).
   - (d) Before each prove-it round, `work.mjs run audit <slug> <slice>`. It counts
     every round started in `audit_rounds`, and spends one of the slice's `audit_cap`
     rounds only when every claim it raises repeats one an earlier round raised. File
     every claim in one `event <id> audit-fail "<claim>" "<claim>"` call: a bare
     number is an ordinal and spends nothing. `allow` false: never start the round.
     `SLICE_AUDIT_CAP` parks, `AUDIT_CAP` stops the run ([STOPS.md](STOPS.md)).
   - (e) [prove-it](../prove-it/SKILL.md). The reviewer's final report is the
     result: a first hand-back with an agent still running is not the verdict,
     and a later completion notice with no new report adds nothing.
   - (f) Before ship-it, `work.mjs run gate <slug> <slice>`; `allow` false: ship nothing, park or stop per [STOPS.md](STOPS.md).
   - (g) [ship-it](../ship-it/SKILL.md) in [run mode](../ship-it/RUNMODE.md).
4. `done` from ship-it: `work.mjs run slice <slug> <slice> shipped`, back to
   step 1.
5. A step returns `blocked` or `failed` past what build-it and prove-it fix
   themselves: park it, never ask, with the stop code first in `--reason`
   ([STOPS.md](STOPS.md) holds the call and `needs`). Its dependents wait by
   themselves; back to step 1, so independent slices go on.
6. Background work (an agent, a long check): never poll or sleep; just wait.

## 3. Resume

`/finish-it <file> --resume [R<n>]`. The user has settled what parked the
slice: `work.mjs run slice <slug> <slice> ready` puts slice `<slice>` (`R<n>`)
back in the queue; with no `R<n>`, once for each id in `parked` from
`work.mjs run next <slug> <file>`. A shipped slice never moves; loop from §2
at the first slice `run next` returns. Finished work is never redone.

## 4. Close

Run the final review and digest in [DIGEST.md](DIGEST.md) first; it holds the
closing message: the counts, the `stop` code, each parked slice, the open
decisions `run next` lists under `defects` with the slices each holds, then
`Skipped / Not checked / Risk` and `Next:`. The turn ends only here; a final
ship says what ship-it finalized ([FINALIZE.md](../ship-it/FINALIZE.md)).

## Rules

- No question in the loop: an unknown failing it-core's assume-or-ask parks it.
- Never touch a parked slice or its dependents; never reorder past one.
- Never write the run record by hand; `work.mjs run` only.
