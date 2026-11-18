# do-it

## Terms

**Lane**:
The size of a piece of work, XS, S, M or L, and the steps that size runs.
_Not_: track, shard

**Track**:
One worktree worker in a complete run that builds one slice; the coordinator
audits it. A run has one track by default and up to five, held below the
ceiling by the ready frontier.
_Not_: lane, lane worker, lane mode

**Contract**:
The generated statement of which slice each track owns, the files and
interfaces each slice changes, and the merge order. It is produced from the
plans, never written by hand.
_Not_: lane file, lanes.md

**File hint**:
The repo-relative paths a roadmap slice expects to touch, written from
scouting in the slice's `Files` cell. It orders a run's batch; a plan's
`## Files` is the contract.
_Not_: file set, contract

**Check slot**:
The lock a run's checks take so heavy suites queue instead of competing for the
machine. Waiting for it does not spend a slice's cap.
_Not_: queue, lock

**Route**:
One way do-it's files reach a host: the symlink install, the Claude Code
plugin, or a `skills` CLI install. One host is installed on one route; two
copies of a skill load twice, at two versions.
_Not_: method, channel, installer

**Stale install**:
An install whose content no longer matches the checkout it came from: the
checkout is behind its remote, a link points at another checkout or names a
skill since renamed, or a copy differs from its source.
_Not_: outdated, out of date, old

**In-flight span**:
The stretch a slice's clock charges: opened by `run start`, closed at the last
command that showed the slice alive, less any time a check waited for the slot.
A park and a dead session fall outside it.
_Not_: wall clock, elapsed time, runtime
