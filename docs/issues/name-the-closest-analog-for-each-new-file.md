---
title: Name the closest analog for each new file
type: feature
status: open
source: user
---

## Context

Source: survey of open-gsd/gsd-core agent prompts (gsd-pattern-mapper), 2026-11-15. Touches `scope-it` scout step, PLAN-FORMAT Files section.

## Problem

Plans list files to create without naming the nearest existing file to copy from, so new code can drift from local patterns.

## Acceptance

- For each file the plan creates, name the closest existing file and the pattern to copy
- Say "no analog found" explicitly when none exists
- Note shared cross-cutting patterns (auth, errors)

## Notes

Small.
