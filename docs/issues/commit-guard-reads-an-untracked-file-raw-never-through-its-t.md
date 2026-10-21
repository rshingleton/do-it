---
title: "Commit guard reads an untracked file raw, never through its textconv driver"
type: bug
status: open
source: ship-it
---

## Context

Found by the commit-guard-gaps audit (round 3, Spec). Commit guard: `listChanges` in `hooks/lib/guard.mjs`; the untracked branch of `addedLines` in `skills/do-it/scripts/changeset.mjs`.

## Problem

An untracked file named by an earlier `git add` in the same command is read raw, never through its textconv driver. With `*.b64 diff=b64` and a base64-decoding driver, an untracked `s.b64` holding the encoding of a token passes: `git add s.b64 && git commit -m x` allows, while the same file already staged blocks.

## Acceptance

- A secret that a textconv driver reveals in an untracked file named by an earlier `git add` blocks the commit
- A file without a driver costs no more than before

## Notes

Related: `docs/issues/commit-guard-skips-textconv-revealed-content-and-fails-on-no.md` (shipped by commit-guard-gaps for staged and tracked files).
