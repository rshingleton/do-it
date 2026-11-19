---
title: History
---

# History

The one durable record of what shipped and left no file behind. Two kinds of
entry live here: roadmaps removed from `docs/roadmap`, and work items and runs
whose plan files were removed at ship. Each kind has its own section below.
Git history still holds the removed files themselves.

## Roadmaps

Durable record of every roadmap removed from `docs/roadmap`: one row per file.
A finalize adds its own row
([FINALIZE.md](../../skills/ship-it/FINALIZE.md)); a roadmap removed any other
way is recorded here by hand. This section began on 2026-11-16 with five
finished roadmaps and one superseded. No file listed below is in the tree. A
closed roadmap is not work: `work.mjs roadmap` offers no slice from one.

| Roadmap | File removed | Approved | Completed | Slices in Shipped |
|---------|--------------|----------|-----------|-------------------|
| Backlog hardening | backlog-hardening.md | 2026-10-25 | 2026-10-30 | 26 |
| Debt and simplification | debt-simplification.md | 2026-10-27 | 2026-10-30 | 12 |
| Open backlog 2026-10 | open-backlog-2026-10.md | 2026-10-30 | 2026-10-31 | 28 |
| Run lane hardening | run-lane-hardening.md | 2026-10-30 | 2026-10-30 | 11 |
| Should backlog 2026-10 | should-backlog-2026-10.md | 2026-10-31 | 2026-10-31 | 15 |
| Backlog cleanup 2026-11 | backlog-cleanup-2026-11.md | 2026-11-15 | superseded 2026-11-16 | 1 |

Every open item these roadmaps named is on `docs/TODO.md`, in the roadmap that
carried it, or recorded below in Fog.
## Backlog hardening

Source file removed: `docs/roadmap/backlog-hardening.md` (approved 2026-10-25, completed 2026-10-30).

### Destination

The open bugs and debt found in the 2026-10-19 repo audit, the open issues
and the 2026-10-25 handoff review are cleared in an order that protects users
first, and OpenCode token work is measured before it is optimised. This
repo's hooks, tracker, flow state and checks do what the docs say.

