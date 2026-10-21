---
title: Commit scan stops reading paths after a redirect
type: bug
status: open
source: user
---

## Context

Commit scan, `hooks/lib/guard.mjs` `beforeShell`; source: hook-trust-hardening audit round 2, finding 6 (was T66).

## Problem

A redirect before the paths (`git commit -m x 2>&1 a.js`) ends the commit's arguments, so later paths are not scanned.

## Acceptance

- Paths after a redirect are scanned
- A test covers `git commit -m x 2>&1 a.js`

## Notes

Promoted from a to-do by the backlog audit, 2026-10-21.
