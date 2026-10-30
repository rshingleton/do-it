---
status: accepted
---

# No commits until ship

Builds leave every change uncommitted in the working tree, and `ship-it` commits only when the user says so in that run. The owner reviews changes by hand, and per-phase commits broke that workflow; this reverses the commit-per-phase design (rshingleton/skills ADR-0011).

Amended in part by ADR [0008](0008-opt-in-run-commits.md): a `--complete` run may commit verified phases when the user asked for it with the flag. Outside a run this decision holds unchanged.

## Consequences

- Phase progress and audit results cannot be tied to commits. The state block records them, and `audit.fingerprint` (a hash of the diff since `base_ref` plus untracked files, excluding the planning directory) tells `ship-it` whether code moved after the audit.
- Parallel phases still need commits to merge. They run on scratch branches in separate worktrees and land on the user's branch with `git merge --squash` followed by `git reset`, so the user's history never sees them. Parallel mode only starts from a tree with no uncommitted code; once a phase is built in place, the rest follow in place.
- Untracked files do not appear in `git diff`; audit and ship list them explicitly.
