---
title: Commit guard skips untracked files named on a git commit path line
type: bug
status: open
source: complete-run-lane
---

## Context

Surfaced building complete-run-lane phase 4. `hooks/lib/guard.mjs` scans the commit command; run commits stage by path with `git commit <path>`.

## Problem

A secret in a new untracked file named on a `git commit <path>` line is not scanned by the commit guard, so it passes there.

## Acceptance

- The guard scans untracked files named on a `git commit <path>` line
- A test commits a new file holding a secret and gets a block

## Notes

Related: `skills/do-it/scripts/commit.mjs` (run commits), ADR 0008.
