---
title: "Lines added after a delete are exempted by the deleted path's exceptFilePattern"
type: bug
status: open
source: user
---

## Context

`hooks/lib/checks.mjs`; source: host-decision-layer audit round 5, #31 (was T70).

## Problem

Added lines after a delete (`*** Delete File:`, `+++ /dev/null`) are scanned under the deleted path, so an `exceptFilePattern` on that path exempts them.

## Acceptance

- Added lines after a delete are also scanned under the empty path
- A test covers both delete forms

## Notes

Promoted from a to-do by the backlog audit, 2026-10-21.
