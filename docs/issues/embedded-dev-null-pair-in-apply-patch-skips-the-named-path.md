---
title: Embedded unified `+++ /dev/null` pair in an apply_patch does not scan under the named path
type: bug
status: open
source: prove-it
---

## Context

Found by the patch-scan-scoping audit (Spec reviewer). `applyPatchFiles` in `hooks/lib/checks.mjs`; a Non-goal of that work, which fixed the `+++ <path>` and delete forms.

## Problem

In an apply_patch, a `--- a/x.py` / `+++ /dev/null` pair is ignored (`named !== '/dev/null'`), so added lines after it land only under the current block's file. A lenient tool that applies the embedded section as a delete of `x.py` lets a `files`-scoped rule or an `exceptFilePattern` on `x.py` be steered: `*** Update File: a.txt`, `--- a/x.py`, `+++ /dev/null`, `+EVIL` is scanned as `a.txt` only.

## Acceptance

- Added lines after an embedded `--- <old>` / `+++ /dev/null` pair are also scanned under `<old>` and under the empty path
- A test shows the embedded pair cannot exempt a line from a scoped rule

## Notes

Same shape as `unifiedFiles`' handling of `+++ /dev/null`; reuse the `also` and `deleted` state added by patch-scan-scoping.
