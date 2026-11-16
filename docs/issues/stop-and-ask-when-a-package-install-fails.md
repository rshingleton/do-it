---
title: Stop and ask when a package install fails
type: feature
status: open
source: user
---

## Context

Source: survey of open-gsd/gsd-core agent prompts (executor Rule 3 exclusion, phase-researcher), 2026-11-15. Touches `agents/it-builder.md`, `guard-it` dependencies item, `look-it-up`.

## Problem

A failed package install may mean a hallucinated or slopsquatted name. do-it has no rule against the builder trying a similar package.

## Acceptance

- A failed install is never auto-fixed or retried under a similar name
- The builder stops and asks the user to confirm the package is real
- Researched packages not verified are tagged assumed (a squatted name also passes a registry lookup)

## Notes

Small as a rule; a registry-check script would be medium and is optional.
