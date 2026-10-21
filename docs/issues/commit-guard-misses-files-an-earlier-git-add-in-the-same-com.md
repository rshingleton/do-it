---
title: Commit guard misses files an earlier git add in the same command stages
type: bug
status: open
source: user
---

## Context

Found by the plan for the commit-scan-every-commit plan (PR #9; builder check, 2026-10-21). Commit guard: `beforeShell` and `listChanges` in `hooks/lib/guard.mjs`; `addedLines` in `skills/do-it/scripts/changeset.mjs`. The gap predates that plan and is not in its acceptance; per the repo's rule that guard changes match main's behaviour and cost, it is filed separately.

## Problem

The guard runs before the command, so a `git add` earlier in the same command is not yet staged when it scans. `git commit -m a && git add b.js && git commit -m b` misses `b.js`. A new untracked file added and committed in one command (`git add new.js && git commit -m x`) is missed even with a single commit, because the scan reads tracked changes only.

## Acceptance

- A secret in a file that an earlier `git add`, `git stage`, `git rm` or `git mv` in the same command stages blocks the later commit
- A secret in a new untracked file named by that `git add` blocks the commit
- A commit with no earlier index-changing command costs no more than before
- Hooks still fail open

## Notes

`addedLines(cwd, { untracked: true })` exists (`changeset.mjs`) but `listChanges` never passes it; check it against `against: 'staged'` and `paths`. Do after the commit-scan issue, which gives each commit its own parse.
