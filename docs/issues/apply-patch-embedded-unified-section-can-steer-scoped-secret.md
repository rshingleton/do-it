---
title: apply_patch embedded unified section can steer scoped secret rules
type: bug
status: open
source: user
---

## Context

`hooks/lib/checks.mjs` `applyPatchFiles`; source: host-decision-layer audit round 5, #30 (was T69).

## Problem

In an apply_patch, a unified `---`/`+++ <path>` pair names <path> for path rules only. The added lines after it are not scanned under <path> as `unifiedFiles` does, so an embedded unified section can steer a `files`-scoped rule or `exceptFilePattern`.

## Acceptance

- Added lines after an embedded `+++ <path>` are scanned under <path>
- A test shows an embedded section cannot exempt a line from a scoped rule

## Notes

Promoted from a to-do by the backlog audit, 2026-10-21.
