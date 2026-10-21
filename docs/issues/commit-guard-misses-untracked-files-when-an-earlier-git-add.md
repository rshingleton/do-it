---
title: Commit guard misses untracked files when an earlier git add cannot be resolved
type: bug
status: open
source: ship-it
---

## Context

Found by the commit-guard-gaps audit (round 2, Spec). Commit guard: the stage merge and `unsure` check in `beforeShell`, `hooks/lib/guard.mjs`.

## Problem

An earlier `git add` whose words cannot be resolved (`git add $(ls)`, `git add ~/../n.js`, `cd $X && git add n.js`) sends the commit to the root scan, which lists tracked changes only. A new untracked file holding a secret is missed and the commit is allowed.

## Acceptance

- A secret in an untracked file that an unresolvable earlier `git add` may stage blocks the commit
- A commit with no earlier index-changing command costs no more than before
- Hooks still fail open

## Notes

Smallest fix noted by the audit: read an unresolved stage as `all` (every tracked change and every untracked file). Mind the cost of listing untracked files in a large repo.
