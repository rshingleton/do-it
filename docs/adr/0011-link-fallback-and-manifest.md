---
status: accepted
---

# One Node installer, with a junction and copy fallback tracked in a manifest

The symlink install failed on Windows without Developer Mode, where creating a symlink needs a privilege most accounts lack. `scripts/install.mjs` now does the linking on every platform, and `install.sh` only clones or pulls and then runs it. A directory is linked by symlink, then by junction (needs no privilege, absolute target). A file is linked by symlink, then copied. Every copy is recorded with its source and SHA-256 in `~/.claude/do-it/install.json`, written whenever a copy is made and absent when none was. A re-run refreshes a copy whose source changed. `--uninstall` removes only the copies the manifest lists and only while they are unedited; an edited copy, or a user file at a target, is left alone and reported.

## Options considered

- Require Developer Mode or an elevated shell: rejected, it blocks the people this is for.
- A separate `install.ps1`: rejected, a second installer to keep in step with the first.
- Copy everything: rejected, directory copies go stale silently; a junction stays live.

## Consequences

A copied agent or command file does not follow edits to the checkout until `install.mjs` runs again. The manifest is the only record of what is ours among copies, so deleting it makes the copies look like user files.

## Execution notes

- The six `unparseable frontmatter` errors seen on Windows came from CRLF working copies, not from the colon in the descriptions; `.gitattributes` (LF) is the fix and the quoted descriptions are strict-YAML hygiene.
- Tests that need bash skip with a reason when bash is not on PATH; twelve tests skip on Windows (POSIX mode bits, unprivileged symlinks, a newline in a file name, a shell-script `gh` stand-in).
- `install.mjs` does not read `DO_IT_HOME`; only the `install.sh` bootstrap does (T237).
- Open cleanups from the audit are on the to-do list (T237 to T245): `install()` split, a shared `norm`, one shared path helper, `check-shell` coverage.
- CI on windows-latest is added to the matrix; making it a required check is a branch-protection setting.
