---
title: "Check that a plan's paths and symbols exist"
type: feature
status: open
source: user
---

## Context

Source: research on open-gsd/gsd-core (ADR 22, plan-drift-guard), 2026-11-15. Touches `scope-it` and `skills/do-it/scripts/`.

## Problem

A plan can name files, paths or symbols that do not exist, and nothing checks that before build. gsd-core marks each reference verified, missing, ambiguous or uncheckable, excludes the artifacts the plan itself will create, and takes severity from a script rather than reviewer judgment.

## Acceptance

- A script reads a plan and classifies each referenced path or symbol as verified, missing, ambiguous or uncheckable
- Paths the plan declares as new are not reported missing
- `scope-it` runs it before approval and shows the result; severity comes from the script
- The script fails open: a crash or bad input never blocks the agent
- No runtime dependencies (Node 18+ built-ins); tests cover each class

## Notes

Plan-time counterpart to the review work in the abstention item.
