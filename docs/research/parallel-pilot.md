# Two-track pilot: does overlapping two slices pay?

Answer: measure the parallelizable share on two normal slices first, then run a
build-overlap pilot only if that share can clear the 25% bar. Today's tools can
overlap builds across slices but not prove, so the build share alone decides
whether the full mode is worth building. Confidence: this is a design, not a
result. Checked: 2026-11-15.

## The question

Does a coordinator with two tracks cut end-to-end wall clock by at least 25%
without raising tokens per slice by more than 15%, confirmed Must findings,
merge rework, or coordinator time enough to cancel the saving?

This tests the T246 hypothesis before the scheduler exists. It does not test
agent teams, mailboxes or a hive mind.

## The bar

- Wall clock: 25% or more, end to end, from the first scope to the last ship.
- Tokens: no more than 15% higher per slice, coordinator included.
- Accuracy: no confirmed Must that the serial arm would have caught; no merge
  conflict beyond the contract; no rework over 30 minutes.
- Human cost: coordinator time no more than 20% of the wall clock saved.
- Plan window: no more than 1.5 times the serial arm's consumption.

## Phase 0: is there enough parallel work?

A roadmap is not required. The unit is a work item: a roadmap slice or any S/M
item. Before any pilot, measure the shares. Run two normal work items, each in
its own session, and log a timestamp at the start and end of scope, build, prove
and ship. From those:

```text
b = build / total                    (build share)
p = (build + prove) / total          (parallelizable share)
build-only speedup with 2 tracks   = 1 / (1 - b/2)
build+prove speedup with 2 tracks  = 1 / ((1 - p) + p/2)
```

Decision:

- Build-only bound under 1.25x (saving under 20%): stop. Tracks cannot clear
  25% on build alone, and the prove half needs code that does not exist yet.
- Build-only bound 1.25x to 1.6x: run Phase 1A only. Prove overlap is unlikely
  to pay for the extra machinery.
- Build-only bound 1.6x or better: run Phase 1A, then Phase 1B if 1A is close.

Also record tokens per item and the coordinator's share. If the coordinator is
already 30% of an item's wall clock, two tracks will not fix that.

## Phase 1A: build overlap, runnable today

Preconditions:

- Two independent work items that share no file and no interface: ready
  roadmap slices, two issues, or two to-dos. Write `files:` and `interfaces:`
  by hand if scope-it does not emit them yet.
- One base commit for both, and no unrelated dirty files.
- A working tree you can throw away: a scratch branch, no push.
- `run verify --in` fixed, or the merged tree verified by hand and the bug
  recorded. Without this the gate can pass on an unverified merged tree.

Procedure:

1. The coordinator scopes both slices serially, approves both plans, and starts
   both items at the same `base_ref`. Record the contract before any build.
2. Create an integration worktree and two track worktrees from that base
   ([PARALLEL.md](../../skills/build-it/PARALLEL.md) §1 and §2). Give each track
   one builder brief per [DELEGATE.md](../../skills/build-it/DELEGATE.md), with
   its worktree path. Builders commit scratch in their own worktree.
3. Merge track 1 into the integration worktree, run its checks there, land it
   on the user's checkout as a squash plus reset, then prove and ship it. Record
   every timestamp.
4. Merge track 2 onto the updated checkout, run its checks, prove and ship it.
5. Log the coordinator's own minutes and every wait.

Both arms keep prove and ship serial. This isolates build overlap, which is the
only half today's tools can run without a track mode. Run one check at a time
in both arms, and log the queue time instead of pretending it is free.

## Phase 1B: prove overlap, needs code

Only after 1A. Run both tracks' reviewers concurrently against their own branch
diffs, then merge and ship serially. This needs `prove-it` to read a change from
a worktree, or the track mode itself. Do not fake it by copying diffs into the
coordinator; that measures a different, more expensive workflow.

## Measurements

| Metric | How |
|--------|-----|
| Wall clock | ISO timestamps per step, one log line per event; total from first scope start to last ship end |
| Tokens | `usage-it` rows per session, plus the host's `/usage` snapshot before and after each arm; coordinator tokens counted separately |
| Accuracy | Confirmed Musts and rejected findings; merged-tree checks; planted defects if a fixture is used |
| Coordination | Merge conflicts (count, minutes), rework, replans, fix rounds, check queue time |
| Human cost | Coordinator minutes, from the same log |
| Plan window | `/usage` bars and the usage-it snapshot before and after each arm |

Note what is excluded: fixture setup, the pilot harness, and a blind review used
only to score accuracy.

## Controls

- Matched slices: same lane, similar size, independent files. Randomize which
  pair gets the serial arm; swap arms on the same pair only if the result is
  within 10 points of the bar.
- Same model tiers, same scopes, same check command, same coordinator, same
  machine, no other heavy work.
- Fresh context per slice in both arms. Do not let the second arm reuse the
  first arm's session.
- Same starting commit. The second arm starts from the same base, not from the
  first arm's result.
- Record cache state: the first arm may pay cache writes that the second reads.

Confounders to name in the report: learning, check contention, cache warmth,
model nondeterminism, and human pacing. The serial arm is not a clean control
for a feature that changes the workflow; treat the result as a signal.

## Sample and analysis

- Phase 0: two slices; add a third if their totals differ by more than 30%.
- Phase 1A: two matched pairs, one run each, two slices per arm. If the result
  sits within 10 points of 25%, swap the arms on the same pairs and run again.
