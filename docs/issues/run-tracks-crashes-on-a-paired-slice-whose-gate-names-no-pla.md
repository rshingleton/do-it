---
title: run tracks crashes on a paired slice whose gate names no plan
type: bug
status: open
source: r21-track-errors
---

## Context

Surfaced by R21 (`r21-track-errors`) while reworking `run tracks`. The dispatcher builds each track's brief from the slice's plan path; when the gate entry names no plan, that path is null.

## Problem

A first paired slice whose gate names no plan crashes while its brief is built: `posix(path.resolve(root, s.plan))` receives `null`, and Node throws `The "paths[1]" argument must be of type string. Received null` instead of reporting the slice as unpaired. A coordinator starting a run gets a stack trace rather than the reason the slice cannot be dispatched.

## Acceptance

- A slice with no plan is reported as unpaired (its own reason in `waiting`, or a named refusal), never a crash.
- The rest of the dispatch still runs, so a run with one unplanned slice still starts its other tracks.

## Notes

`skills/do-it/scripts/runs.mjs`, `trackBrief` and `runTracks`; found by R21's build, whose files did not include that path. Filed during the `todo-clearance-2026-11` run with source slice R21 (`r21-track-errors`).
