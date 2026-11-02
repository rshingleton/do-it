---
title: Backlog hardening
approved: 2026-10-25
completed: 2026-10-30
---

# Backlog hardening

## Destination
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

## Milestones

Slices share files (`hooks/lib/guard.mjs`, `scripts/check.mjs`, `skills/ship-it/`),
and concurrent uncommitted work items invalidate each other's audit (T49), so
build one slice at a time, in id order within a milestone.

### M1: The guard holds
Exit: every commit-guard and patch-scan case from the issues has a regression test, and a 3,000-file commit is scanned inside the hook timeout.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R1 | build | Commit guard scans untracked files after an unresolvable `git add`, reads untracked files through textconv, and shares one time budget; guard and scan share one `addedLines` (issues: commit-guard x3, T88) | G1 | none | Three regression tests pass; a 3,000-file staged commit finishes in under the 15 s hook timeout in a test | high | shipped 2026-10-25 commit-guard-hardening |
| R2 | build | An apply_patch `+++ /dev/null` pair is scanned under the old path, and `.env` rules match on Windows separators (issue: embedded dev-null pair, T87) | G1 | none | A test shows the embedded pair cannot exempt a line from a scoped rule; a `app\.env` path is blocked in a test | high | shipped 2026-10-25 guard-patch-paths |
| R3 | build | Hook timeout is validated, and a commit message without `<id>: ` warns, never blocks (T89 timeout part, T71) | G1 | R1 (same file, guard.mjs) | `DO_IT_HOOK_TIMEOUT=abc` falls back to the default in a test; a bad message warns and the commit is allowed | low | shipped 2026-10-25 commit-msg-warn-timeout |

### M2: The tracker keeps its data
Exit: a wrong ref cannot change a plan or an issue, and two sessions creating the same title keep both.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R4 | build | The local tracker refuses refs outside the issues dir and refuses a rewrite that would drop frontmatter, writes atomically and creates with `wx` (issue: local tracker, T86 local part) | G2 | none | A work-item file passed as a ref is left unchanged; two creates of one title give two files | high | shipped 2026-10-25 local-tracker-integrity |
| R5 | build | A GitHub Enterprise ref keeps its host and `gh` gets `-R host/owner/repo`; a partial remote publish returns its created refs (issue: GHE, T86 publish part) | G2 | none | Tests for a github.com and a GHE URL; a publish that fails halfway returns the refs made. Reproduce first: if the GHE issue is already fixed, close it and keep the publish part | med | shipped 2026-10-25 tracker-ghe-publish |
| R6 | enabler | One frontmatter module (split, join, CRLF, flat read and write) under state, the local tracker, skills.mjs and context.mjs (T58) | G2, G5 | R4 (local tracker settled first) | The existing CRLF and quoting regression tests pass against the shared module; the four copies are gone | med | shipped 2026-10-25 frontmatter-module |

### M3: The flow behaves as documented
Exit: a fix round cannot reach audit unverified, and `/retro-it` can read a finished item's candidates.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R7 | build | `build-done` in fix mode requires a passing verify-phase recorded since the fix began (issue: build-done fix mode) | G3 | none | Tests for fix mode with no verify and with a failing verify | med | shipped 2026-10-25 build-done-fix-verify |
| R8 | build | The retro-it offer comes at the ship question, before `work.mjs close` deletes the candidates (issue: guardrail candidates) | G3 | none | A check or test shows the offer precedes close | low | shipped 2026-10-25 retro-offer-at-ship |
| R9 | build | When the next step is a typed skill, the closing line names the slash command and does not offer "do it"; `npm run check` fails the old form (issue: closing line) | G3 | R12 (both edit scripts/check.mjs) | `npm run check` fails a fixture closing line that offers "do it" for a typed skill | low | shipped 2026-10-26 closing-line-slash-command |

