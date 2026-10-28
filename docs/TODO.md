# To-do

Nice-to-haves and things to circle back to. Managed by log-it; edit freely.
Closed items are removed: the changelog, the commit or git history keeps them.

Next id: T131

## Open

- [ ] T2 Dogfood /setup-it on another repo (/do-it has already run on this one, see T49) `circle-back` (session 2026-10-19; narrowed 2026-10-25)
- [ ] T3 Add a tracker.mjs doctor command that checks gh auth or a Jira /myself call, so setup-it verifies reachability `nice-to-have` (session 2026-10-19)
- [ ] T4 Add a provenance check script that flags skill text copied from known source repos `nice-to-have` (session 2026-10-19)
- [ ] T6 setup-it writes DO_IT_PROTECTED_BRANCHES from the remote's default branch when it is not main or master `nice-to-have` (skills/setup-it)
- [ ] T7 debug-it routes a "no honest seam for the regression test" finding to log-it or deepen-it `nice-to-have` (skills/debug-it/SKILL.md)
- [ ] T10 Add paraphrased prompt variants to the routing eval to test robustness `idea` (evals/routing.json)
- [ ] T13 scope-it plans gain per-phase Interfaces (consumes/produces) and plan-level Global constraints for parallel phases `idea` (research: superpowers writing-plans)
- [ ] T14 scope-it clarify pass: a fixed gap checklist, high-impact questions one at a time, answers kept in a dated Clarifications section `idea` (research: spec-kit clarify)
- [ ] T16 prove-it REPORT: an explicit never-a-finding list and a "cannot verify from the diff" bucket resolved before the verdict `idea` (research: claude-code feature-dev, superpowers)
- [ ] T17 prove-it: extra reviewer lenses chosen from what the diff contains (tests, silent failures, new types) `idea` (research: claude-code pr-review-toolkit)
- [ ] T18 review-it applies a standards file only to changed files under its directory (monorepos) `idea` (research: claude-code code-review)
- [ ] T19 prove-it round 3: one fresh fix pass on a higher-tier model with earlier attempts' notes before asking the user `idea` (research: superpowers SDD)
- [ ] T20 build-it PARALLEL: pre-flight table of phase pairs sharing a file or interface; DONE_WITH_CONCERNS and NEEDS_CONTEXT statuses `idea` (research: superpowers SDD)
- [ ] T22 Short red-flag tables for test-it, debug-it, build-it and ship-it, built from failures we actually observe `idea` (research: superpowers TDD; DESIGN.md section 9)
- [ ] T23 Behaviour evals: pressure scenarios (time, sunk cost, authority) for test-it, prove-it and ship-it's no-commit rule `idea` (research: superpowers writing-skills, skill-creator)
- [ ] T24 Handle incoming review feedback (PR comments): verify each item against the code, clarify unclear ones before changing anything `idea` (research: superpowers receiving-code-review)
- [ ] T25 MEDIUM dangerous-pattern warnings in checks.mjs (eval, shell=True, innerHTML, TLS verify off), once per session per file `idea` (research: claude-code security-guidance)
- [ ] T26 checks.json rules for Bash commands (git push --force, rm -rf) via an event field `idea` (research: claude-code hookify)
- [ ] T27 A Stop hook that warns when a building item edited code but no test command ran `idea` (research: claude-code hookify)
- [ ] T28 Use the hook if: filter so the commit scan does not start node on every Bash call `idea` (research: claude-code security-guidance)
- [ ] T29 retro-it mines session transcripts for explicit user corrections and turns them into candidate rules `idea` (research: hookify conversation-analyzer, superpowers diagnosing)
- [ ] T30 Read-only reviewer agents (agents/ with restricted tools and model) generated from the skill briefs, like gen-opencode `idea` (research: claude-code plugins)
- [ ] T31 Bugfix plans list behaviour that must not change, feeding regression seams `idea` (research: Kiro bugfix specs)
- [ ] T32 Path-scoped standards files that load only when matching files are edited `idea` (research: Kiro steering)
- [ ] T44 Explore: move shared config and doc resolution from skills/track-it/scripts into a top-level lib/ `question` (deepen-it 2026-10-19, candidate 6)
- [ ] T45 Explore: merge map-it with sweep-it as a single skill with modes `question` (deepen-it 2026-10-19, candidate 7; not recommended now; the log-it and todo-it half shipped as single-intake)
- [ ] T46 Code map in large repos: cache the map keyed by HEAD and index mtime so subagent starts reuse it, and fall back to tracked files only (no untracked walk) when the 1.5 s timeout hits `idea` (hooks/lib/codemap.mjs; codemap-containers review)
- [ ] T47 Explore self-improving mechanisms for the skill base: review the references, then decide what fits (e.g. extend retro-it, feed audit findings and user corrections back into skills, checks and evals) `question` (user 2026-10-19; after the current plans)
  - References: https://github.com/BerriAI/self-improving-agent, https://github.com/microsoft/Trace, https://github.com/XMUDeepLIT/Awesome-Self-Evolving-Agents, https://github.com/selfimproving-agent/awesome-Self-Improving-Agents
  - Related: T29 (retro-it mines transcripts for corrections), T22 (red-flag tables from observed failures), T23 (behaviour evals), T10 (routing eval variants).
