---
status: accepted
---

# Opt-in run commits

ADR [0002](0002-no-commits-until-ship.md) keeps every build uncommitted until `ship-it` commits on the user's word, because the owner reviews changes by hand. A complete run (`/do-it --complete`) chains many slices with no user turn between them, so one end-of-run diff cannot be reviewed or reverted by phase. A run that was started with `--complete` and a commit mode may therefore commit each verified phase, and each lane S slice, on the current branch when it is unprotected, else on `do-it/<roadmap-slug>`. The flag is the user's explicit ask; without it ADR 0002 holds unchanged. Each commit follows a passing `verify-phase`, stages by path after a boundary check, and is tagged `do-it/<id>/phase-N` for rollback. Nothing is pushed, amended or forced, and a run never opens a PR. Committing per edit, auto-pushing and staging everything were rejected: they flood history, publish unreviewed work and sweep in stray files.

## What it reverses and keeps

- Reversed, only inside a `--complete` run that names a commit mode: a verified phase or slice may be committed before `ship-it`. The run flag overrides `DO_IT_COMMIT=never` for that run.
- Kept: no commit without that flag, no push, amend, force or PR, parallel scratch branches and squash merges, and `ship-it` as the only step that commits outside a run.

## Consequences

- Phase progress can now be tied to commits in a run; the state block and fingerprint still record the verified baseline, and `fingerprint` and `review-diff` must stay correct across commits after `base_ref` (proved in phase 1 of complete-run-lane).
- The commit guard and the `<id>: ` message rule apply to run commits unchanged.
- Rollback is a local tag and a reset the digest names; the user still decides when to push.

## Execution notes

Built as complete-run-lane; the audit passed on round 4. Non-blocking findings, all filed in `docs/TODO.md` (T135 to T153):

- Run commits stage whatever `--paths` names; a directory path can sweep in other slices' edits. The commit gate checks that `verify-phase` passed, not that code is unchanged since. A retried phase commit throws on the existing tag after the commit lands, and the branch switch and record writes precede `git commit`.
- Lane M in `slice` commit mode commits its code once after its last phase verifies, then the closing docs (run-lane-hardening R4). The final review's `<base>...HEAD` is empty with `--commit none`.
- Caps: the audit-round cap stops a slice whose fifth round passed, and `run next` ignores `max_slices`.
- Fixed in the build: the closing-docs commit (`run commit --docs`, lane M and S), assumption merging (`run add-assumptions`), digest assumption keys (`<id>#<n>`), rejection after close (`run reject-assumption`), and the recorded run `base`.
