---
title: review-diff reports a committed plan file as changed
type: bug
status: open
source: complete-run-lane
---

## Context

Surfaced building complete-run-lane phase 1. `skills/do-it/scripts/changeset.mjs`: `snapshot` keeps the HEAD copy of excluded paths.

## Problem

Once a plan file under `docs/planning/` is committed, `work.mjs review-diff` reports it as a changed file, so prove-it and review-it see planning files in the diff.

## Acceptance

- `review-diff` omits `docs/planning/` whether or not those files are committed
- A test commits a plan file after `base_ref` and asserts it is absent

## Notes

Found while proving the fingerprint across commits (tests/changeset.test.mjs).