- [ ] T49 Concurrent uncommitted work items: each fingerprint hashes the whole change since its base, so fixing one item invalidates every other item's audit. Scope the fingerprint (and the auditors' diff) to the item's own paths, e.g. a `paths:` field filled as build-it touches files `idea` (do-it run 2026-10-19: three items, one base, no commits)
- [ ] T62 The lifecycle stops at a local commit: no skill owns push or PR (body, protected-branch check), changelog version headings, or carrying out ship-it's rollback note `idea` (docs/reference-audit/2026-10-19-repo.md, finding 20; T24 covers PR feedback)
- [ ] T64 Review the to-do list for additive ideas versus simplification: most open items add features, while removing duplication would save roughly 150 to 250 lines `question` (docs/reference-audit/2026-10-19-repo.md)
- [ ] T76 usage-it windows (`--from/--to`, `--hours`) count a whole run by its last message time, so a session that straddles a window edge (a weekly reset) is counted entirely inside it; split by per-message timestamps from the transcript, or label the window as run-based `debt` (found checking usage against the 3am weekly reset, session 2026-10-22)
- [ ] T78 An install doctor (Node >= 18, host, agent and skill symlink health, hook registration, `checks.json` validity); extends T3's tracker-only doctor `idea` (handoff review 2026-10-25)
- [ ] T81 Trim passing-test noise from `npm test` and build output before it reaches the model; feasibility first, since Claude Code's PostToolUse hook may not rewrite Bash output (T27 is the related hook) `question` (handoff review 2026-10-25, unproven)
- [ ] T82 Pre-edit guard against whole-file rewrites of large files (over 300 lines or 25 KB), steering to targeted edits; weigh against generated files and the cost of false blocks `question` (handoff review 2026-10-25, unproven)
- [ ] T103 Consider `node --test --import ./tests/env.mjs` in the `npm test` script instead of the per-suite import line; it couples the helper to the test command `idea` (test-env-helper audit, package.json)
- [ ] T107 The prove-it Architecture brief and sweep-it LENSES item 8 only link design-it for the deletion test, so a pointer-only agent may not open it; decide whether one sentence belongs inline `nice-to-have` (docs-one-copy audit, skills/prove-it/ARCHITECTURE.md:9)
- [ ] T110 The usage-ledger rows behind `docs/research/terse-voice-ledger.md` live in `~/.claude` and roll off after 30 days, so its table cannot be recomputed later; snapshot the `it-*` rows if the verdict is cited again `debt` (terse-voice-ab-harness audit, docs/research/terse-voice-ledger.md)
- [ ] T115 A v2 `session.step.ended` without `assistantMessageID` is dropped, so a live field-name difference gives zero rows; confirm the shape on a live OpenCode 2 `debt` (opencode-usage-ledger audit, skills/usage-it/scripts/opencode.mjs:99)
- [ ] T117 The v2 `ctx.event.subscribe` loop gets a signal that is never aborted, so it cannot stop when the plugin is disposed `nice-to-have` (opencode-usage-ledger audit, .opencode/plugins/do-it.mjs:149)
- [ ] T130 The `prune` and `now` test seams sit in the public `createOpenCodeUsage` signature; judgement only `nice-to-have` (opencode-usage-agent-prune audit, skills/usage-it/scripts/opencode.mjs:20)
- [ ] T131 The eval-routing CLI test in `tests/scripts-regressions.test.mjs` hand-rolls its copy-and-spawn runner; a `checkWith`-style helper could serve both it and the check.mjs tests `nice-to-have` (routing-missing-entry audit, tests/scripts-regressions.test.mjs:396)
- [ ] T132 In the missing-entry unit case, `entry` holds the full skills map but is also indexed per skill; `specs` would read better `nice-to-have` (routing-missing-entry audit, tests/codemap-routing.test.mjs:224)
- [ ] T133 `addLine` in `unifiedFiles` takes a boolean `pair` flag that decides whether the `''` scan runs; a reader must trace the caller `nice-to-have` (unified-files-state audit, hooks/lib/checks.mjs:262)
- [ ] T134 An in-hunk `+++ <path>` line (not dev-null) is now scanned under its own pair path, and no test pins it `nice-to-have` (unified-files-state audit, tests/hooks-regressions.test.mjs:316)
