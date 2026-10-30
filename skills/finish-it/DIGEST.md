# Final review and digest

For [SKILL.md](SKILL.md) §4, before the closing report. Counted facts only:
never an estimate of time or money saved.

## 1. Final review

When every slice is shipped or parked, call
[review-it](../review-it/SKILL.md) once over the whole run. The change is what
`work.mjs run review-change <slug>` prints: base is the run record's `base`
(the commit HEAD was at `run new`), and `mode` is `range` (`<base>...HEAD`,
committed work) or `worktree` (the working tree against base: commit mode
`none`, or closing docs not yet committed). A null `base` (no git): review the
working tree.

- Fix only Must findings, then review again. At most the record's `audit_cap`
  rounds across the run; a Must left at the cap goes in the digest as open.
- Should and Nice findings and surfaced defects: `log-it`, never fixed. Keep
  each filed ref for the digest's findings list.

## 2. Digest

1. Token input: `node skills/usage-it/scripts/usage.mjs --json --from <run
   started> --to <now>`; keep input and output totals.
2. `work.mjs run digest <slug> --usage '{"input":N,"output":N}' --findings
   '["<ref>", ...]' --retro '["worked","failed","change","next"]'`.
   Retro lines are one sentence each, from what the run recorded.
3. It prints the digest and saves `<planning dir>/<slug>.run/DIGEST.md`,
   uncommitted. Never commit it.

It lists slices shipped, parked and blocked with reasons, retried slices and
how each retry ended, assumptions, verification limits, findings filed, the
`shortcut:` ledger (`no-trigger` flagged), tokens, rollback commands per phase
tag of this run's work items only, and four retro lines.

## 3. Assumption review

Show the digest, then ask one question: which assumptions to reject. Each
line reads `<work id> #<n>: text`; a rejection runs `work.mjs run
reject-assumption <slug> <work id>#<n> "<replacement>"`. The record is the
store, so it works after the item closed. It leaves the entry out of
Assumptions and lists it under Assumptions rejected, numbers unchanged. An item
still auditing or shipping returns to building and the run is not shipped until
it passes again. A closed item has no plan to reopen: the user's follow-up is a
`fix:` or `log-it` entry. A line with no id came from the sweep: note it for the
user. No rejection: the run is final.
