---
title: Hollow and orphan check for new artifacts
type: feature
status: open
source: user
---

## Context

Source: survey of open-gsd/gsd-core agent prompts (verifier steps 4 and 4b, integration-checker), 2026-11-15. Touches `prove-it` (Architecture reviewer), the `finish-it` slice boundary.

## Problem

do-it has no wiring or orphan check. A new artifact can exist yet be a stub, be called by nothing, or take its data from a literal or mock. Across slices, exports with no importer go unnoticed.

## Acceptance

- Each new artifact is judged exists, substantive, wired and data-flowing
- Statuses: verified, hollow, orphaned, stub, missing
- A cross-slice report lists exports with no importer
- Reviewer brief first; a node-built-in script only if the brief proves too loose

## Notes

Small as a brief, medium as a script. Overlaps the stubs-register issue.
