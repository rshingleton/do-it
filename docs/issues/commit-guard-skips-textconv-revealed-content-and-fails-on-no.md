---
title: Commit guard skips textconv-revealed content and fails on noisy drivers
type: bug
status: open
source: user
---

## Context

Filed by ship-it from the one-changeset-module audit (round 8, Shoulds 1 and
2). Both are cases where the commit guard before that change (dcef2f5)
blocked a staged secret and `addedLines` in
`skills/do-it/scripts/changeset.mjs` lets it through. Modules: `addedLines`
and the commit guard (`beforeShell`, `hooks/lib/guard.mjs`).

## Problem

1. **A text file with a decoding textconv driver is not read through it.**
   Every per-file diff passes `--no-textconv`, so a repo's driver cannot
   hide a text file's lines. A driver that reveals content is skipped too:
   a staged `s.b64` holding the base64 of a token line, with `*.b64
   diff=b64` and `diff.b64.textconv` running `base64 -d`, commits; dcef2f5
   blocked it.
2. **A driver that writes over 1 MB to stderr loses the file's content.**
   Node's `maxBuffer` also bounds stderr, so the per-file diff fails with
   ENOBUFS and the file gets path rules only. A driven binary whose driver
   prints 2 MB to stderr before the real output commits; dcef2f5 ignored
   stderr and blocked.

## Acceptance

- A staged secret that a file's textconv driver reveals blocks the commit,
  and a driver that hides a text file's lines still cannot hide them (scan
  both views, or the raw view plus the driver's).
- A driver's stderr output, of any size, does not change what is scanned.
- No staged change costs more than on dcef2f5 for files without a driver.

## Notes

- `skills/do-it/scripts/changeset.mjs`: `SCAN_FLAGS`, `own()`, `hasTextconv`.
- Related: `docs/issues/commit-guard-skips-content-of-files-git-treats-as-binary.md`.
- A textconv driver cut at the 2 s per-file limit keeps running after git is
  killed (round 8 Nice 5).
