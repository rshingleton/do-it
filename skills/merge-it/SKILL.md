---
name: merge-it
description: Resolve an in-progress git merge, rebase or cherry-pick conflict by the intent of both sides, then prove the result with the project's checks. Use when git reports conflicts or the user asks to finish a merge or rebase.
---

# merge-it

A conflict is two intents meeting. The job is to keep both, not to pick a
side.

## 1. Where things stand

- Which operation is in progress: `.git/MERGE_HEAD` (merge), `rebase-merge/`
  or `rebase-apply/` (rebase), `CHERRY_PICK_HEAD` (cherry-pick). Run
  `git status` for the conflicted paths.
- The two sides: for each conflicted file, `git log --oneline` on both
  branches since their merge base (`git merge-base`), and the diff each side
  made to that file.

## 2. Learn each side's intent

Read, in this order, until each hunk's purpose is clear:

1. The commit messages that touched the hunk on each side.
2. The do-it plan or phase file when one is named (or the state block under
   `docs/planning/` that matches the branch): its Goal, Scope and Seams.
3. The issue or PR the commits reference, through the `track-it` skill.
4. The code around the hunk: callers, tests, the module's other changes.

## 3. Resolve hunk by hunk

- Keep both intents when they can coexist: both new branches in a switch,
  both new fields, the rename from one side applied to the new code from the
  other.
- When they cannot, keep the one the merge exists for (the plan's goal, the
  branch being integrated) and record the trade-off in one line for the
  closing message.
- Add no new behaviour. A resolution that needs a design decision is a stop:
  show both sides and ask.
- Generated files (lockfiles, snapshots, built assets): regenerate them with
  the project's tool rather than hand-merging.
- Leave no conflict markers: `git diff --check` and a search for `<<<<<<<`
  across the resolved files.

## 4. Prove it

Run the project's checks (type-check, tests, lint, format). Fix what the
merge broke; a failure that predates the merge is reported, not fixed.

## 5. Finish

- **A do-it scratch worktree** (`do-it/*` branch from `build-it`): stage the
  resolved files and complete the operation (`git commit --no-edit`, or
  `git rebase --continue` until done).
- **The user's own branch:** stage the resolved files and show the result;
  complete the operation only when the user says so, since that records a
  commit (`it-core` git rule).

## Rules

- Never `git push`.
- Never `--abort`, `reset`, `checkout --theirs/--ours` on whole files, or
  discard anyone's work without asking.
- Report each conflicted file in one line: what each side wanted, what the
  resolution kept.
