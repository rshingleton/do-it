---
status: Accepted
---

# One history, and shipping removes plan and run files

Plan files, audit reports and run records were left in the tree, or swept into a commit by a review commit, so a shipped plan lingered as an uncommitted deletion and a run folder piled up after every complete run. Shipping now writes what a later reader needs, one short entry per work item or run, into `docs/reference/history.md`, which also holds the removed roadmaps, and then removes the plan or run folder. An ADR or the changelog takes what belongs there. Plan files a commit already tracked are `git rm`ed in a commit of their own. `run remove` deletes a run's record only when the roadmap is finished, so a resumable run keeps it. The contract is [HISTORY.md](../../skills/ship-it/HISTORY.md) for work items and [DIGEST.md](../../skills/finish-it/DIGEST.md) section 4 for runs.

## Options considered

- Gitignore `docs/planning/`: rejected. It changes every repo that installs do-it, scripts and tests assume the plan is visible, and a plan forced in with `git add -f` would still need removing.
- Commit the plans as the record: rejected. They are scratch, they pile up (this repo held five finished plan files and a pilot log), and git already holds the history.
- Keep the saved run digest: rejected. The digest is shown in the closing report, so the saved copy was a second one that went stale.
- One history file per kind: rejected. One place to look beats two.

## Consequences

- A run that stops early keeps its folder until it is finished; there is no abandon path yet.
- Deleting a plan with no history entry is guarded by the order in the ship text, not by code.
