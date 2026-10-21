---
title: Commit guard textconv diff ignores the shared time budget
type: bug
status: open
source: ship-it
---

## Context

Found by the commit-guard-gaps audit (round 1 and 2, Architecture and Spec). `addedLines` in `skills/do-it/scripts/changeset.mjs`; the shared `budget` ({ deadline }) built in `beforeShell`.

## Problem

The second, textconv diff of a driven file takes no budget. Each driven file can cost up to `FILE_TIME` (2 s) on top of the 6 s `BINARY_BUDGET` spent on binaries, so many driven files can run the hook past the 15 s pre-tool timeout, which lets the commit through.

## Acceptance

- Many files with a textconv driver, staged together, finish well inside the 15 s hook timeout
- A file past the budget keeps path rules only, as for binaries

## Notes

Smallest fix: give the second `own()` call the same `deadline - Date.now()` timeout as the binary pass.