- G1: No secret reaches a commit or a patch unscanned by the hooks, and the hooks still fail open and finish inside their timeout.
- G2: No tracker operation destroys or misroutes an issue or a plan.
- G3: The flow's state and hand-offs behave as documented: a fix round records its verification, retro-it can reach the audit's guardrail candidates, and a closing line names a step the user can run.
- G4: `npm test` and `npm run check` enforce what AGENTS.md and the skills claim, and do not depend on the developer's environment.
- G5: Each rule and each parser lives in one place, and the docs describe the model that ships.
- G6: OpenCode pays for session context once and can record usage, with token claims measured before anything is optimised.
- G7: A finding the flow surfaces (an audit's Should and Nice, a product defect a verify slice exposes) is offered to `log-it` at ship, not lost when the plan is deleted, and a slice whose verify clause is unmet says so.
- G8: An open roadmap decision is asked and settled before the slices it blocks are stranded, never silently skipped by `next` or `/do-it`.
- G9: The in-hunk dev-null twin of R2 is closed, so a unified hunk cannot steer a scoped rule either.

### Shipped

- R1 commit-guard-hardening, 2026-10-25: `addedLines` diffs plain text in chunks, so 3,000 staged files take a few seconds, not 31.7 s.
- R2 guard-patch-paths, 2026-10-25: an embedded `+++ /dev/null` pair scans under its old path and `''`, and `scan` reads `\` as `/`.
- R3 commit-msg-warn-timeout, 2026-10-25: `hookTimeout` falls back to 20 s and a `-m` message without `<id>: ` warns, never blocks.
- R4 local-tracker-integrity, 2026-10-25: a local ref must be an `.md` inside the issues dir, rewrites go through temp plus rename and `create` opens with `wx`.
- R5 tracker-ghe-publish, 2026-10-25: `parseRef` keeps a non-github.com host so `gh` gets `-R host/owner/repo`, and a failed `publish` returns the refs made.
- R6 frontmatter-module, 2026-10-25: one `frontmatter.mjs` replaces five copies of split, join and flat read and write.
- R7 build-done-fix-verify, 2026-10-25: a fix-mode `phase-done` records `fix_verified` and `build-done` refuses without it.
- R8 retro-offer-at-ship, 2026-10-25: the `/retro-it <id>` offer moved to the ship question, before `work.mjs close` deletes the candidates.
- R9 closing-line-slash-command, 2026-10-26: a typed skill is named by its slash command and `npm run check` fails a `Next:` line that offers "do it" beside it.
- R11 test-env-helper, 2026-10-26: `tests/env.mjs` gives every suite a temp HOME and XDG dir, no `DO_IT_*` variables and `GIT_CONFIG_GLOBAL=/dev/null`.
- R12 spawn-caps-carries-voice, 2026-10-25: `npm run check` fails a spawn cap above its agent's cap and `carriesVoice` needs the voice marker in the agent file.
- R13 check-skill-rules, 2026-10-25: `check.mjs` fails a link that leaves `skills/`, a model-invoked description without "Use when" and a name with no `it` segment.
- R14 skills-line-budget, 2026-10-26: ship-it 114 to 97 lines and it-core 103 to 97, and the routing eval ranks the log-it prompt first.
- R15 adapter-and-installer-tests, 2026-10-26: new installer, adapter and config-precedence suites and a `close`-from-building test, each failing when its code is broken on purpose.
- R16 docs-one-copy, 2026-10-26: DESIGN.md links STATE.md, PLAN-FORMAT.md and ADR 0002, and the deletion test lives in design-it.
- R17 plan-parser-block-only, 2026-10-26, Verify unmet: `block.mjs` is about 120 lines shorter (72 measured, 360 to 288): flow maps and multi-line brackets now throw "rewrite in block style".
- R18 terse-voice-ab-harness, 2026-10-26: `docs/research/terse-voice-ledger.md` compares 418 real `it-*` ledger runs before and after `35df34e` and finds the saving not proven.
- R19 opencode-context-cache, 2026-10-26: the OpenCode plugin builds the session context once and rebuilds it when `.git/HEAD` or the index change (153 ms every turn against 13 ms cached).
- R20 setup-it-external-directory, 2026-10-26: `opencode-check.mjs` flags `allow`, a missing key or a string `permission` in `opencode.json`.
- R21 opencode-usage-ledger, 2026-10-26: OpenCode v1 and v2 events become per-run ledger rows, tokens only per ADR [0009](../adr/0009-usage-ledger-records-tokens-only.md).
- R22 audit-leftovers-at-ship, 2026-10-26: with no changelog, ship-it's question lists the audit's Should and Nice findings and offers to log them as to-dos.
- R23 surfaced-defects-at-ship, 2026-10-26: work items carry a `defects` list that ship-it lists and offers to log, and a row with unmet Verify is written `shipped <date> <id>, Verify unmet: <clause>`.
- R24 open-decisions-asked, 2026-10-26: `work.mjs roadmap` reports `blocking: [{id, blocks}]` and roadmap-it and do-it ask each blocking decision.
- R25 unified-in-hunk-dev-null, 2026-10-26: `unifiedFiles` scans the added lines after an in-hunk dev-null pair under the old path and `''`.
- R26 opencode-usage-agent-prune, 2026-10-26: a v2 run records the agent its `context` hook reported and `prune` runs once a UTC day change.
- R27 voice-ab-harness, 2026-10-27: 50 isolated headless runs in `docs/research/terse-voice-ab.md` show no evidence of a saving; the quality check is met only by keyword scoring.

### Decisions so far

- 2026-10-25 Decision: keep `doubt-it` and `prove-it --since`; T39 dropped.
- 2026-10-25 Decision: do removal and correctness work before new features (T64).
- 2026-10-25 Decision: narrow T2 to `/setup-it` on another repo.
- 2026-10-25 Decision: park T13 to T32 until evidence.
- 2026-10-25 Decision: findings that reach ship (audit leftovers, defects a verify slice surfaces) get their own milestone M7 after M4, since both edit ship-it's question and ship-it must first fit its line budget (R14).
- 2026-10-26 Decision: D1 settled: the usage ledger records tokens only, never cost (prices change; usage-it can apply a price table when reporting). R21 is unblocked. (ADR [0009](../adr/0009-usage-ledger-records-tokens-only.md))
- 2026-10-26 Replan: destination moved by two requirements (G8, G9) from the issues still open after M7; M8 comes first because the stranded-decision bug would hide D2 and any later decision.
- 2026-10-27 Decision: D2 settled: `claude` is logged in on this machine, so R27 runs. The earlier harness failed because an isolated config dir was not logged in, so R27's first step is to find a way to isolate the two arms' agents and hooks that keeps the login (a copied or linked credential, or `--plugin-dir`); if none works, R27 is re-scoped, not dropped. R27 is unblocked.

### Fog

- Scoping each work item's fingerprint and audit diff to its own paths (T49): may become a slice once concurrent items are routine.
- Trimming passing-test output and guarding whole-file rewrites (T81, T82): unproven; revisit after R18 shows where tokens go.
- Usage windows that straddle a reset (T76): label them run-based or split by message time.
- A tracker doctor and an install doctor (T3, T78): may become one `/setup-it` check slice.
- Running `/setup-it` on another repo (T2): a user-run check, not a build slice.
- Confirming the OpenCode v2 `session.step.ended` field names on a live OpenCode 2 (T115): a user-run check; a mismatch becomes a slice.
- A `work.mjs` per-step usage field (closed per-step usage issue, state field only): deferred until the ledger's window attribution proves too coarse.

### Out of scope

- The research-derived ideas T13 to T32 and T44, T45, T47, T62: parked 2026-10-25; return through T47 when an audit or retro cites one.
- Dropping or folding `doubt-it` (T39 dropped 2026-10-25: keep it and `prove-it --since`).
- New features before M5 (T64): removals come first.

## Debt and simplification

Source file removed: `docs/roadmap/debt-simplification.md` (approved 2026-10-27, completed 2026-10-30).

### Destination

The audit leftovers T89 to T130 that remain after backlog-hardening are
cleared as removals and tightenings, with no new feature (T64). Each rule,
helper and parser state has one copy, and each check names what failed.

- G1: `npm run check` compares every spawn cap shape and the routing eval's missing-entry failure, each with a failing-fixture test.
- G2: Tests share one env helper and one set of fakes, name the failing layer, and leave no temp dirs behind.
- G3: Hook and script code carries one copy of each helper and one state shape per parser.
- G4: Skills and docs state each rule once, and the pin tests survive a rewrap.
- G5: The OpenCode usage path is bounded, stops with its plugin, and fails safe.
- G6: What an unmet-Verify slice means for its dependents is decided and tested.

### Shipped

- R1 T100, 2026-10-27, Verify unmet: one deliberate hostile-env literal stays in `tests/env.test.mjs`: one home helper, and `cleanEnv` strips `DO_IT_*` at call time.
- R2 T100, 2026-10-27: shared `tests/fakes.mjs`, a self-cleaning `tmpDir` and `config-precedence` split by layer.
- R3 T91, 2026-10-27: the spawn-cap check reads "N in all" caps and every `>` paragraph, with `owner` computed once.
- R4 routing-missing-entry, 2026-10-27: a dedicated `evaluate()` case and an `eval-routing.mjs` CLI test for a skill with no routing entry.
- R5 unified-files-state, 2026-10-28: `unifiedFiles` keeps one `embed` state object and scans an in-hunk dev-null pair's own line under the old path.
- R6 T89, 2026-10-28: `work.mjs show`, `event` and `close` run the id check `new` does.
- R7 T97, 2026-10-27: ship-it DOCS, do-it and deepen-it point at one home for each repeated rule.
- R8 T96, 2026-10-28: the R22 and R24 pin tests flatten whitespace, so a rewrap keeps them green and deleting the offer turns one red.
- R9 T109, 2026-10-27: DESIGN.md section 8 labels the 1,250-token figure an estimate and the usage paragraph is rewrapped.
- R10 T116, 2026-10-27: the OpenCode usage `runs` map is capped at 256 with LRU eviction and `prunedDay` is set after a successful prune.
- R11 R11, 2026-10-28: `setup` returns a cleanup that aborts the `ctx.event.subscribe` signal, confirmed on OpenCode 2.1.2.
- R12 T99, 2026-10-27: `roadmap.mjs` gives each slice an `unmet` list and `blocking` reuses `done`; a dependent of an unmet-Verify slice does not wait (ADR [0010](../adr/0010-unmet-verify-does-not-block-dependents.md)).

### Decisions so far

- 2026-10-27 Decision: the next destination is removals and tightenings of the audit leftovers, no features (T64).
- 2026-10-27 Decision: D1 settled: a dependent of a slice shipped with Verify unmet does not wait; `roadmap` lists the unmet clause beside it. R12 is unblocked. (ADR [0010](../adr/0010-unmet-verify-does-not-block-dependents.md))
- 2026-10-27 Decision: T110 and T103 dropped; T107, T130 and T115 sit in Fog.

### Fog

- Scoping each work item's fingerprint and audit diff to its own paths (T49): may become a slice once concurrent items are routine.
- Trimming passing-test output and guarding whole-file rewrites (T81, T82): unproven; R27's A/B found no token evidence to act on.
- Usage windows that straddle a reset (T76): label them run-based or split by message time.
- A tracker doctor and an install doctor (T3, T78): may become one `/setup-it` check slice.
- Running `/setup-it` on another repo (T2) and confirming the OpenCode v2 `session.step.ended` field names on a live OpenCode 2 (T115): user-run checks; a mismatch becomes a slice.
- The inline-or-link question for the deletion test in the prove-it Architecture brief and sweep-it LENSES (T107): judgement, settle when an agent is seen to skip the link.
- Whether the public `createOpenCodeUsage` signature should hide its test seams (T130): judgement.
- A `work.mjs` per-step usage field (closed per-step usage issue, state field only): deferred until the ledger's window attribution proves too coarse.

### Out of scope

- New features and the research-derived ideas T13 to T32, T44, T45, T47, T62: still parked until an audit or retro cites one.
- Snapshotting the usage ledger rows behind the retired terse-voice ledger verdict (T110): R27's A/B superseded it.
- Moving the env import into the `npm test` script (T103): couples the helper to the test command for no gain.

## Open backlog 2026-10

Source file removed: `docs/roadmap/open-backlog-2026-10.md` (approved 2026-10-30, completed 2026-10-31).

### Destination

The open defects and debt on `docs/TODO.md`, and the audit-cap issue, are
cleared so a long `finish-it` run finishes without the user raising a cap,
the run scripts refuse unsafe states and say why, and the roadmap lifecycle
and the tests do what the docs claim. No new feature beyond the cap change.

- G1: A long roadmap whose slices each pass audit in a normal number of rounds finishes under default caps; a slice stuck in a failing audit loop, the final review and the run total each still stop, and `AUDIT_CAP` and the digest name which limit fired.
- G2: The `finish-it` loop text, its call-site tests and `STATE.md` agree with the code: the turn ends only when `run next` returns no slice, and a slice ships only after each reviewer's final notice.
- G3: The commit and verify path refuses unsafe states (untracked or retargeted paths, failed switch-back, a retry that is not a retry) and reports a failure instead of reading it as clean.
- G4: Each helper, id regex, git wrapper and record shape in the run scripts has one copy, each handler lives where its name says, and the digest cannot be forged by a reason or tag text.
- G5: The roadmap lifecycle behaves as documented: a finalized roadmap is described in FORMAT.md, reported honestly by `work.mjs roadmap`, and finalized without a missing offer or an unaccepted ADR.
- G6: Tests cover the cases the audits named, share one runner, and pin behaviour rather than wording.
- G7: A reviewer or sweep that errors or returns nothing is reported as unverified, never clean, and the small skill and usage gaps from the audits are closed.

### Shipped

- 2026-10-30: charted and approved.
- 2026-10-30: R1 shipped (r1-audit-cap).
- 2026-10-30: R2 shipped (r2-loop-text).
- 2026-10-30: R3 shipped (r3-state-docs).
- 2026-10-30: R4 shipped (r4-verified-files).
- 2026-10-30: R5 shipped (r5-commit-paths).
- 2026-10-30: R6 shipped (r6-undo).
- 2026-10-30: R7 shipped (r7-run-caps), without parking a plain double verify failure.
- 2026-10-30: R8 shipped (r8-review-change), without the snapshot narrowing or the dirty-tree refusal.
- 2026-10-30: R9 shipped (r9-split-run-handlers).
- 2026-10-30: R10 shipped (r10-one-copy).
- 2026-10-30: R11 shipped (r11-digest-safe).
- 2026-10-30: D1, D2 and D3 moved from Open decisions to Decisions so far: the run sweep had settled them as assumptions, and an open entry held R12, R16 and R22 back.
- 2026-10-30: R12 shipped (r12-assumption-bookkeeping).
- 2026-10-30: R13 shipped (r13-text-accuracy).
- 2026-10-30: R14 shipped (r14-finalize-edges).
- 2026-10-30: R15 shipped (r15-reopened-note).
- 2026-10-30: R16 shipped (r16-adr-accepted), D2 applied: offer a writes ADRs `accepted`.
- 2026-10-30: R17 shipped (r17-finalize-pins).
- 2026-10-30: R18 shipped (r18-unverified-reviewers).
- 2026-10-30: R23 parked: it needs a live OpenCode 2 model call (credentials and spend), so it waits for the owner.
- 2026-10-31: R23 shipped (r23-live-step-shape): one tiny run on a free model showed the v2 payload under `data`, so every step was dropped; the parser now reads it and the ledger gets a row.
- 2026-10-30: R20 shipped (r20-walkthroughs): the walks found four defects, filed as T205 to T208.
- 2026-10-30: R22 shipped (r22-usage-windows), D1 applied: windows split a straddling run by 15-minute buckets.
- 2026-10-30: R19 shipped (r19-test-runner-and-guards).
- 2026-10-30: final review over the whole run: one Must (a stale `Next id` in the to-do list), fixed; the Should and Nice findings are T213.
- 2026-10-30: R24 shipped (r24-protected-default-branch): setup-it reads the remote's default branch with `default-branch.mjs`.
- 2026-10-30: R21 shipped (r21-design-it-pointers): the deletion test sits inline in the prove-it and sweep-it briefs; debug-it routes a missing seam to log-it or deepen-it.

### Decisions so far

- 2026-10-30 Decision: scope is defects, debt and the audit-cap issue; ideas and questions stay on the to-do list.
- 2026-10-30 Decision: audit cap becomes per slice (default 3), the final review keeps its own cap, and the run total is `max_slices x per-slice cap`.
- 2026-10-30 Decision: one slice at a time, `should` before `nice-to-have`, high risk first; no tracker publish.
- 2026-10-30 Decision (D1, settled in the run sweep as an assumption): usage-it splits a straddling session by per-message timestamps, with the run-based label as the fallback; revisit if transcripts lack per-message times (plan r22-usage-windows).
- 2026-10-30 Decision (D2, settled in the run sweep as an assumption): a roadmap finalize's offer a writes its ADRs `accepted`; revisit if a finalize can run with no user turn (plan r16-adr-accepted).
- 2026-10-30 Decision (D3, settled in the run sweep as an assumption): assumption rejection matches by text among the remaining plan entries; revisit if entries can carry identical text (plan r12-assumption-bookkeeping; should-backlog-2026-10 R8 settled equal texts by id).

### Fog

- T78 doctors: a tracker reachability check and an install doctor (may become one `/setup-it` check slice, or two).
- T62 push, PR and rollback ownership at the end of the lifecycle (ADR-sized; may become slices after a decision on which skill owns it).
- T2 dogfood `/setup-it` on another repo (needs a second repo; may produce slices).

### Out of scope

- The `idea` and `question` items stay on `docs/TODO.md`: T4, T13, T14, T17, T19, T20, T22, T23, T24, T26, T27, T28, T29, T31, T32, T44, T45, T46, T47, T49, T82, T152, T175.
- Any new skill.

## Run lane hardening

Source file removed: `docs/roadmap/run-lane-hardening.md` (approved 2026-10-30, completed 2026-10-30).

### Destination

The complete-run lane's commits, caps and stops do what STOPS.md, COMMITS.md
and ADR 0008 say, and no secret reaches a run commit unscanned. The open
issues and the `should` findings of the complete-run-lane audit (T135 to
T145) are closed; no new feature is added.

- G1: No secret in a new, untracked file reaches a commit unscanned, including a run commit that stages by path.
- G2: A run commit stages only its slice's own files, survives a retry, leaves the branch and run record consistent when a hook rejects it, and lane M in `slice` mode commits its code.
- G3: The caps and stops in STOPS.md (audit rounds, slice count, stale verify, parked slices) fire where documented, and the finish-it loop and its `--resume` text name every call and id they need.
- G4: What the run reports is true: review-diff leaves out planning files, the final review reads the right change under any commit mode, the digest lists only this run's tags and its retry results, and assumption rejection is atomic and keyed by `n`.
- G5: Run orchestration lives in `gate.mjs`, so each rule in G3 and G4 has a unit test.

### Shipped

- R1 guard-untracked-paths, 2026-10-30: the guard scans untracked files named on a `git commit <path>` line, with one extra `ls-files` call.
- R2 commit-dir-retry, 2026-10-30: `run commit` refuses directory and glob paths and a landed phase commit is a no-op on retry.
- R3 commit-after-success, 2026-10-30: a rejected run commit restores the branch and leaves the run record untouched.
- R4 lane-m-slice-commit, 2026-10-30: lane M in `slice` mode commits its code once, then its closing docs.
- R5 gate-orchestration, 2026-10-30: `run gate` and `run verify` live in `gate.mjs` as `runGate` and `runVerify` with unit tests.
- R6 cap-checks, 2026-10-30: the audit cap refuses the round after it, a slice whose last allowed round passed ships, and `run next` stops at `max_slices`.
- R7 loop-call-sites, 2026-10-30: the finish-it loop calls `run start`, `run verify`, `run audit` and `run gate`, `--resume` names the slice id, and tests check each stop code's call.
- R8 review-diff-planning, 2026-10-30: the snapshot drops excluded planning paths, so `review-diff` never lists a committed plan file.
- R9 final-review-change, 2026-10-30: `work.mjs run review-change` gives the final review the working tree against base or `<base>...HEAD`, planning files never in it.
- R10 digest-run-scope, 2026-10-30: the digest's Rollback lists only this run's tags and a Retried section shows how each resumed slice ended.
- R11 reject-by-n, 2026-10-30: `run reject-assumption` fires the plan event before writing the record and finds the plan entry by `n`.

### Decisions so far

- 2026-10-30 Decision: scope is the two issues and T135 to T145; T146 to T150 sit in Fog.
- 2026-10-30 Decision: T142 is a bug: lane M in `slice` mode commits its code once, then its closing docs.
- 2026-10-30 Decision: T145 is fixed in the finish-it loop text with a test that every stop code has a call site, not by having `run next` call `run start`.
- 2026-10-30 Decision: T144 goes before T139, T143 and T145 so they are unit-testable.
- 2026-10-30 Decision: run commits are opt-in per run (ADR [0008](../adr/0008-opt-in-run-commits.md)).

### Fog

- The `nice-to-have` leftovers of the same audit (T146 to T150): assumption bookkeeping, run-script duplication, text accuracy, the `STOPS` code assertion, the `changeset.mjs` loosening. May become one debt slice after M4.
- Phase fixture walkthroughs that were never run (T153): a user-run check, not a build slice.
- Scoping each work item's fingerprint to its own paths (T49): may become a slice once concurrent items are routine.

### Out of scope

- Phases in parallel worktrees whenever free (T152): a feature.
- The lifecycle past a local commit: push, PR, changelog headings (T62).

## Should backlog 2026-10

Source file removed: `docs/roadmap/should-backlog-2026-10.md` (approved 2026-10-31, completed 2026-10-31).

### Destination

The 17 `should` items on `docs/TODO.md` are cleared, so the run lane's gates,
records and digest behave on the states the audits named, and the skill text,
`STATE.md` and the tests say what the code does. No new feature.

- G1: The run gates and records behave in the states the walkthroughs and audits named: a settled sweep decision is never left open, closing docs do not make a verified slice stale, a verify on the wrong item state says so, a stop outlives no resume, and equal-text assumptions are told apart (T205, T206, T207, T184, T196).
- G2: The commit and verify path records only the slice's own paths and survives the edge-case names, modes, repeated paths and retries the audits listed (T159, T188, T189).
- G3: The run scripts carry one honest copy of each helper and name, and the digest prints no unsanitised text (T194, T195).
- G4: The finish-it loop, `STATE.md`, FINALIZE and roadmap-it text and their tests agree with the code and pin behaviour, not wording (T165, T186, T187, T198, T199).
- G5: A reviewer that errors reads as unverified in every skill that fans out, and usage-it windows state their limits and count runs once (T203, T204, T209).

### Shipped

- 2026-10-31: R1 shipped (sb-r1-sweep-decisions): a swept decision leaves Open decisions and `run next` lists `defects` (T205).
- 2026-10-31: R2 shipped (sb-r2-fingerprint-docs): the change fingerprint ignores the roadmap file, the to-do list and ADRs (T206).
- 2026-10-31: R3 shipped (sb-r3-verify-state): `verify-phase` on a non-building item says why and what to do, before any check (T207).
- 2026-10-31: R4 shipped (sb-r4-verified-paths): `run verify --paths` records only the slice's files (T159).
- 2026-10-31: R5 shipped (sb-r5-verified-leftovers): NUL split, 755/644 modes, submodule state, named record errors, `\r` names, a smaller 1 MB test (T188).
- 2026-10-31: R6 shipped (sb-r6-commit-retries): deduped retry path sets, retry ahead of the verify compare, outside-root check in every lane (T189).
- 2026-10-31: R7 shipped (sb-r7-audit-cap-leftovers): `audit_stop` cleared on resume, record-level marker tests, old records gate, `gate` no longer writes (T184).
- 2026-10-31: R8 shipped (sb-r8-assumption-bookkeeping): reject by id first, equal texts left alone once lists differ, `earlier` marks, `sweep` reserved (T196).
- 2026-10-31: R9 shipped (sb-r9-loop-text): finish-it placeholder, `--phase` and round-count text, a stricter `closesEarly` (T165, T186).
- 2026-10-31: R10 shipped (sb-r10-state-run-row): `STATE.md` run row: `retries`, marker clearing, `audit` fields, `building` plans (T187).
- 2026-10-31: R11 shipped (sb-r11-one-copy): `ids.mjs`, no unused `run.mjs` exports, one `git` name, a structure test that strips comments (T194).
- 2026-10-31: R12 shipped (sb-r12-digest-leftovers): every digest bullet folded to one line, shipped-with-reason pinned (T195).
- 2026-10-31: R13 shipped (sb-r13-roadmap-lifecycle): FINALIZE Paths and run mode, one word for replan, `reopened` for a decision opened later (T198, T199).
- 2026-10-31: R14 shipped (sb-r14-unverified-reviewers): an errored reviewer or bare "No findings." reads as unverified; prove-it fires `block` (T203, T204).
- 2026-10-31: R15 shipped (sb-r15-usage-windows): one run across adjacent windows, `partial` label, `--json` `whole`, stated limits (T209).

### Decisions so far

- 2026-10-31 Decision: scope is the 17 `should` items; `nice-to-have` items, T149 and T150 stay on the to-do list.
- 2026-10-31 Decision: the change fingerprint leaves out the roadmap file, `docs/TODO.md` and ADRs (T206); a hand edit to them after audit goes unseen.
- 2026-10-31 Decision: assumptions are rejected by `feat#N` id first, by text only when unique (T196, the D3 revisit).
- 2026-10-31 Decision: `verified_files` records only the slice's mapped paths (T159).
- 2026-10-31 Decision: a swept decision moves to Decisions so far, and `ask-when-reached` slices show in `run next` `defects` (T205).
- 2026-10-31 Decision: `audit_stop` is cleared when `run slice <id> ready` names that slice (T184).
- 2026-10-31 Decision: one slice at a time in id order, no tracker publish.

### Fog

- T149 and T150 (plain double verify failure parking; dirty-tree refusal at `run new`) are decisions, not fixes: they may become one slice after an owner call.
- The `nice-to-have` items on `docs/TODO.md` (T164, T167, T185, T190 to T193, T197, T200 to T202, T208, T210 to T213) may become one text-and-test sweep slice.

### Out of scope

- The `idea` and `question` items stay on `docs/TODO.md`.
- T214, T62, T78, T2 and any new skill.

## Backlog cleanup 2026-11

Source file removed: `docs/roadmap/backlog-cleanup-2026-11.md` (approved
2026-11-15, superseded 2026-11-16).

### Destination

The 2026-11 audit leftovers in skill text, tests, the run scripts, install and
the link-it limits.
It did not finish: its open items moved to
[todo-clearance-2026-11](../roadmap/todo-clearance-2026-11.md) at that
roadmap's approval, so this record says what shipped, not that the destination
was reached.

### Shipped

- R1 r1-text-truth, 2026-11-15: ship-it, finish-it and prove-it text leftovers, and the issue's `source:` names `windows-support` (T208, T211, T216, T223, T238).

### Superseded

- The roadmap promoted 36 items. R1 shipped five (see Shipped); the other 31,
  R2 to R16, were carried into
  [todo-clearance-2026-11](../roadmap/todo-clearance-2026-11.md) when it was
  approved on 2026-11-16, where each owns a slice. None was dropped here.

## Work items and runs

One entry per shipped work item or complete run, newest last, under a
`### <id>` heading, about 12 lines at most. The shape is in
[skills/ship-it/HISTORY.md](../../skills/ship-it/HISTORY.md).

### run-caps-count-work

Run caps count work, not attempts. 2026-11-18, lane M, PR #37 (merge `7f06cd0`).

- The audit cap stays 3, but only a round that repeats an earlier Must spends
  one, so a slice parks after the same finding comes back four times. The old
  "fails twice on the same Must" wording of the audit-cap issue was amended.
- Musts are read from the plan's `audit.must` and kept across rounds in the run
  record's `seen_musts`; there is no new `run audit` flag. `audit_rounds` stays
  the honest count of rounds started; `audit_spent` is the per-slice counter.
  The final review and the run total still count every round.
- The slice time cap counts in-flight spans, each closed at the last command
  that showed the slice alive; `run start` on a running slice opens a new span.
  That is the interruption seam. Only recorded activity is charged, accepted
  because the cap is a tripwire and the audit cap still bounds rounds.
- Not done: the final review's own cap, blocked time, detecting a sleep with no
  command on return, a different 120-minute default, refunding a spent round.
- Findings logged: T346 to T350 (no ADR yet for the span fields and
  `audit_spent`; repeated test helpers and cases in `tests/run-gate.test.mjs`).

### central-history

One central history; shipping removes every plan and run file. 2026-11-18, lane M, commit message prefix `central-history:` (ADR [0016](../adr/0016-one-history-and-shipping-removes-plan-and-run-files.md)).

- `roadmap-history.md` became this file, with one entry per work item or run (shape in `skills/ship-it/HISTORY.md`). Ship writes the entry before it closes the plan; a finished run writes its own in `DIGEST.md` section 4.
- `run remove <slug> <roadmap>` deletes `<slug>.run/` only when the roadmap is finished: it has slices, each shipped or dropped, no open decision, and no fresh `checks.lock`. A parked, blocked, stale or unstarted slice keeps the record for `--resume`. The roadmap is the authority. The audit found the data-loss cases: removal before the assumption review, a parked run, an unready slice, an empty roadmap.
- Plan files a review commit swept in are `git rm`ed and committed as `<id>: remove the plan files`; commit-now never stages `docs/planning/`.
- Assumptions kept: entries are never pruned; no code guard on deleting a plan with no entry.
- Findings logged: T367 to T372. T309 closed.

### source-licence-gate

Source licence gate, with thin-code and noman review checks. 2026-11-19, lane S, commit message prefix `source-licence-gate:` (ADR [0017](../adr/0017-source-licence-gate.md)).

- Every outside source gets a row in `docs/SOURCES.md` (SPDX licence, idea-only or copied, what was taken) before it shapes anything; a source with no licence is idea-only. Enforced by `.compliance-rules/licensing.md` (guard-it), a Fit line in `review-it`, and a step in `look-it-up`; `CONTRIBUTING.md` tells contributors.
- `review-it`: unrequested public surface weighs higher, symptom fixes and hard-coded lists are flagged (noman), and three smells (one-use helper, early extraction, wrong abstraction) carry false-positive guards. `deepen-it` checks the same.
- Overlap check against mattpocock/skills found one near-derivative file, `deepen-it/HTML-REPORT.md`; it was rewritten from scratch and the LICENSE notice dropped on the owner's word that nothing is adapted.
- Assumptions kept: lane S; manifest at `docs/SOURCES.md`; `none` means idea-only; no scripted credits check yet; `.compliance-rules/` is safe to add.
- Not done: a scripted credits-to-manifest check; confirming with the ballet and andrej-karpathy-skills authors.
