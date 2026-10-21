---
title: Local tracker accepts any .md path as an issue ref and can wipe plan state
type: bug
status: open
source: user
---

## Context

Local tracker (`skills/track-it/scripts/adapters/local.mjs`); source: docs/reference-audit/2026-10-19-repo.md, finding 4 (was T52).

## Problem

The local tracker accepts any .md path as an issue ref and drops nested or list frontmatter on rewrite, so a wrong ref can wipe a plan's phases and audit block.

## Acceptance

- A ref outside the issues dir is refused
- A rewrite is refused when any frontmatter line was skipped
- A test covers a work-item file passed as a ref: it is left unchanged

## Notes

Promoted from a to-do by the backlog audit, 2026-10-21.
