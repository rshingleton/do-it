# Final review and digest

For [SKILL.md](SKILL.md) §4, before the closing report. Counted facts only:
never an estimate of time or money saved.

## 1. Final review

When every slice is shipped or parked, call
[review-it](../review-it/SKILL.md) once over the whole run: base is the
roadmap's first `base_ref` (the commit before the run began), change is that
base to HEAD.

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

It lists slices shipped, parked and blocked with reasons, assumptions,
verification limits, findings filed, the `shortcut:` ledger (`no-trigger`
flagged), tokens, rollback commands per phase tag and four retro lines.

## 3. Assumption review

Show the digest, then ask one question: which assumptions to reject. A
rejection fires `work.mjs event <slice work id> reject-assumption <n>
"<replacement>"`; the slice's item returns to building and the run is not
shipped until it passes again. No rejection: the run is final.
