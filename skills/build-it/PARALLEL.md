# Parallel phases without committing on the user's branch

Phases run in their own worktrees on scratch branches, merge into a scratch
integration branch, and land on the user's branch as one uncommitted change.
The scratch commits never reach the user's branch.

## Preconditions

- More than one frontier phase.
- The user's tree has no uncommitted changes outside `docs/planning/`. If
  earlier phases were built in place, build the rest in place too.
- The host can run background subagents. Otherwise build sequentially.

## 1. Scratch integration branch

```bash
top=$(git rev-parse --show-toplevel)
# Absolute, so every later git -C and worktree command resolves it the same way.
root="$(dirname "$top")/$(basename "$top").do-it/<id>"
git worktree add "$root/int" -b "do-it/<id>" <base_ref>
```

The planning files stay only in the user's checkout. Implementers read them
there by absolute path, so the scratch branches carry code alone and the final
squash cannot collide with the uncommitted plan.

## 2. One implementer per frontier phase

```bash
git worktree add "$root/phase-N" -b "do-it/<id>--phase-N" "do-it/<id>"
```

Start one background subagent per phase, on the mid-tier model (`model:
sonnet` in Claude Code). Give it pointers, not pasted content: the worktree
path, and the absolute paths of the phase file and the plan README in the
user's checkout (read-only; only the main session writes the state block). Tell it to:

1. Build the phase per build-it §3, inside its worktree only.
2. Commit everything in the worktree as `<id> phase-N (scratch)`.
3. Report: `done | blocked | failed`, the commands that passed, new
   assumptions, and anything blocking. Not the transcript.

## 3. Merge one at a time

For each finished phase, in `$root/int`:

```bash
git merge --no-ff "do-it/<id>--phase-N" -m "<id> phase-N (scratch)"
```

On a conflict, call the Skill tool with "merge-it", passing the plan path so
it resolves by the plan's intent.

Then, from the user's checkout, run the project's checks in `int` through
the gate, which records the phase only when they exit 0:

```bash
work.mjs verify-phase <id> <n> --in "$root/int" -- "<checks>"
```

On a failed check, `git reset --hard HEAD~1` in the scratch worktree only,
`work.mjs event <id> block "<why>" --phase <n>`, and keep going with phases
that do not depend on it. Otherwise recompute the frontier and start
implementers for newly ready phases.

## 4. Land and clean up

When no phase can start, from the user's checkout:

```bash
git merge --squash "do-it/<id>"     # stages the change; commits nothing
git reset -q                        # unstage, so the user reviews a plain working tree
git worktree remove "$root/phase-N" # each phase worktree
git worktree remove "$root/int"
git branch -D "do-it/<id>" "do-it/<id>--phase-N"
```

Leave a blocked phase's branch and worktree in place and name them in
the report.
