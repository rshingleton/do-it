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
- G7: A finding the flow surfaces (an audit's Should and Nice, a product defect a verify slice exposes) is offered to `log-it` at ship, not lost when the plan is deleted, and a slice whose verify clause is unmet says so.

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

## Open decisions
None.

## Fog
- Scoping each work item's fingerprint and audit diff to its own paths (T49): may become a slice once concurrent items are routine.
- Trimming passing-test output and guarding whole-file rewrites (T81, T82): unproven; revisit after R18 shows where tokens go.
- Usage windows that straddle a reset (T76): label them run-based or split by message time.
- A tracker doctor and an install doctor (T3, T78): may become one `/setup-it` check slice.
- Running `/setup-it` on another repo (T2): a user-run check, not a build slice.
- Issues no slice covers yet: `Unified in-hunk dev-null header pair` (R2's twin in `unifiedFiles`; a guard slice).

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
- 2026-10-26 Decision: D1 settled: the usage ledger records tokens only, never cost (prices change; usage-it can apply a price table when reporting). R21 is unblocked.

## Changes
- 2026-10-25: charted from the open issues, the backlog and the 2026-10-19 audit.
- 2026-10-25: R1 shipped as commit-guard-hardening (`addedLines` diffs plain text in chunks: 3,000 staged files 31.7 s before, a few seconds now).
- 2026-10-25: R2 shipped as guard-patch-paths (an embedded `+++ /dev/null` pair scans under its old path and `''`; `scan` reads `\` as `/`; the in-hunk twin in `unifiedFiles` filed as an issue).
- 2026-10-25: R3 shipped as commit-msg-warn-timeout (`hookTimeout` falls back to 20 s; a `-m` message without `<id>: ` warns as PreToolUse context on Claude Code, OpenCode has no channel for it; T71 closed, T89 keeps its other gaps).
- 2026-10-25: R4 shipped as local-tracker-integrity (a local ref must be an `.md` inside the issues dir; `comment` and `start` refuse a file with no or non-flat frontmatter; rewrites go through temp plus rename; `create` opens with `wx`; T86 local part closed, its GHE and publish parts stay with R5).
- 2026-10-25: R5 shipped as tracker-ghe-publish (`parseRef` keeps a non-github.com host so `gh` gets `-R host/owner/repo`; a failed GitHub or Jira `publish` returns the refs made plus `error` and the CLI exits 1; the GHE issue was reproduced first, not already fixed; T86 closed).
- 2026-10-25: R6 shipped as frontmatter-module (`skills/track-it/scripts/frontmatter.mjs`: split, join, flat read and write; five copies removed, one more than the roadmap counted: block.mjs, the local tracker, skills.mjs, context.mjs, check.mjs; a comment line no longer folds into the key above it; T58 closed). M2 is complete.
- 2026-10-25: R7 shipped as build-done-fix-verify (a fix-mode `phase-done` records `fix_verified`; `build-done` refuses without it; `audit-fail`, `reject-assumption` and `replan` clear it; lane M verifies any phase).
- 2026-10-25: R12 shipped as spawn-caps-carries-voice (`npm run check` fails a spawn paragraph whose `N words` cap exceeds the lowest `Cap:` of the `it-*` agents it names; map-it 500 to 300, doubt-it 300 to 200; `carriesVoice` needs the voice marker in the agent file and fails open on a read error; audit leftovers filed as T91-T93 and an issue on logging them at ship).
- 2026-10-25: R13 shipped as check-skill-rules (`check.mjs` fails a `skills/` link that leaves `skills/`, a model-invoked description without "Use when", and a name with no `it` segment; a skill with no routing entry is now a routing-eval failure; doubt-it, guard-it and sweep-it reworded to "Use when"; T84 closed; T85 was already satisfied by SKILL-MECHANICS.md; audit leftovers T94, T95).
- 2026-10-25: status sync after R13: T86 removed from the to-do list (R4 and R5 closed it); README and DESIGN `check.mjs` lines list the new rules; three uncovered issues added to Fog. The roadmap has no R10 and git history never held one; the id gap is left as is.
- 2026-10-25: replan: added G7 and M7 with R22 (audit leftovers offered at ship) and R23 (surfaced defects recorded and offered at ship); the two ship-it issues leave Fog; shipped slices untouched.
- 2026-10-25: R8 shipped as retro-offer-at-ship (the `/retro-it <id>` offer moved from the closing message to the ship question, before `work.mjs close` deletes the candidates; a test pins the order).
- 2026-10-26: R9 shipped as closing-line-slash-command (it-core says a typed skill is named by its slash command, not "do it"; `npm run check` fails a `Next:` line that offers "do it" beside a user-invoked skill; the existing closing lines already used the slash form).
- 2026-10-26: R14 shipped as skills-line-budget (ship-it 114 to 97 lines: lane XS and resumed-after-review moved to RESUME.md, rollback note to DOCS.md; it-core 103 to 97; log-it, look-it-up, track-it and map-it descriptions reworded so the routing eval is 100% and the file-an-issue prompt ranks log-it first; T79, T80 closed; audit Nice leftovers: none filed).
- 2026-10-26: R22 shipped as audit-leftovers-at-ship (with no changelog, ship-it's question lists the audit's Should and Nice findings and question 2 offers to log them as to-dos, default log, via DOCS.md "Audit findings" and `log-it` with `source: <work id> audit`; prove-it's Route names the same home; a pin test; the source issue closed; audit leftovers filed as T96, T97). D1 settled earlier the same day: tokens only.
- 2026-10-26: R23 shipped as surfaced-defects-at-ship (work items carry a settable `defects` list; scope-it adds a file-defects step for a slice whose Verify compares or measures, build-it records defects as they appear and delegated reports carry them, ship-it's question lists them and offers to log them with `source: <work id>`, and a row with unmet Verify is written `shipped <date> <id>, Verify unmet: <clause>` with issue refs; pin tests; the source issue closed; audit leftovers filed as T98, T99).
- 2026-10-26: R11 shipped as test-env-helper (`tests/env.mjs` gives every suite a temp HOME and XDG dir, no `DO_IT_*`/`JIRA_*`/`GITHUB_*` variables and `GIT_CONFIG_GLOBAL=/dev/null`, and `cleanEnv()` hands a spawned process its own empty HOME; a test proves a hostile environment does not reach git or children; `decide` and `hook-trust` drop their copies; `npm test` passes with `DO_IT_HOOKS=off` and a global `commit.gpgsign=true`; T83 closed; audit leftovers filed as T100 to T103).
- 2026-10-26: R15 shipped as adapter-and-installer-tests (new `installer`, `adapters` and `config-precedence` suites and a `close`-from-building CLI test: a commented settings.json is refused byte-identical, `--dry-run` writes nothing, Jira and GitHub create/get/comment/close request building against recording fakes, config layers user, project, local, env with guarded keys held back; each fails when its code is broken on purpose; T90 closed; audit leftovers filed as T104, T105).
- 2026-10-26: R16 shipped as docs-one-copy (DESIGN.md section 4 links STATE.md, PLAN-FORMAT.md and ADR 0002 instead of the per-phase commit model; lane S skips only Architecture; LANES.md stops naming the lane S reviewer set; the deletion test lives in design-it and prove-it, sweep-it and review-it link to it; scope-it lists the `/map-it <area>` step at approval and ship-it proposes it instead of creating a context file; T50, T51, T56, T57, T59 closed; audit leftovers filed as T106 to T109).
- 2026-10-26: R17 shipped as plan-parser-block-only (`parseBlock` reads block style, one-line scalar lists, `{}` and quoted scalars; flow maps, nested flow and brackets spanning lines now throw "rewrite in block style"; `block.mjs` 360 to 288 lines, 72 shorter, short of the roadmap's about 120 because the writer's own list and quote shapes must still read; Verify unmet on that size clause; T60 closed; audit Nice leftovers not filed).
- 2026-10-26: R18 shipped as terse-voice-ab-harness, replanned: the headless A/B could not run (an isolated `claude -p` is not logged in and no API key was set), so `docs/research/terse-voice-ledger.md` compares 418 real `it-*` ledger runs before and after `35df34e` and finds it not proven (only `it-reviewer` same-day is comparable: turns and output flat, cache write 12% and read 8% lower); the issue stays open for the paired A/B; audit leftover filed as T110.
- 2026-10-26: R19 shipped as opencode-context-cache (the OpenCode plugin builds the session context once per plugin instance and rebuilds it when `.git/HEAD`, its reflog or `.git/index` change, on both the 1.x and 2.x hooks; a scripted 10-turn drive measured 153 ms rebuilt every turn against 13 ms cached at 5,022 bytes a turn, so the full text stays each turn to keep the provider prefix cache; DESIGN.md section 8 records it; the source issue closed; T46 stays open for subagent-start reuse and the timeout fallback; audit leftovers filed as T111, T112).
- 2026-10-26: R20 shipped as setup-it-external-directory (`skills/setup-it/scripts/opencode-check.mjs` reads `opencode.json` or `.jsonc` and flags `allow`, a missing key or a string `permission`; PROPOSAL.md section 6 offers `ask` and shows a snippet instead of rewriting a file with comments; tests in `tests/opencode-check.test.mjs`; T77 closed; audit Nice leftovers not filed).
- 2026-10-26: R21 shipped as opencode-usage-ledger (`skills/usage-it/scripts/opencode.mjs` turns v1 `message.updated` and `session.created`, and v2 `session.step.ended` plus the `context` hook's agent and model, into the same per-run ledger rows; tokens only per D1; `tests/opencode-usage.test.mjs` drives fixture streams through `usage.mjs`; event shapes not run on a live OpenCode; the issue stays open for the `work.mjs` state field; audit leftovers filed as T113 to T120).
