---
title: Commit scan reads only the first git commit in a chain and misses prefixed forms
type: bug
status: open
source: user
---

## Context

Commit scan, `hooks/lib/guard.mjs` (`commandWords`, `parseGitCommit`); source: hook-trust-hardening audit round 2, finding 2 (was T65).

## Problem

The scan reads only the first `git commit` in a chain (`git commit a.js && git commit b.js`) and does not recognise `VAR=x git commit`, `env`/`sudo` prefixes, a commit after a newline, `then` or `{`, or `git -c key='a b' commit`. A relative `cd` after one that does not persist (`cd B && (cd C) && cd sub`) resolves from the wrong step; the hook scans each step of the cd chain, not every combination.

## Acceptance

- Every `git commit` in a command is found and scanned, for each form listed
- A secret staged for the second commit in a chain blocks it
- The cd case resolves from the right directory
- Hooks still fail open

## Notes

Promoted from a to-do by the backlog audit, 2026-10-21.
