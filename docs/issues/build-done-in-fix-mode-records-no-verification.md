---
title: build-done in fix mode records no verification
type: bug
status: open
source: user
---

## Context

`skills/do-it/scripts/state.mjs` `build-done`; source: work-item-module audit round 2 (was T67).

## Problem

`build-done` in fix mode records no verification, so a fix round can reach audit with failing checks.

## Acceptance

- `build-done` in fix mode requires a passing verify-phase recorded since the fix started
- A test covers fix mode with no verify and with a failing verify

## Notes

Promoted from a to-do by the backlog audit, 2026-10-21.
