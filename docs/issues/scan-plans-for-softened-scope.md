---
title: Scan plans for softened scope
type: feature
status: open
source: user
---

## Context

Source: survey of open-gsd/gsd-core agent prompts (plan-checker, dimension 7b), 2026-11-15. Touches `scope-it/CHECKS.md`, the Spec axis of `review-it` and `prove-it`.

## Problem

The coverage check only asks whether a decision or acceptance item has a step, not whether the step delivers all of it. A plan can quietly shrink an item with words like "v1", "for now", "placeholder" or "wired later" and still pass.

## Acceptance

- A scan flags softening language in plan steps
- Each hit is compared with the decision or acceptance item it claims to cover
- A shrunken delivery blocks: deliver it in full or split the slice
- The same scan runs on the diff in the Spec axis of review and prove

## Notes

Small. Pairs with the plan-path check issue (same file).
