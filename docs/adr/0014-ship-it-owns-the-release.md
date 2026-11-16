---
status: proposed
---

# ship-it owns the release, and pushes only when asked

The lifecycle stops at a local commit: no skill owns the push, the PR body,
the protected-branch check, the changelog version heading, or carrying out the
rollback note ship-it prints (T62). ship-it owns them, because it is the skill
whose job ends in a shipped change and it already owns the closing docs, the
changelog offer and that rollback note. The steps live in a new
`RELEASE.md` beside `DOCS.md` and `FINALIZE.md`, so `SKILL.md` stays under its
line budget; ship-it points at the file at the close.

Push and PR are opt-in per run, the same rule as run commits
([0008](0008-opt-in-run-commits.md)). `finish-it` calls the release steps at
the end of a run and never pushes on its own: an unattended loop cannot ask
for an irreversible step, and `IRREVERSIBLE` parks it for the owner instead.

## Options considered

A new `release-it` skill was rejected: six steps do not need a sixth lifecycle
name, and every call site, routing entry and eval would move for it.
`finish-it` owning the work was rejected because that loop is defined by never
asking, and a push needs the owner's call. `prove-it` owning it was rejected:
review is not shipping.
