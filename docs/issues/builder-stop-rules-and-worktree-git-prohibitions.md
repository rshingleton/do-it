---
title: Builder stop rules and worktree git prohibitions
type: feature
status: open
source: user
---

## Context

Source: survey of open-gsd/gsd-core agent prompts (gsd-executor), 2026-11-15. Touches `agents/it-builder.md`, `skills/build-it/PARALLEL.md`.

## Problem

The builder has no stop rules for auth errors or stalls, and `PARALLEL.md` has no git prohibition list; `it-builder` only forbids stash in place.

## Acceptance

- Auth errors (401, 403, not logged in, set ENV) are gates: stop and report exact steps (map to needs-confirm)
- After 5 or more read-only calls with no write, state why, then write or report blocked
- In worktrees: no `git clean`, no `git stash` (the list is shared across worktrees), no blanket restore; HEAD attached to a protected branch halts without rewinding the ref

## Notes

Small.