### M4: Checks and tests say what they enforce
Exit: `npm run check` rejects every rule the docs claim it enforces, and `npm test` is green under a hostile `HOME` and git config.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R11 | enabler | One test helper: temp HOME and XDG dir, cleared `DO_IT_*`, `GIT_CONFIG_GLOBAL=/dev/null`; the suites use it (T83) | G4 | none | `npm test` passes with `DO_IT_HOOKS=off` and a global `commit.gpgsign=true` set | low | shipped 2026-10-26 test-env-helper |
| R12 | build | `npm run check` fails a spawn cap above its agent's cap, and `carriesVoice` requires the voice marker in the agent file (issues: spawn caps, carriesVoice) | G4 | none | Regression tests for both; the two stale caps (map-it 500, doubt-it 300) are lowered | low | shipped 2026-10-25 spawn-caps-carries-voice |
| R13 | build | `npm run check` fails a skill link that leaves `skills/`, a missing "Use when", a non-`-it` name and a model-invoked skill with no routing entry; SKILL-MECHANICS.md states the main-context-only fan-out rule (T84, T85) | G4 | R12 (same file) | Fixture skills for each failure make `npm run check` exit 1 | med | shipped 2026-10-25 check-skill-rules |
| R14 | build | `ship-it` and `it-core` come under the 100-line budget, and the log-it issue prompt ranks `log-it` first (T80, T79) | G4 | R8, R9 (they edit ship-it and it-core) | `npm run check` reports 0 warnings; routing eval ranks the prompt `log-it` first | low |shipped 2026-10-26 skills-line-budget |
| R15 | build | Tests for install-hooks data loss, adapter request building with a fake fetch, `close` from `building`, and config precedence (T90) | G4 | R11 (the helper) | The new tests pass and fail when the code under test is broken on purpose | med | shipped 2026-10-26 adapter-and-installer-tests |

### M5: Docs and code carry one copy
Exit: `DESIGN.md` has no sections that contradict STATE.md or LANES.md, and no parser path exists that no plan uses.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R16 | build | `DESIGN.md` per-phase `commit:` field and `done` status replaced by links (T56, reworded), LANES.md stops naming the lane S reviewer set (T57), the deletion test lives in design-it with links (T59), scope-it and ship-it name `/map-it <area>` as the context creator (T50, T51) | G5 | none | `npm run check` passes; a grep of the docs finds no `commit-it`, `verify-it` or per-phase commit in a current-model section | low | shipped 2026-10-26 docs-one-copy |
| R17 | build | The plan parser drops its flow-map and multi-line path (T60) | G5 | R6 (frontmatter module settled) | `npm test` passes with the legacy path removed; `block.mjs` is about 120 lines shorter | low | shipped 2026-10-26 plan-parser-block-only, Verify unmet: `block.mjs` is about 120 lines shorter (72 measured, 360 to 288) |

### M6: OpenCode and tokens, measured
Exit: an OpenCode session computes its context once, and the token savings claims are backed by a recorded A/B result.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R18 | spike | A ledger before/after of the `it-*` runs, with its method and verdict, replaces the inconclusive verdict in `docs/research/caveman-baseline.md` (issue: prove or refute token savings; the paired headless A/B stays open, needs an API key for an isolated run); throwaway code removed | G6 | none | Results and method are in `docs/research/` with a linked verdict | med | shipped 2026-10-26 terse-voice-ab-harness |
| R19 | build | The OpenCode plugin computes the code map and doc resolution once per session, or caches them by HEAD and index mtime, and the full-versus-reminder choice is decided from a measured 10-turn session (issue: OpenCode per-turn context, T46) | G6 | none | A test calls the context hook twice and the second call does not re-run the map; the decision is recorded in `docs/DESIGN.md` section 8 | med | shipped 2026-10-26 opencode-context-cache |
| R20 | build | `/setup-it` checks that `opencode.json` sets `external_directory` to `ask` or `deny` and offers to add it (T77) | G6 | none | A test or fixture run shows the check flags `allow` and a missing key | low | shipped 2026-10-26 setup-it-external-directory |
| R21 | build | OpenCode usage is recorded into the shared ledger from the `event` hook (1.x) and `ctx.event.subscribe` (2.x) (issue: per-step usage, OpenCode checkbox) | G6 | D1 (is cost wanted) | A fixture OpenCode event stream produces a ledger row that `usage-it` reports | med | shipped 2026-10-26 opencode-usage-ledger |

