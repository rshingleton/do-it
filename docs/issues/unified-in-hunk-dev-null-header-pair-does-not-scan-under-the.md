---
title: Unified in-hunk dev-null header pair does not scan under the old path
type: bug
status: open
source: ship-it
---

## Context

Found by the guard-patch-paths audit (Spec reviewer; a Non-goal of that work). `unifiedFiles` in `hooks/lib/checks.mjs`; the apply_patch twin was fixed there.

## Problem

Inside a unified hunk, a `--- a/x.py` / `+++ /dev/null` header pair is content, but a lenient tool (a bare `@@`, a wrong count) may split files on it. `unifiedFiles` skips the pair when `named === '/dev/null'`, so the added lines after it land only under the current file and are not scanned under `x.py` or `''`. A `files`-scoped rule or an `exceptFilePattern` on `x.py` can be steered the same way the apply_patch case could.

## Acceptance

- Added lines after an in-hunk `--- <old>` / `+++ /dev/null` pair are also scanned under `<old>` and under the empty path, until the next pair or header
- A test shows the in-hunk pair cannot exempt a line from a scoped rule or an `exceptFilePattern`

## Notes

Same shape as the `applyPatchFiles` fix in guard-patch-paths; reuse its separate flag for the `''` scan.
