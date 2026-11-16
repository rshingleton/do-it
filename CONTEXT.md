# do-it

## Terms

**Lane**:
The size of a piece of work, XS, S, M or L, and the steps that size runs.
_Not_: track, shard

**Track**:
One worktree worker in a complete run that builds and proves one slice. A run
has one track by default and up to five, held below the ceiling by the ready
frontier.
_Not_: lane, lane worker, lane mode

**Contract**:
The generated statement of which slice each track owns, the files and
interfaces each slice changes, and the merge order. It is produced from the
plans, never written by hand.
_Not_: lane file, lanes.md

**Check slot**:
The lock a run's checks take so heavy suites queue instead of competing for the
machine. Waiting for it does not spend a slice's cap.
_Not_: queue, lock