- Report medians and ranges, not means. The terse-voice A/B is the precedent
  ([terse-voice-ab.md](terse-voice-ab.md)).
- Compare the observed speedup with the Phase 0 bound. A result far below the
  bound means coordination or checks are eating the gain, which is the finding.

## Kill criteria, fixed before the run

- Phase 0 build-only bound under 1.25x: stop.
- Phase 1A saving under 15%: stop.
- Saving 15% to 25%: proceed only if the build+prove bound is 25% or better and
  the prove half can be added cheaply.
- Saving 25% or more with no accuracy or token regression: build the mode.
- Any confirmed Must that serial catches, any conflict beyond the contract, any
  rework over 30 minutes, tokens over 15% higher, coordinator time over 20% of
  the saving, or plan window over 1.5x: stop, fix the contract, rerun once. A
  second failure is a no.

## Cost

- Phase 0: two slice-runs, no extra tokens beyond the work itself.
- Phase 1A: four slice-runs (two serial, two tracks). A 19-slice roadmap does
  not make this cheaper; the pilot is the price of not building the wrong mode.
- Phase 1B: two more review sets per run, with four reviewers in flight.

Kill at Phase 0 whenever possible. Do not run the full matrix to be thorough.

## What the result decides

- Build overlap of 25% or more: build T246 with build-only tracks, and add
  prove overlap later behind a flag.
- 15% to 25% with a strong build+prove bound: build tracks but keep prove
  serial at first.
- Under 15%: drop tracks. Spend the effort on prove and check speed instead:
  fewer reviewer seats, diff files, a cached code map, a check slot, and the
  milestone Exit check.

## Limits

- One repo and one machine say nothing about general speedup.
- The coordinator is a person, so human pacing can dominate either arm.
- Accuracy with two slices is weak. A fixture with planted defects is better
  for the accuracy axis than a real roadmap.
- Today's tools can overlap build only; Phase 1B is a design until the track
  mode or a worktree-safe `prove-it` exists.

## Results: the 2026-11-15 game-skillet run

This was Phase 1A and 1B together, on a real roadmap rather than a fixture, so it
is the first evidence rather than a design. Three lanes ran one slice each; a
later pair ran two tracks with their audits in parallel.

| Slice | Lanes | Build | Prove | Total | b | p | build-only | build+prove |
|-------|-------|-------|-------|-------|---|---|-----------|-------------|
| R13, R15, R16 | 3 | n/a | in-lane | 23m window, ~48m summed | | | | |
| R18 | 2 | 2.1m | 8.9m | 14.0m | 0.15 | 0.79 | 1.08x | 1.65x |
| R19 | 2 | 4.5m | 6.5m | 14.0m | 0.32 | 0.79 | 1.19x | 1.65x |
| R1 (do-it, serial) | 1 | 3.7m | 16.2m | 27.1m | 0.14 | 0.74 | 1.07x | 1.58x |

What it settles:

- **Prove overlap is the lever.** Every reading puts `p` between 0.74 and 0.79 and
  `b` between 0.14 and 0.32. Tracks that only build cannot exceed about 1.2x; only
  running the audits side by side reached 2x. A track must build and prove.
- **Scope does not overlap.** Both plans came from one coordinator pass, so scope
  was 0.0m per track. Do not count scope in the parallel share.
- **Accuracy held, after real findings.** The pair's audits found six defects,
  three of them in tests that would have passed a broken tree: a coverage test
  that matched an empty noun, then one that let a flow lean on another row, and a
  doc claiming a size assertion the test did not make. Parallelism did not cause
  them, but it did put them behind two independent audiences.
- **The contract held where it was specific.** No two lanes touched a code file;
  the only conflicts were `docs/TODO.md` and the roadmap row.

What it cost, and the prerequisites it adds to T246:

- Four `RUN.md` records for one roadmap; audit rounds split 15/5/5/3.
- A per-lane `base_ref` leaves each slice's fingerprint nearly empty after its
  last scratch commit, so gate and ship compare little. The merged diff is the
  real evidence, and the record should say so.
- Each lane item needs its own `verify-phase` before `build-done`; `run verify`
  alone does not record it.
- Lanes must fast-forward to the coordinator branch before starting, or they work
  on a stale tree.

The bar was 25% wall clock with no accuracy regression. Two tracks cleared it on
one roadmap, which is a signal, not proof: one repo, one machine, two slices.

## Log format

```text
2026-11-15T09:00:00Z | tracks | R3 | build | start | worktree ../repo.do-it/R3
2026-11-15T09:18:41Z | tracks | R3 | build | end | scratch commit 1a2b3c4
```

Record it with the pilot script, which stamps the time, appends the line and
computes the shares:

```bash
node scripts/pilot.mjs mark serial R3 scope start
node scripts/pilot.mjs mark serial R3 scope end
node scripts/pilot.mjs mark tracks R4 build start "worktree ../repo.do-it/R4"
node scripts/pilot.mjs report
```

The default log is `docs/research/phase0.log`; `--log <file>` points elsewhere
and `report --json` prints the summaries for a later analysis. A standalone item
uses its work id in the slice column. An unclosed start is reported and counts
no duration, so mark both ends of every step.

Per arm, report:

| Arm | Wall clock | Tokens | Musts | Conflicts | Rework min | Coordinator min |
|-----|------------|--------|-------|-----------|------------|-----------------|
| serial | | | | | | |
| tracks | | | | | | |
