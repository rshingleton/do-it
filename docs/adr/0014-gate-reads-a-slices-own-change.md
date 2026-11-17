---
status: accepted
---

# A slice's gate reads only its own change

`run verify` hashes the slice's change since its work item's `base_ref`, and
`run gate` refuses the ship when that hash moved. The hash covers the whole
tree, so two slices uncommitted at once moved each other's hash: in a consumer
repo (MAT-496) a slice that had verified, then waited while other slices
committed, read `STALE_VERIFY` at its gate for work it never touched. The gate
now leaves out the files another slice's plan names, on both the verify read
and the gate read, so a concurrent slice's work is never this slice's change.

Three rules keep the narrower read from hiding real work:

- A file this slice's own plan names is never left out, even when another plan
  names it too: a shared file that moves still reads `STALE_VERIFY`, because
  the record cannot say whose edit it was.
- A file no plan names is nobody's and stays in the hash, so an undeclared
  edit still reads `STALE_VERIFY`, even when another slice made it.
- Ownership comes from plans alone, so the exclusion is identical at verify and
  at gate: a file that another plan names and that does not exist yet changes
  nothing when it is excluded, and the recorded hash stays reproducible.

## Options considered

- Record every changed path at verify and compare those files later
  (rejected): `RUN.md` would carry the user's own dirty files and other
  slices' files, which the record deliberately keeps out; a run record is a
  claim about the slice, not about the tree.
- Compare only the files this slice's plan names (rejected): an edit the plan
  does not list would pass the gate unverified.
- Scope the hash to the slice's commits (rejected): a run with `--commit none`
  has none, and the problem is a set of uncommitted slices.
- Exclude every path another work item of the run changed (rejected): that set
  grows as the run goes on, so a hash recorded at verify cannot be re-read at
  the gate.

## Consequences

- A slice's plan `## Files` is also its ownership list. A plan that omits a
  file its slice edits leaves that file in every other slice's hash, so the
  other slices read `STALE_VERIFY`; the omission never makes its own slice
  more lenient.
- A slice with no plan has no files to exclude and keeps the whole-tree
  comparison, as do records written before this change.
- `prove-it --since` still reads the whole change since `base_ref`, so a
  concurrent slice's files are still in a reviewer's diff (T49). The two reads
  answer different questions: may this ship, and what does this change
  contain.
- The merged-tree check is unchanged: a merged tree that moves after its check
  is still `STALE_VERIFY`.

## Execution notes

Found while running `finish-it` on MAT-496, filed with the slice-cap bug in
`docs/issues/the-slice-cap-counts-the-time-a-slice-is-parked-waiting-for.md`.
Built with three tests in `tests/run-gate.test.mjs`: another slice's planned
file appears and is edited again (allowed), an undeclared file appears (stale),
and a file both plans name moves (stale).
