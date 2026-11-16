---
title: "Register of stubs, skipped tests and unrun verifies"
type: feature
status: open
source: user
---

## Context

Source: research on open-gsd/gsd-core (capability `broken-windows`, issue 1950 there), 2026-11-15. Touches `ship-it`, `prove-it`, `finish-it`, `log-it`.

## Problem

Stubs, TODOs, skipped tests and unrun verifies can slip through a slice and are not collected anywhere. gsd-core keeps a cross-phase register and can block ship while one is open unless waived with a recorded reason. This matters for `finish-it`, which parks work with no user in the loop.

## Acceptance

- Ship or prove detects new stubs, TODOs, skipped tests and unrun verifies in the diff
- Each is filed through `log-it` (no new store), or waived with a recorded reason
- A blocking mode is opt-in; default is a report
- `finish-it` digest lists open items
- Checks fail open

## Notes

Check overlap with `sweep-it` and the existing `hooks/lib/checks.mjs` rules before building.
