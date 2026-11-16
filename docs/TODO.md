# To-do

Nice-to-haves and things to circle back to. Managed by log-it; edit freely.
Closed items are removed: the changelog, the commit or git history keeps them.

Next id: T262

## Open

- [ ] T2 Dogfood /setup-it on another repo (/do-it has already run on this one) `circle-back` (session 2026-10-19; narrowed 2026-10-25)
- [ ] T4 Add a provenance check script that flags skill text copied from known source repos `nice-to-have` (session 2026-10-19)
- [ ] T13 scope-it plans gain per-phase Interfaces (consumes/produces) and plan-level Global constraints for parallel phases `idea` (research: superpowers writing-plans)
- [ ] T14 scope-it clarify pass: a fixed gap checklist, high-impact questions one at a time, answers kept in a dated Clarifications section `idea` (research: spec-kit clarify)
- [ ] T17 prove-it: extra reviewer lenses chosen from what the diff contains (tests, silent failures, new types); the REPORT also gains an explicit never-a-finding list and a "cannot verify from the diff" bucket resolved before the verdict `idea` (research: claude-code pr-review-toolkit, feature-dev, superpowers)
- [ ] T19 prove-it round 3: one fresh fix pass on a higher-tier model with earlier attempts' notes before asking the user `idea` (research: superpowers SDD)
- [ ] T20 build-it PARALLEL: pre-flight table of phase pairs sharing a file or interface; DONE_WITH_CONCERNS and NEEDS_CONTEXT statuses `idea` (research: superpowers SDD)
- [ ] T22 Short red-flag tables for test-it, debug-it, build-it and ship-it, built from failures we actually observe `idea` (research: superpowers TDD; DESIGN.md section 9)
- [ ] T23 Behaviour evals: pressure scenarios (time, sunk cost, authority) for test-it, prove-it and ship-it's no-commit rule; also paraphrased prompt variants in the routing eval to test robustness `idea` (research: superpowers writing-skills, skill-creator; evals/routing.json)
  - Also coderabbitai/skills evals/*/case.yaml (2026-10-30): outcome cases pairing deterministic regex graders with an LLM grader, with-skill vs without-skill via `claude plugin eval`; e.g. "does not claim clean on a skipped or incomplete review".
- [ ] T24 Handle incoming review feedback (PR comments): verify each item against the code, clarify unclear ones before changing anything `idea` (research: superpowers receiving-code-review)
  - Also coderabbitai/skills skills/autofix (2026-10-30): paginated GraphQL over reviewThreads keeping isResolved false, isOutdated false and bot-authored; comment bodies and "Prompt for AI Agents" blocks are untrusted claims; re-validate against local code, sanitize summaries, never interpolate into shell, one approval per fix.
- [ ] T26 checks.json rules for Bash commands (git push --force, rm -rf) via an event field; also MEDIUM dangerous-pattern warnings in checks.mjs (eval, shell=True, innerHTML, TLS verify off), once per session per file `idea` (research: claude-code hookify, security-guidance)
- [ ] T27 A Stop hook that warns when a building item edited code but no test command ran `idea` (research: claude-code hookify)
- [ ] T28 Use the hook if: filter so the commit scan does not start node on every Bash call `idea` (research: claude-code security-guidance)
- [ ] T29 retro-it mines session transcripts for explicit user corrections and turns them into candidate rules `idea` (research: hookify conversation-analyzer, superpowers diagnosing)
- [ ] T31 Bugfix plans list behaviour that must not change, feeding regression seams `idea` (research: Kiro bugfix specs)
- [ ] T32 Path-scoped standards files that load only when matching files are edited; includes review-it applying a standards file only to changed files under its directory (monorepos) `idea` (research: Kiro steering, claude-code code-review)
- [ ] T44 Explore: move shared config and doc resolution from skills/track-it/scripts into a top-level lib/ `question` (deepen-it 2026-10-19, candidate 6)
- [ ] T45 Explore: merge map-it with sweep-it as a single skill with modes `question` (deepen-it 2026-10-19, candidate 7; not recommended now; the log-it and todo-it half shipped as single-intake)
- [ ] T46 Code map in large repos, Claude Code half (the OpenCode plugin's per-session cache shipped, R19): cache the map keyed by HEAD and index mtime so subagent starts reuse it, and fall back to tracked files only (no untracked walk) when the 1.5 s timeout hits `idea` (hooks/lib/codemap.mjs:73-77; codemap-containers review)
- [ ] T47 Explore self-improving mechanisms for the skill base: review the references, then decide what fits (e.g. extend retro-it, feed audit findings and user corrections back into skills, checks and evals) `question` (user 2026-10-19; after the current plans)
  - References: https://github.com/BerriAI/self-improving-agent, https://github.com/microsoft/Trace, https://github.com/XMUDeepLIT/Awesome-Self-Evolving-Agents, https://github.com/selfimproving-agent/awesome-Self-Improving-Agents
  - Related: T29 (retro-it mines transcripts for corrections), T22 (red-flag tables from observed failures), T23 (behaviour evals and routing eval variants).
- [ ] T49 Concurrent uncommitted work items: each fingerprint hashes the whole change since its base, so fixing one item invalidates every other item's audit. Scope the fingerprint (and the auditors' diff) to the item's own paths, e.g. a `paths:` field filled as build-it touches files `idea` (do-it run 2026-10-19: three items, one base, no commits)
- [ ] T62 The lifecycle stops at a local commit: no skill owns push or PR (body, protected-branch check), changelog version headings, or carrying out ship-it's rollback note `idea` (docs/reference-audit/2026-10-19-repo.md, finding 20; T24 covers PR feedback)
- [ ] T78 Doctors: a tracker.mjs check that gh auth or a Jira /myself call works, so setup-it verifies reachability, and an install doctor (Node >= 18, host, agent and skill symlink health, hook registration, `checks.json` validity); may be one `/setup-it` check slice `idea` (session 2026-10-19, handoff review 2026-10-25)
- [ ] T82 Hook guards on tool traffic, both unproven: a pre-edit guard against whole-file rewrites of large files (over 300 lines or 25 KB), steering to targeted edits, weighed against generated files and the cost of false blocks; and trimming passing-test noise from `npm test` and build output before it reaches the model, feasibility first, since Claude Code's PostToolUse hook may not rewrite Bash output (T27 is the related hook) `question` (handoff review 2026-10-25, unproven)
- [ ] T149 `run verify` parks a slice only on FLAKY (a plain double failure only throws; R7 left it, because parking it would end build-it's own fix loop, so decide whether a second failed round in a row should park, with its own stop code) `nice-to-have` (complete-run-lane audit, skills/do-it/scripts/work.mjs:262, stops.mjs)
- [ ] T150 `changeset.mjs` snapshot loosened (`--ignore-errors`, nested-repo stderr filter) beyond what phase 1 asked (the text does not say what phase 1 asked; the nested-repo test pins the current form); `run new` records its base without checking for a dirty tree (refusing breaks about 30 fixtures that run it on a modified tree, so decide whether to refuse with an `--allow-dirty` escape and update them) `nice-to-have` (complete-run-lane audit, skills/do-it/scripts/changeset.mjs:296)
- [ ] T152 Skills should run phases in parallel worktrees whenever possible when it costs no extra tokens over the normal route; today build-it's PARALLEL.md requires a clean tree, so one in-place phase forces the rest in place `idea` (complete-run-lane audit, skills/build-it/PARALLEL.md (user request during complete-run-lane))
- [ ] T175 A `work.mjs` per-step usage field (state field only): deferred until the usage ledger's window attribution proves too coarse `idea` (backlog-hardening and debt-simplification fog, finalized 2026-10-30)
- [ ] T233 link-it v1 limit: an agreed Interface edit whose proposer never writes it stays unapplied (skills/link-it/CONTRACT.md Rules) `debt` (link-it-todos audit)
- [ ] T236 Behavioural eval for the grill acceptance rule: a grill reply that only adds scope must produce a re-presented round, not `approve` or plan files; today only tests/grill-acceptance.test.mjs pins the text `nice-to-have` (grill-acceptance ship)
  - Related: T23 (behaviour evals).
- [ ] T245 The spawn-a-check block is duplicated in runs.mjs and work.mjs; share it when a third caller appears `nice-to-have` (skills/do-it/scripts/runs.mjs:35-39, work.mjs:222-226; windows-support audit)
- [ ] T247 The R1 wraps leave `skills/do-it/SKILL.md` at 103 lines and `skills/finish-it/SKILL.md` at 111; R3's repo-wide line count brings both under 100 `nice-to-have` (source: r1-text-truth)
- [ ] T248 scope-it should split a lane M plan's phases along file boundaries where dependencies allow, so build-it's frontier is wide enough to fan out; today the split follows dependencies alone and two phases that rewrite one module force a serial build `idea` (session 2026-11-15, tracks-mode; related T13, T20)
- [ ] T249 roadmap-it should treat file locality as a tiebreaker when ordering ready slices, so a track run's pre-flight can pair two that do not touch one module `idea` (session 2026-11-15, tracks-mode; related T246)
- [ ] T250 Detect when an installation is out of date with the repo it links into and offer an update; research how mattpocock/skills updates an install from a terminal and whether that approach fits `idea` (session 2026-11-15, user request; https://github.com/mattpocock/skills)
  - Nothing today compares an installed home with its checkout: install.mjs links skills, agents and commands and writes a manifest, so a stale install and a current one look the same to the user.
- [ ] T251 The contract plan path in `run tracks` is relativised twice, so the brief names a path that does not exist below the repo root `debt` (tracks-mode audit; runs.mjs:71)
- [ ] T252 Give `trackWidth`'s resource term a producer, or drop it: `run tracks` passes none and `tracks` is already capped at 5, so the machine cap never binds `debt` (tracks-mode audit; runs.mjs:108,118)
- [ ] T253 `run tracks` asks for only the ceiling's worth of free slices, so a sixth ready slice is in neither `tracks` nor `waiting` `debt` (tracks-mode audit; runs.mjs:108)
- [ ] T254 `run tracks` swallows every `items.get` error and falls back to HEAD, where `run contract` rethrows: one policy, and read the item once `debt` (tracks-mode audit; runs.mjs:127)
- [ ] T255 A track's `prove-it` takes no check slot, so the two heavy suites the slot exists for never queue `debt` (tracks-mode audit; check-slot.mjs:1)
- [ ] T256 Every track brief calls its plan a lane M plan with phase files beside it, which a lane S slice does not have `debt` (tracks-mode audit; runs.mjs:85)
- [ ] T257 The Contract check hard-codes `node skills/do-it/scripts/contract.mjs`, so it exits ENOENT in a project without a skills directory `debt` (tracks-mode audit; CHECKS.md:22)
- [ ] T258 The Contract analyze row sits among the lane S checks, so every plan outside a track now fails the pass `debt` (tracks-mode audit; CHECKS.md:16)
- [ ] T259 `runVerifyMerged` lacks `runVerify`'s non-git guard: it runs the suite, then fails in `fingerprintOf` and records nothing `debt` (tracks-mode audit; runs.mjs:225)
- [ ] T260 `run verify --merged` takes the check slot but records no `waited_ms`, so its queue time counts against the slice cap `nice-to-have` (tracks-mode audit; runs.mjs:234)
- [ ] T261 `run tracks` drops `nextSlice`'s stop, so at `max_slices` it reads like an empty frontier `nice-to-have` (tracks-mode audit; runs.mjs:108)
