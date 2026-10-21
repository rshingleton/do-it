---
title: Guardrail candidates are deleted at close before retro-it can read them
type: bug
status: open
source: user
---

## Context

`skills/ship-it/SKILL.md` §3 and §4, `skills/do-it/scripts/work.mjs close`; source: docs/reference-audit/2026-10-19-repo.md, finding 9 (was T63).

## Problem

Guardrail candidates are deleted with the audit report at `work.mjs close` before `/retro-it` can read them. ship-it offers `/retro-it <id>` only in §4, after close.

## Acceptance

- The retro-it offer comes at the ship question, before close
- Or close keeps the candidates for retro-it to read
- A test or check covers the order

## Notes

Promoted from a to-do by the backlog audit, 2026-10-21.
