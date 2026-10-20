---
title: Commit guard skips content of files git treats as binary
type: bug
status: open
source: user
---

## Context

Filed by prove-it from the one-changeset-module audit (rounds 2 and 5). The
gap predates that change: the commit guard on main (dcef2f5) has it too.
Modules: the commit guard (`beforeShell`, `hooks/lib/guard.mjs`), guard-it's
`scan.mjs`, and `addedLines` in `skills/do-it/scripts/changeset.mjs`.

## Problem

Neither the commit guard nor `scan.mjs` scans the content of a file git treats
as binary. git prints "Binary files ... differ" instead of a patch, so no
added line reaches the secret rules. Repo config or content alone can cause
it:

- a committed `.gitattributes` with `*.js -diff` or `*.js binary`;
- a diff driver with `diff.<name>.binary=true`;
- `core.bigFileThreshold` set below the file size;
- a NUL byte anywhere in the file.

A staged secret in such a file commits without a block. Adding `--text` to
the diff was tried in round 2 and reverted in round 5: a 2 MB NUL-led file of
short lines takes about 1.6 s to diff as text, and the guard runs several
diffs per hook (staged, HEAD, each step of a cd chain), so a few such files
ran past the 15 s pre-tool hook timeout, which lets the commit through.

## Acceptance

- A staged secret in a file marked `-diff` or `binary`, past
  `core.bigFileThreshold`, or containing a NUL byte blocks `git commit`.
- With four modified 2 MB binaries staged, `cd sub && git commit -am x`
  still finishes well inside the 15 s hook timeout.
- An old-vs-new comparison against the guard before the fix shows no commit
  it blocked that the fixed guard allows.

## Notes

- `skills/do-it/scripts/changeset.mjs`: `SCAN_FLAGS` and the `shortcut:`
  marker over `FILE_CAP` / `FILE_TIME`.
- `hooks/lib/guard.mjs` `beforeShell`: how many `addedLines` calls one hook
  makes.
- Audit reports in `docs/planning/one-changeset-module/` (rounds 2 and 5)
  while that plan is open.
