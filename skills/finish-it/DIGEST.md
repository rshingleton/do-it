# Final review and digest

For [SKILL.md](SKILL.md) §4, before the closing report. Counted facts only:
never an estimate of time or money saved.

## 1. Final review

When every slice is shipped or parked, call
[review-it](../review-it/SKILL.md) once over the whole run. The change is what
`work.mjs run review-change <slug>` prints: base is the run record's `base`
(the commit HEAD was at `run new`), and `mode` is `range` (the change between
base and HEAD in the files the run's own commits touch: the commits the
branch's upstream already has are left out, so a merge or a rebase never puts
the upstream's own content in it) or `worktree` (the working tree against
base: commit mode `none`, or closing docs not yet committed). A null `base`
(no git): review the working tree.

- Fix only Must findings, then review again. Before each round,
  `work.mjs run audit <slug> --final`; at the record's `final_audit_cap` it is
  refused, and a Must left then goes in the digest as open.
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
how each retry ended, the audit rounds the run's one record holds (the run
total, every track's rounds included, and each slice's share), assumptions,
verification limits, findings filed, the
`shortcut:` ledger (`no-trigger` flagged), tokens, rollback commands per phase
tag of this run's work items only, and four retro lines. It does not list the
`defects` `run next` returns (open decisions and the slices they hold):
finish-it's close reports those. It prints only
well-formed phase tags and one-line text: a newline in a reason, limit,
assumption, finding or retro line is folded into its line.

## 3. Assumption review

Show the digest, then ask one question: which assumptions to reject. Each
line reads `<work id> #<n>: text`; a rejection runs `work.mjs run
reject-assumption <slug> <work id>#<n> "<replacement>"`. The record is the
store, so it works after the item closed. It leaves the entry out of
Assumptions and lists it under Assumptions rejected, numbers unchanged. An item
still auditing or shipping returns to building and the run is not shipped until
it passes again. A closed item has no plan to reopen: the user's follow-up is a
`fix:` or `log-it` entry. A plan still `building` is not reopened either: its
`fix:` list gets the change. A line with no id came from the sweep: note it for the
user. No rejection: the run is final.

## The closing report

For [SKILL.md](SKILL.md) §4, after the digest. First line: how many slices
shipped, and the `stop` code and detail when `run next` or `run audit` returned
one (`MAX_SLICES`, `AUDIT_CAP`, which names the limit that fired; raise it with
`work.mjs run set <slug> max_slices|audit_cap|final_audit_cap|audit_total_cap <n>`
before resuming). Then each parked slice with its `needs` and reason, and the
slices still waiting on them. Then each open decision `run next` lists under
`defects`, with the slices it holds: a slice also parked or waiting is named
once, not twice, and no other line reports these. Then `Skipped / Not checked /
Risk`. Last line, `Next:` the command that resumes: `/finish-it <file>
--resume`, or nothing when every slice shipped.
