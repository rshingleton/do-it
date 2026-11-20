# Parallel phases without committing on the user's branch

Phases run in their own worktrees on scratch branches, merge into a scratch
integration branch, and land on the user's branch as one uncommitted change.
The scratch commits never reach the user's branch.

## Preconditions

- Some wave is wider than one (mode rule in [SKILL.md](SKILL.md) §2).
- The host can run background subagents. Otherwise build sequentially.

## 1. Scratch integration branch

```bash
# Adopts the user's uncommitted work into do-it/<id> and do-it/<id>--snapshot through a
# temporary index: the user's index, branch and stash stay as they are. Prints
# {branch, snapshot, root}; root is absolute, so every later worktree command resolves it alike.
node <build-it dir>/scripts/parallel.mjs snapshot <id> --base <base_ref>
root=<the printed root>
git worktree add "$root/int" "do-it/<id>"
```

`parallel.mjs` below means `node <build-it dir>/scripts/parallel.mjs`, run from the user's checkout.

The planning dir and the issue store are left out of the snapshot. A clean tree
makes the snapshot the base commit itself.

The planning files stay only in the user's checkout. Implementers read them
there by absolute path, so the scratch branches carry code alone and the final
landing cannot collide with the uncommitted plan.

## 2. One implementer per frontier phase

```bash
git worktree add "$root/phase-N" -b "do-it/<id>--phase-N" "do-it/<id>"
```

Start one background `it-builder` agent per phase, briefed per
[DELEGATE.md](DELEGATE.md) §1 (report under 150 words) with its worktree
path. Add to the brief:

1. Commit everything in the worktree as `<id> phase-N (scratch)`.
2. Report `done | blocked | failed`, the commands that passed, new
   assumptions, surfaced defects, and anything blocking. Not the transcript.

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

In a complete run use `work.mjs run verify <slug> <slice> --phase <n> --in ...`.

On a failed check, `git reset --hard HEAD~1` in the scratch worktree only,
`work.mjs event <id> block "<why>" --phase <n>`, and keep going with phases
that do not depend on it. Otherwise recompute the frontier and start
implementers for newly ready phases.

## 4. Land and clean up

When no phase can start, from the user's checkout:

```bash
parallel.mjs land <id>              # applies the delta since the snapshot; commits and stages nothing
git worktree remove "$root/phase-N" # each phase worktree
git worktree remove "$root/int"
git branch -D "do-it/<id>" "do-it/<id>--snapshot" "do-it/<id>--phase-N"
```

`land` prints `{landed, files}`. On `{landed:false, reason, branch}` the user's
tree is unchanged (a file the user also created, or a hunk they also edited);
keep the branches and worktrees, name `branch` in the report and ask the user
how to proceed.

Leave a blocked phase's branch and worktree in place and name them in
the report.
