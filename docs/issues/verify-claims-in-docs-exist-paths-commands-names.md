---
title: "Verify claims in docs exist (paths, commands, names)"
type: feature
status: open
source: user
---

## Context

Source: survey of open-gsd/gsd-core agent prompts (gsd-doc-verifier), 2026-11-15. Touches `sweep-it` drift lens.

## Problem

The drift lens is prose only. Docs can name file paths, commands, endpoints, functions or dependencies that no longer exist.

## Acceptance

- A small node script extracts those five claim kinds from Markdown
- Each is checked by existence only; nothing is executed
- Results feed the drift lens as findings
- No runtime dependencies; fails open

## Notes

Small to medium.
