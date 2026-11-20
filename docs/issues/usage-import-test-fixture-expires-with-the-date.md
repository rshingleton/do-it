---
title: "usage import test fixture expires with the date"
type: bug
status: open
source: parallel-builds
---

## Context

Found by the parallel-builds audit. `tests/usage.test.mjs:156` (`importTranscripts backfills sessions and subagents, and is safe to repeat`) fails on a clean checkout.

## Problem

The fixture timestamp is the fixed `2026-10-21T10:00:00.000Z` (`line`, `tests/usage.test.mjs:22`) and the test imports a 7-day window (`days: 7`). From 2026-10-28 on the import finds nothing and the first assertion reads `0 !== 2`. `npm test` is red for a reason unrelated to the code under test.

## Acceptance

- The fixture timestamp is derived from today, as the `--by month` test above it already does
- `npm test` passes on any date
