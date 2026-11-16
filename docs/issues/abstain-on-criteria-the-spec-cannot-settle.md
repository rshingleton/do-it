---
title: Abstain on criteria the spec cannot settle
type: feature
status: open
source: user
---

## Context

Source: research on open-gsd/gsd-core (`gsd-core/references/honest-verifier.md`), 2026-11-15. Touches `scope-it` (plan criteria), `prove-it` and the `it-reviewer` agent (verdicts).

## Problem

A reviewer cannot tell when a criterion depends on a rule the spec never states (boundary behaviour, what counts as a "character"). gsd-core reports such checks get a confident pass almost every time, and that asking the verifier to "abstain if unsure" barely helps. What helped was routing on a tag set at planning time, not on the verifier's own confidence. do-it has no equivalent, so a blind-spot criterion passes silently, worst in unattended `finish-it` runs.

## Acceptance

- `scope-it` can tag a plan criterion as under-specified (the tag is set at planning time, never by the reviewer)
- `prove-it` reports a tagged criterion as "unverified, held-out test needed" unless a passing test or directly observed behaviour backs it; symbol presence alone does not count
- Untagged criteria are graded as today (no over-abstention)
- Interactive runs surface the item at the end checkpoint; `finish-it` closes with "complete with N unverified checks" rather than passing or halting
- Routing eval and format checks cover the new tag

## Notes

Write in this repo's own words; credit gsd-core in the README. Their numbers (100% to 67% to 17%) are their claims, unchecked.
