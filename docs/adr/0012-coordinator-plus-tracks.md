---
status: Accepted
---

# Coordinator plus tracks

A `--complete` run can hand one independent slice each to up to five worktree tracks. A track builds and audits its slice on its own `do-it/<slug>--<slice>` branch; the coordinator owns scope, the audit-round count, the run record, the gate, the merges, the ship and every closing doc, so one run still has one record, one branch and one final review. `--tracks` defaults to 1 and `DO_IT_TRACKS` defaults to 3, so a run that does not ask behaves exactly as before. The contract is [TRACKS.md](../../skills/finish-it/TRACKS.md), and the key is in [CONFIG.md](../../skills/track-it/CONFIG.md).

The design follows a measured bar, not the assumption that more agents are faster. A track that only builds bought 1.08x to 1.19x, and one that builds and proves bought 1.65x on the same slices. Two real tracks landed 2.0x wall clock on game-skillet R18 and R19. Prove overlap is the lever, so the mode is shaped to overlap audit rounds, and a slice with no room to audit beside another is not paired.

Width is `min(ready independent slices, tracks, DO_IT_TRACKS)`, where `tracks` is the record's own count and `DO_IT_TRACKS` defaults to 3 (the measured value) and never goes above a hard ceiling of 5. Two slices are independent when their plans' files and interfaces do not collide; a collision waits for the next round and is never parked for it. A run at `tracks` 1 builds in place and starts no track.

Scope and ship stay serial. Both plans in the pilot came from one coordinator pass in about 0 minutes per track, and ship writes the docs, so parallel scope or parallel ship would batch work without saving wall clock. One merge review, scoped to the merge, replaces a second full audit per track.

## Options considered

- A track that only builds: rejected. The pilot measured that shape at about 1.1x, and an unaudited slice would still need its audit somewhere serial.
- Agent teams, mailboxes or peer messages: rejected. Tracks report to the coordinator only, so there is one reader of the run record and no protocol to keep in step.
- Pairing slices that share a file or an unpinned interface: rejected. Two tracks would edit one buffer, and the merge would settle behaviour nobody chose.
- Parallel scope and parallel ship: rejected, as above; both are short and both write what one run must own.
- A `running` slice status in the record: rejected for now. The coordinator holds the claims in memory, so a restart re-dispatches rather than reading a status it trusts.

## Consequences

- A run with more than one track needs a commit mode that writes a branch: `run new` refuses `--tracks` above 1 with `--commit none` (or `DO_IT_COMMIT=never` and no flag), because a track would have no branch to merge. Run commits themselves are [ADR 0008](0008-opt-in-run-commits.md)'s decision and are unchanged; nothing is pushed, amended or forced.
- The coordinator records every start, round, verify, merge and ship, so the audit counts, the gate and the final review read one record.
- The suite runs once on the merged tree, and that fingerprint is the slice's own, so an edit after the merge is `STALE_VERIFY`.
- Build-it's phase fan-out is held while tracks hold the run, because a track has a worktree of its own; it returns at `tracks` 1.
- A failed track parks its slice and the run goes on with the others; a parked slice's dependents wait.

## Execution notes

Built as tracks-mode in six phases; the audit passed on round 1 with no Must. The mode is proved by tests and fixtures: no `--complete --tracks` run has yet been executed end to end on a real roadmap, which is the first thing to do with it.

Non-blocking findings, filed in `docs/TODO.md` (T251 to T261):

- The contract plan path is relativised twice, so a `run tracks` brief is wrong below the repo root (T251).
- Width's machine-cap term has no producer and `tracks` is already capped at 5, so the width is in practice `min(ready, tracks)` (T252); `run tracks` also names only the ceiling's worth of free slices (T253).
- `run tracks` swallows every plan-read error and falls back to HEAD where `run contract` fails loudly (T254), and every brief calls its plan a lane M plan (T256).
- A track's own `prove-it` takes no check slot, so two tracks proving at once do not queue (T255); `--merged` takes the slot but records no queue time (T260).
- The scope-it Contract check hard-codes the repo layout (T257) and its row applies to every lane S plan (T258), not only a slice that will run in a track.
- `run verify --merged` lacks the non-git guard its sibling has (T259), and `run tracks` drops `nextSlice`'s stop, so a run at `max_slices` reads like an empty frontier (T261).

One defect was surfaced and filed as `docs/issues/countaudit-parks-a-slice-whose-last-allowed-audit-round-pass.md`: `countAudit` parks a slice at its cap even when the last allowed round passed and the gate would ship it.

The build also settled one detail the mode text had left open: the merged-tree suite is `run verify --merged`, not `--in`, because `--in` records the track's tree and drops the merged fingerprint the gate needs.
