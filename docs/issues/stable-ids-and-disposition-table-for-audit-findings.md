---
title: Stable ids and disposition table for audit findings
type: feature
status: open
source: user
---

## Context

Source: research on open-gsd/gsd-core (ADR 3806, review dispositions ledger), 2026-11-15. Touches the audit loop in `do-it`, `prove-it` and `build-it` (fail, rebuild, up to 3 rounds).

## Problem

gsd-core saw two planner instances each invent an incompatible format for "incorporated or deferred" review findings, citing line numbers into a file that was rewritten the next round. do-it's audit loop is exposed to the same drift: findings have no stable id and no fixed place in the plan for how each was handled.

## Acceptance

- Each audit finding gets a stable id that survives a rewrite of the report
- The plan carries one disposition table: addressed (where) or deferred or rejected (reason)
- A later round can be checked against the table for findings left unhandled
- Documented once in a shared reference file; skills link to it

## Notes

Keep to one home for the format (see the single-source rule in `AGENTS.md`).
