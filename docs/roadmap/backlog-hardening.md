---
title: Backlog hardening
approved: 2026-10-25
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
| R6 | enabler | One frontmatter module (split, join, CRLF, flat read and write) under state, the local tracker, skills.mjs and context.mjs (T58) | G2, G5 | R4 (local tracker settled first) | The existing CRLF and quoting regression tests pass against the shared module; the four copies are gone | med | |

### M3: The flow behaves as documented
Exit: a fix round cannot reach audit unverified, and `/retro-it` can read a finished item's candidates.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R7 | build | `build-done` in fix mode requires a passing verify-phase recorded since the fix began (issue: build-done fix mode) | G3 | none | Tests for fix mode with no verify and with a failing verify | med | |
| R8 | build | The retro-it offer comes at the ship question, before `work.mjs close` deletes the candidates (issue: guardrail candidates) | G3 | none | A check or test shows the offer precedes close | low | |
| R9 | build | When the next step is a typed skill, the closing line names the slash command and does not offer "do it"; `npm run check` fails the old form (issue: closing line) | G3 | R12 (both edit scripts/check.mjs) | `npm run check` fails a fixture closing line that offers "do it" for a typed skill | low | |

### M4: Checks and tests say what they enforce
Exit: `npm run check` rejects every rule the docs claim it enforces, and `npm test` is green under a hostile `HOME` and git config.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R11 | enabler | One test helper: temp HOME and XDG dir, cleared `DO_IT_*`, `GIT_CONFIG_GLOBAL=/dev/null`; the suites use it (T83) | G4 | none | `npm test` passes with `DO_IT_HOOKS=off` and a global `commit.gpgsign=true` set | low | |
| R12 | build | `npm run check` fails a spawn cap above its agent's cap, and `carriesVoice` requires the voice marker in the agent file (issues: spawn caps, carriesVoice) | G4 | none | Regression tests for both; the two stale caps (map-it 500, doubt-it 300) are lowered | low | |
| R13 | build | `npm run check` fails a skill link that leaves `skills/`, a missing "Use when", a non-`-it` name and a model-invoked skill with no routing entry; SKILL-MECHANICS.md states the main-context-only fan-out rule (T84, T85) | G4 | R12 (same file) | Fixture skills for each failure make `npm run check` exit 1 | med | |
| R14 | build | `ship-it` and `it-core` come under the 100-line budget, and the log-it issue prompt ranks `log-it` first (T80, T79) | G4 | R8, R9 (they edit ship-it and it-core) | `npm run check` reports 0 warnings; routing eval ranks the prompt `log-it` first | low | |
| R15 | build | Tests for install-hooks data loss, adapter request building with a fake fetch, `close` from `building`, and config precedence (T90) | G4 | R11 (the helper) | The new tests pass and fail when the code under test is broken on purpose | med | |

### M5: Docs and code carry one copy
Exit: `DESIGN.md` has no sections that contradict STATE.md or LANES.md, and no parser path exists that no plan uses.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R16 | build | `DESIGN.md` per-phase `commit:` field and `done` status replaced by links (T56, reworded), LANES.md stops naming the lane S reviewer set (T57), the deletion test lives in design-it with links (T59), scope-it and ship-it name `/map-it <area>` as the context creator (T50, T51) | G5 | none | `npm run check` passes; a grep of the docs finds no `commit-it`, `verify-it` or per-phase commit in a current-model section | low | |
| R17 | build | The plan parser drops its flow-map and multi-line path (T60) | G5 | R6 (frontmatter module settled) | `npm test` passes with the legacy path removed; `block.mjs` is about 120 lines shorter | low | |

### M6: OpenCode and tokens, measured
Exit: an OpenCode session computes its context once, and the token savings claims are backed by a recorded A/B result.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R18 | spike | The terse-voice A/B harness runs and its method and result replace the inconclusive verdict in `docs/research/caveman-baseline.md` (issue: prove or refute token savings); throwaway code removed | G6 | none | Results and method are in `docs/research/` with a linked verdict | med | |
| R19 | build | The OpenCode plugin computes the code map and doc resolution once per session, or caches them by HEAD and index mtime, and the full-versus-reminder choice is decided from a measured 10-turn session (issue: OpenCode per-turn context, T46) | G6 | none | A test calls the context hook twice and the second call does not re-run the map; the decision is recorded in `docs/DESIGN.md` section 8 | med | |
| R20 | build | `/setup-it` checks that `opencode.json` sets `external_directory` to `ask` or `deny` and offers to add it (T77) | G6 | none | A test or fixture run shows the check flags `allow` and a missing key | low | |
| R21 | build | OpenCode usage is recorded into the shared ledger from the `event` hook (1.x) and `ctx.event.subscribe` (2.x) (issue: per-step usage, OpenCode checkbox) | G6 | D1 (is cost wanted) | A fixture OpenCode event stream produces a ledger row that `usage-it` reports | med | |

## Open decisions
- D1: Does the usage ledger record cost, or stay tokens only (prices change)? Answer by: grill with the user when R21 is next. Blocks R21.

## Fog
- Scoping each work item's fingerprint and audit diff to its own paths (T49): may become a slice once concurrent items are routine.
- Trimming passing-test output and guarding whole-file rewrites (T81, T82): unproven; revisit after R18 shows where tokens go.
- Usage windows that straddle a reset (T76): label them run-based or split by message time.
- A tracker doctor and an install doctor (T3, T78): may become one `/setup-it` check slice.
- Running `/setup-it` on another repo (T2): a user-run check, not a build slice.

## Out of scope
- The research-derived ideas T13 to T32 and T44, T45, T47, T62: parked 2026-10-25; return through T47 when an audit or retro cites one.
- Dropping or folding `doubt-it` (T39 dropped 2026-10-25: keep it and `prove-it --since`).
- New features before M5 (T64): removals come first.

## Decisions so far
- 2026-10-25 Decision: keep `doubt-it` and `prove-it --since`; T39 dropped.
- 2026-10-25 Decision: do removal and correctness work before new features (T64).
- 2026-10-25 Decision: narrow T2 to `/setup-it` on another repo.
- 2026-10-25 Decision: park T13 to T32 until evidence.

## Changes
- 2026-10-25: charted from the open issues, the backlog and the 2026-10-19 audit.
- 2026-10-25: R1 shipped as commit-guard-hardening (`addedLines` diffs plain text in chunks: 3,000 staged files 31.7 s before, a few seconds now).
- 2026-10-25: R2 shipped as guard-patch-paths (an embedded `+++ /dev/null` pair scans under its old path and `''`; `scan` reads `\` as `/`; the in-hunk twin in `unifiedFiles` filed as an issue).
- 2026-10-25: R3 shipped as commit-msg-warn-timeout (`hookTimeout` falls back to 20 s; a `-m` message without `<id>: ` warns as PreToolUse context on Claude Code, OpenCode has no channel for it; T71 closed, T89 keeps its other gaps).
- 2026-10-25: R4 shipped as local-tracker-integrity (a local ref must be an `.md` inside the issues dir; `comment` and `start` refuse a file with no or non-flat frontmatter; rewrites go through temp plus rename; `create` opens with `wx`; T86 local part closed, its GHE and publish parts stay with R5).
- 2026-10-25: R5 shipped as tracker-ghe-publish (`parseRef` keeps a non-github.com host so `gh` gets `-R host/owner/repo`; a failed GitHub or Jira `publish` returns the refs made plus `error` and the CLI exits 1; the GHE issue was reproduced first, not already fixed; T86 closed).
