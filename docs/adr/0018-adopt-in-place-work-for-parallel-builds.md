---
status: Accepted
---

# Adopt in-place work for parallel builds

[ADR 0002](0002-no-commits-until-ship.md) said parallel mode only starts from a tree with no uncommitted code, and that once a phase is built in place the rest follow in place. That rule made one early in-place phase, or one stray edit, turn every later wave sequential. We reverse it. build-it picks its mode once per item: any wave wider than one means every phase builds in a worktree. If the user's tree is dirty, the tree is adopted as the first commit on the scratch integration branch, and landing applies only the delta built since that snapshot.

The snapshot is made through a temporary index, so the user's index, branch and stash are never touched. It holds tracked edits and untracked non-ignored files, and leaves out the planning dir and the issue store. The snapshot sha is kept as `do-it/<id>--snapshot`, so landing needs no state field. `land` runs `git apply --check` on `git diff <snapshot> do-it/<id>` first, and on any failure leaves the user's tree as it was and names the scratch branch. Nothing is committed, stashed or reset on the user's branch, so ADR 0002's no-commits rule holds.

## Options considered

- Keep sequential after in-place work (status quo): rejected. Waves in a plan then run one phase at a time whenever the tree is dirty, and the user cannot tell why parallel mode did not start.
- Reset-and-squash landing: rejected. Landing the scratch branch with `git merge --squash` and `git reset` restores the scratch tree over the user's, so it either overwrites uncommitted edits or needs a stash that can fail half way. A landing bug would lose the user's work.
- Delta landing: chosen. Only what the builders changed since the snapshot is applied, as a plain working-tree patch. The user's own edits in other files or hunks survive, and a collision fails the dry run and changes nothing.

## Consequences

- A dirty tree no longer blocks parallel builds. The cost is a script, `parallel.mjs snapshot` and `land`, with its own test, because the landing logic is the one place that can touch uncommitted work.
- A delta that adds a file the user also created, or edits a hunk the user changed, does not land. The user resolves it from the named scratch branch.
- Ignored files are not in the snapshot, so a build that needs one in a worktree must get it another way.
- `--complete` runs and tracks are unchanged. Run commits keep the tree clean there, and [ADR 0012](0012-coordinator-plus-tracks.md) holds phase fan-out at `tracks` 1. This ADR amends only the in-place rule in ADR 0002.

## Execution notes

- A review found `land` corrupting non-UTF-8 text through a utf8 decode of the patch; it now moves the patch as bytes (`gitBytes`), with a latin1 test.
- `land` pins its diff (`--no-ext-diff --no-textconv --no-color --src-prefix=a/ --dst-prefix=b/`) and its apply (`--whitespace=nowarn`), and `snapshot` clears the pathspec switches from its env, so the user's git config and environment cannot change what lands. `diff.external` and textconv drivers have no test.
- `git apply` still honours the user's EOL config, so an LF delta lands as CRLF under `core.autocrlf=true`; it matches what the user's own checkout writes.
- Open cleanups are on the to-do list (T373 to T378).
- The `snapshot` path has not run on a real dirty-tree build; the change was built with it on a clean tree and landed once with `land`.
