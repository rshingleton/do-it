---
title: Check verify commands are real and can fail
type: feature
status: open
source: user
---

## Context

Source: survey of open-gsd/gsd-core agent prompts (plan-checker, failing-direction check 8f and path resolvability), 2026-11-15. Touches `scope-it/CHECKS.md`, `contract.mjs`.

## Problem

The Verifiable rule only asks that a check be observable. A verify command can pass vacuously, or name an npm script or path that does not exist.

## Acceptance

- Each runnable verify command states what output counts as failure
- The command's target is probed: the npm script is in package.json, the path exists
- Failures reported before plan approval

## Notes

Small to medium. `contract.mjs` already runs the Contract check as a command.