### M7: No finding is lost at ship
Exit: a ship that follows an audit with Should or Nice findings, or a slice that surfaced product defects, offers each to `log-it` and states an unmet verify clause before the roadmap row is marked shipped.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R22 | build | ship-it's one question lists the audit's Should and Nice findings and offers to log them as to-dos (default: log), and prove-it's Route names that home; a repo with a changelog keeps today's behaviour (issue: ship-it should offer to log the audit's findings) | G7 | R14 (ship-it must be under its line budget before it grows) | A fixture audit with two Should findings and no changelog produces the offer and two `log-it` to-dos; `npm run check` reports 0 warnings | low | shipped 2026-10-26 audit-leftovers-at-ship |
| R23 | build | A work item records surfaced defects (`work.mjs` state field), scope-it adds a file-defects step for a slice whose verify compares or measures, build-it records them as they appear, and ship-it lists them in the same question and states an unmet roadmap verify clause (issue: surfaced product defects) | G7 | R22 (same ship-it question) | A fixture slice with two surfaced defects: the ship question lists both, `log-it` files them with `source: <work id>`, and the roadmap row is not marked shipped without the unmet-verify note | med | shipped 2026-10-26 surfaced-defects-at-ship |

### M8: Decisions are asked, not skipped
Exit: a roadmap with an open decision that blocks a slice makes `work.mjs roadmap` report it with the slices it blocks, and `/do-it <file>` asks it before it starts any later slice.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R24 | build | `work.mjs roadmap` reports `blocking: [{id, blocks}]` beside `next`; roadmap-it §6 and do-it §1 and §4 ask each blocking decision (a grill-it round with a recommended answer) at roadmap start and at each ship, and settling one removes it from Open decisions with a dated Decisions line (issue: open roadmap decisions are never asked) | G8 | none | A test: a decision blocking two slices appears with both; a pin that roadmap-it and do-it name the ask; `npm test && npm run check` pass | med | shipped 2026-10-26 open-decisions-asked |

### M9: Guard and OpenCode usage leftovers
Exit: the in-hunk pair is scanned under its old path, and OpenCode v2 usage rows name their agent and prune once a run.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R25 | build | Added lines after an in-hunk `--- <old>` / `+++ /dev/null` pair in `unifiedFiles` are also scanned under `<old>` and `''`, reusing the `applyPatchFiles` flag (issue: unified in-hunk dev-null pair) | G9 | none | A test shows the in-hunk pair cannot exempt a line from a scoped rule or an `exceptFilePattern` | high | shipped 2026-10-26 unified-in-hunk-dev-null |
| R26 | build | OpenCode v2 usage rows record the context-hook agent name, and `prune` runs once a day change, not per step (T113, T114) | G6 | none | The v2 fixture test asserts agent `build`, and a 200-step stream calls `prune` once | low | shipped 2026-10-26 opencode-usage-agent-prune |
| R27 | spike | The paired headless A/B of the terse voice on an isolated, logged-in run, with its quality check and a verdict that replaces the not-proven one; throwaway harness removed (issue: prove or refute token savings) | G6 | D2 (is an API key available) | Results and method in `docs/research/` with a linked verdict | med | shipped 2026-10-27 voice-ab-harness |

## Open decisions
None.

## Fog
- Scoping each work item's fingerprint and audit diff to its own paths (T49): may become a slice once concurrent items are routine.
- Trimming passing-test output and guarding whole-file rewrites (T81, T82): unproven; revisit after R18 shows where tokens go.
- Usage windows that straddle a reset (T76): label them run-based or split by message time.
- A tracker doctor and an install doctor (T3, T78): may become one `/setup-it` check slice.
- Running `/setup-it` on another repo (T2): a user-run check, not a build slice.
- Confirming the OpenCode v2 `session.step.ended` field names on a live OpenCode 2 (T115): a user-run check; a mismatch becomes a slice.
- A `work.mjs` per-step usage field (closed per-step usage issue, state field only): deferred until the ledger's window attribution proves too coarse.

## Out of scope
- The research-derived ideas T13 to T32 and T44, T45, T47, T62: parked 2026-10-25; return through T47 when an audit or retro cites one.
- Dropping or folding `doubt-it` (T39 dropped 2026-10-25: keep it and `prove-it --since`).
- New features before M5 (T64): removals come first.

## Decisions so far
- 2026-10-25 Decision: keep `doubt-it` and `prove-it --since`; T39 dropped.
- 2026-10-25 Decision: do removal and correctness work before new features (T64).
- 2026-10-25 Decision: narrow T2 to `/setup-it` on another repo.
- 2026-10-25 Decision: park T13 to T32 until evidence.
- 2026-10-25 Decision: findings that reach ship (audit leftovers, defects a verify slice surfaces) get their own milestone M7 after M4, since both edit ship-it's question and ship-it must first fit its line budget (R14).
- 2026-10-26 Decision: D1 settled: the usage ledger records tokens only, never cost (prices change; usage-it can apply a price table when reporting). R21 is unblocked. (ADR [0009](../adr/0009-usage-ledger-records-tokens-only.md))
- 2026-10-26 Replan: destination moved by two requirements (G8, G9) from the issues still open after M7; M8 comes first because the stranded-decision bug would hide D2 and any later decision.
- 2026-10-27 Decision: D2 settled: `claude` is logged in on this machine, so R27 runs. The earlier harness failed because an isolated config dir was not logged in, so R27's first step is to find a way to isolate the two arms' agents and hooks that keeps the login (a copied or linked credential, or `--plugin-dir`); if none works, R27 is re-scoped, not dropped. R27 is unblocked.

## Shipped
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
