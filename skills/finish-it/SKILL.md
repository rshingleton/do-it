---
name: finish-it
description: Carry an approved roadmap through scope, build, prove and ship slice by slice with no user turn, parking what cannot proceed.
disable-model-invocation: true
argument-hint: "<roadmap file> [lite|full|ultra] [--commit phase|slice|none] [--max-slices N] [--resume R<n>]"
---

# finish-it

The loop behind `/do-it <roadmap> --complete`. It chains lane S and M slices
until none can go on, then closes once. `work.mjs` is the work-item script in
[do-it STATE.md](../do-it/STATE.md); `run` is its run-record command.

## 1. Resolve and gate

- Input is a roadmap file. A request with no file: read
  [roadmap-it](../roadmap-it/SKILL.md) and chart one first. The slug is the
  file name without `.md`.
- `work.mjs run show <slug>`. No record: `work.mjs run new <slug>` with the
  flags given, then the decision sweep in
  [SWEEP.md](../roadmap-it/SWEEP.md) and its approval turn. That turn and the
  final one are the only two the run waits on.
- A record exists but the sweep never ran or was not approved: run it now.
- Level is the record's `level`; flags override config, as
  [CONFIG.md](../track-it/CONFIG.md) says. Per-level rules: [LEVELS.md](LEVELS.md).

## 2. Loop

1. `work.mjs run next <slug> <file>` gives `next`, `parked` and `waiting`. It
   skips parked and blocked slices and anything that waits on one, resumes a
   slice already in flight first, and otherwise takes the roadmap's order.
2. `next` is null: go to §4, and name its `stop` (a `MAX_SLICES` code) there
   when `run next` returned one.
3. Size the slice (S or M) per [do-it](../do-it/SKILL.md) §2 and
   [LANES.md](../do-it/LANES.md), then run the lane in this order, as do-it §3
   does. A step that finishes returns here; none closes the turn.
   1. [scope-it](../scope-it/SKILL.md) in its
      [non-interactive form](../scope-it/NONINTERACTIVE.md).
   2. Right after it, before build-it, start the slice's clock:
      `work.mjs run start <slug> <slice> --work <work id>`. `<slice>` is the
      roadmap id (`R<n>`), not the work id.
   3. [build-it](../build-it/SKILL.md), its checks run through
      `work.mjs run verify <slug> <slice> [--phase n] -- "<checks>"` in place
      of `verify-phase`. A flaky result parks the slice.
   4. Before each prove-it round, `work.mjs run audit <slug>`. `allow` false:
      never start the round; stop the run per [STOPS.md](STOPS.md).
   5. [prove-it](../prove-it/SKILL.md).
   6. Before ship-it, `work.mjs run gate <slug> <slice>`. `allow` false: ship
      nothing; park or stop per [STOPS.md](STOPS.md), which lists every stop
      reason.
   7. [ship-it](../ship-it/SKILL.md) in [run mode](../ship-it/RUNMODE.md).
4. `done` from ship-it: `work.mjs run slice <slug> <slice> shipped`, back to 1.
5. A step returns `blocked` or `failed` past what build-it and prove-it fix
   themselves: park it, never ask.
   `work.mjs run slice <slug> <slice> parked --needs user|decision --reason "<why>"`,
   with the stop code first in `--reason`.
   `needs` is `decision` for an unanswered question, else `user`. Its
   dependents wait by themselves; back to 1, so independent slices go on.
6. Background work (an agent, a long check): never poll or sleep. Wait for the
   host's completion notice.

## 3. Resume

`/finish-it <file> --resume [R<n>]`. The user has settled what parked the
slice: `work.mjs run slice <slug> <slice> ready` puts slice `<slice>` (`R<n>`)
back in the queue. With no `R<n>`, run it once for each id in `parked` from
`work.mjs run next <slug> <file>`. A shipped slice never moves. Then loop from
§2. The run re-enters at the first slice `run next` returns; finished work is
never redone.

## 4. Close

Run the final review and digest in [DIGEST.md](DIGEST.md) first. Only here
does the turn end. First line: how many slices shipped, and the `stop`
code and detail when `run next` or `run audit` returned one (`MAX_SLICES`,
`AUDIT_CAP`; raise the cap with `work.mjs run set <slug> max_slices|audit_cap <n>`
before resuming). Then each
parked slice with its `needs` and reason, and the slices still waiting on
them. Then `Skipped / Not checked / Risk`. Last line, `Next:` the command that
resumes: `/finish-it <file> --resume`, or nothing when every slice shipped.

## Rules

- No question in the loop. An unknown that fails it-core's assume-or-ask
  parks its slice.
- Never touch a parked slice or its dependents; never reorder past one.
- Never write the run record by hand; `work.mjs run` only.
