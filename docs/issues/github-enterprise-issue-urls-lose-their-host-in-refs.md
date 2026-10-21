---
title: GitHub Enterprise issue URLs lose their host in refs
type: bug
status: open
source: user
---

## Context

GitHub adapter and `skills/track-it/scripts/refs.mjs`; source: docs/reference-audit/2026-10-19-repo.md, finding 6 (was T54).

## Problem

GitHub Enterprise issue URLs lose their host in refs.mjs, so `gh` acts on github.com.

## Acceptance

- A GHE issue URL keeps its host in the ref
- `gh` is called with `-R host/owner/repo` for it
- A test covers a github.com URL and a GHE URL

## Notes

Promoted from a to-do by the backlog audit, 2026-10-21.
