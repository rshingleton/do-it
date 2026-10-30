# Run commits

Only when a run record exists for the item (`work.mjs run show <slug>`, made
by `/do-it --complete`). No run record: none of this applies, and
[SKILL.md](SKILL.md) Rules hold (no commits). Why: ADR 0008.

## Mode

The record's `commit` value, set by `--commit phase|slice|none` and
defaulting to `phase`; `none` means build as usual and commit nothing.
`phase`: one commit per lane M phase. `slice`: one commit per lane S slice.
`DO_IT_COMMIT=never` and the flag: see [CONFIG.md](../track-it/CONFIG.md).

## After a phase passes

1. `work.mjs verify-phase` must have passed for this phase (lane S: the
   item). A failed, skipped or stale verify never commits.
2. Run the commit boundary check in [STANDARDS.md](STANDARDS.md) §4 and keep
   the mapped file list.
3. `work.mjs run commit <slug> <id> --phase <n> --paths a,b` (lane S: no
   `--phase`). It picks the branch, stages those paths only, commits and, for
   a phase, tags `do-it/<id>/phase-<n>`.
4. Closing docs (lane M after the last phase; lane S after its code commit): `work.mjs run commit <slug>
   <id> --docs --paths a,b`. Subject `<id>: closing docs`, no tag.
5. A check that could not run (no browser, no service): pass
   `--limits '["<what was not checked>"]'`. It goes in the run record and the
   commit body, never a trailer.

## What the script holds to

- Branch: the current one when unprotected (`main`, `master`,
  `DO_IT_PROTECTED_BRANCHES` are not), else `do-it/<roadmap-slug>`, made first.
- Message `<id>: phase <n> <title>` (lane S: `<id>: <title>`), then the single
  do-it line from the user's rules, and no other trailer.
- Never `git add -A` or `.`, a push, an amend or a force operation. Tags stay local.
- Staged files already in the index, or a path with no change: it stops and
  commits nothing.
