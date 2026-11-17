# Tracks

Read with [SKILL.md](SKILL.md) §2 when the run's `tracks` is above 1. At 1 nothing
here applies: step 1 calls `work.mjs run next <slug> <file>` with no `--batch`, no
worktree is created, and each slice is built in place as before.

The record's `tracks` is `work.mjs run new <slug> --tracks N`: default 1, capped by
`DO_IT_TRACKS` (default 3), never above 5. One track holds one slice. `work.mjs run
tracks <slug> <roadmap file>` reads the record with the contract and prints what to
start: `width`, `tracks` (each with `id`, `plan`, `worktree`, `branch`, `base`,
`files` and `brief`), `waiting`, and `stop` when `max_slices` is spent.

A run that commits nothing (`--commit none`, or `DO_IT_COMMIT=never` with no flag)
holds one track: `run new` refuses `--tracks` above 1, and `run tracks` refuses a
record set to `none`, because a track would have no branch to merge. Width,
dispatch and merge below assume a run that writes a branch.

## Width

Width is `min(free ready slices, tracks, DO_IT_TRACKS)`. `tracks` is read once, at
`run new`, already under `DO_IT_TRACKS` and the ceiling of 5; nothing else narrows
it. A run at `tracks` 1 has width 0 and starts no track.

A track builds its slice's phases one at a time. Build-it's
[PARALLEL.md](../build-it/PARALLEL.md) fan-out needs the coordinator's own tree,
clean outside `docs/planning/`, and a track has a worktree of its own, so the
fan-out is held while the run holds tracks. It comes back for a run at `tracks` 1:
the slice is built in the coordinator, and its phases fan out as build-it says.

## Dispatch

1. `work.mjs run next <slug> <file> --batch <tracks>` names the free slices. Scope
   each id it returns, one at a time, with [scope-it](../scope-it/NONINTERACTIVE.md),
   so the plan states its `## Files` and `## Interfaces`; then `work.mjs run start
   <slug> <slice> --work <work id>` for each. Scope stays serial, and so does ship.
2. `work.mjs run tracks <slug> <file>` pairs them. For each entry in `tracks`: `git
   worktree add <worktree> -b <branch> <base>`, then start one `it-builder` agent on
   the mid-tier model with its `brief` and a report under 150 words. The brief names
   the worktree, the plan, the base ref and the report shape. Nothing else is in
   flight in the coordinator while a track builds.
3. A slice in `waiting` is not parked and is not a defect. It collided with a chosen
   one (`SHARED_FILE`, `UNPINNED_INTERFACE`), has no contract yet (`NO_CONTRACT`),
   or lost its place to the width (`WIDTH`): it goes again in the next round, after
   a merge frees a place. A slice in `refused` is different: it has no audit round
   left (Rounds below).

## Rounds

Every audit round goes in the coordinator's record, counted by the script. Before a
track starts a prove pass, record the round it is about to spend: `work.mjs run audit
<slug> <slice>`. `allow` false: the cap is spent, so that pass never starts; park the
slice (`SLICE_AUDIT_CAP`) or stop (`AUDIT_CAP`) per [STOPS.md](STOPS.md). Record each
later pass the track's report names the same way, so one record counts every round of
every track. A track never calls `run audit` or `run start`: the coordinator records
both, and `run show <slug>` holds the count the gate, the digest and the final review
read.

A slice with no round left is refused before it is dispatched: `run tracks` lists it in
`refused` with the limit that fired (`SLICE_AUDIT_CAP`, or `AUDIT_CAP` when the run total
is spent), and no worktree or builder starts for it. Refused is not `waiting`: no next
round frees a spent cap, only a raised cap, a resume or a ship.

## Merge, in contract order

Take the finished tracks in the merge order `run contract` prints, one at a time:
the coordinator's tree is the merged tree, so never two at once.

1. Record the track's own tree while it still exists, before the merge: `work.mjs run
   verify <slug> <slice> --in <worktree> -- "<checks>"`. A failure parks the slice and
   nothing merges.
2. `git merge --no-ff do-it/<slug>--<slice> -m "<slug> <slice> (track)"` in the
   coordinator, on the run's branch. A conflict: call the Skill tool with "merge-it",
   passing the slice's plan path, and go on from step 3 once it settles.
3. The suite once on the merged tree: `work.mjs run verify <slug> <slice> --merged .
   -- "<suite>"`. It records `merged_fingerprint`, which the gate needs for a slice
   verified in another tree. That is the fingerprint the slice ships with, taken
   after the merge and before step 5 marks it shipped, so an edit to the merged tree
   after it is `STALE_VERIFY`. A failure parks the slice; undo the merge before the
   next one, with `git reset --hard ORIG_HEAD` only while the coordinator holds
   nothing else of yours.
4. One reviewer, scoped to the merge and never a second full audit: start one
   `it-reviewer` agent on the mid-tier model with the slice's plan and the merge
   diff (`git diff <base>..HEAD -- <the slice's files>`), report under 150 words. A
   Must finding parks the slice with the finding; Should and Nice go to ship-it's
   digest. The track already ran prove-it on its own tree.
5. `work.mjs run gate <slug> <slice>`. `allow` true: ship-it in run mode
   ([RUNMODE.md](../ship-it/RUNMODE.md)), then `work.mjs run slice <slug> <slice>
   shipped`, then `git worktree remove <worktree>` and `git branch -D
   do-it/<slug>--<slice>`. `allow` false: park or stop per [STOPS.md](STOPS.md).

## A failed track

- `done`: the merge above.
- `failed`, or `blocked` past what the track can fix: park its slice with the
  report's reason, `work.mjs run slice <slug> <slice> parked --needs user --reason
  "<why>"` (`--needs decision` when the report asks a question), remove its worktree
  and branch, and go on with the tracks still running and the next round. The run
  never reruns a failed track; `--resume` starts it again.
- A conflict merge-it cannot settle: `git merge --abort`, park the slice with the
  conflicting files and what merge-it tried, and go on.

## The record

A track never writes the run record, its plan or the planning directory, and it keeps no
`RUN.md` of its own in its worktree. The coordinator's `<planning dir>/<slug>.run/RUN.md`,
read with `work.mjs run show <slug>`, is the run's only record: one `tracks` count, one
`audit_rounds` over every track, one list of gates, and one `verified_root` and
`merged_fingerprint` per slice. The coordinator records the start, the rounds, the verify,
the merge, the park and the ship, so one run still has one record, one branch and one
final review at §4.

A lane record from an older mode (a per-lane `RUN.md`, or a `lanes.md`) is history only:
its counters are not the run's, and `run show` never reads them.
