# To-do

Nice-to-haves and things to circle back to. Managed by todo-it; edit freely.

## Open

- [ ] T1 Add a CI workflow running npm test and npm run check (routing eval included) on every push `nice-to-have` (session 2026-10-19)
- [ ] T2 Dogfood the flow: run /do-it on a small real change and /setup-it on another repo `circle-back` (session 2026-10-19)
  - The workflow skills are instructions no agent has executed end to end yet.
- [ ] T3 Add a tracker.mjs doctor command that checks gh auth or a Jira /myself call, so setup-it verifies reachability `nice-to-have` (session 2026-10-19)
- [ ] T4 Add a provenance check script that flags skill text copied from known source repos `nice-to-have` (session 2026-10-19)
- [ ] T6 setup-it writes DO_IT_PROTECTED_BRANCHES from the remote's default branch when it is not main or master `nice-to-have` (skills/setup-it)
- [ ] T7 debug-it routes a "no honest seam for the regression test" finding to log-it or deepen-it `nice-to-have` (skills/debug-it/SKILL.md)
- [ ] T9 Support the OpenCode 2 plugin API alongside OpenCode 1 `circle-back` (.opencode/plugins/do-it.mjs)
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
- [ ] T38 Trim internal-caller clauses from model-invoked descriptions (grill-it, review-it, guard-it, look-it-up) to cut per-turn tokens `nice-to-have` (overlap audit)
- [ ] T39 Decide: fold doubt-it into it-core, and drop prove-it --since (review-it plus guard-it cover it) `question` (overlap audit)
- [ ] T41 One change-set module (diff since base, added lines with real line numbers, untracked files, no-commit fallback) shared by guard.mjs, scan.mjs and the work-item fingerprint `idea` (deepen-it 2026-10-19, candidate 3)
  - The work-item-script plan builds a small changeset helper first; this generalizes it and fixes the wrong line numbers in both JS copies.
- [ ] T42 Event-level host decision layer: decide(event, tool, input, session) so the Claude and OpenCode adapters only translate; unlocks T9, T25, T26, T27 `idea` (deepen-it 2026-10-19, candidate 4)
- [ ] T43 Explore: make it-core non-invocable (hooks inject it; its description costs ~35 words a turn for nothing) `question` (deepen-it 2026-10-19, candidate 5; see T38, T39)
- [ ] T44 Explore: move shared config and doc resolution from skills/track-it/scripts into a top-level lib/ `question` (deepen-it 2026-10-19, candidate 6; do with T41)
- [ ] T45 Explore: merge log-it with todo-it, and map-it with sweep-it, as single skills with modes `question` (deepen-it 2026-10-19, candidate 7; not recommended now)
- [ ] T46 Code map in large repos: cache the map keyed by HEAD and index mtime so subagent starts reuse it, and fall back to tracked files only (no untracked walk) when the 1.5 s timeout hits `idea` (hooks/lib/codemap.mjs; codemap-containers review)
- [ ] T47 Explore self-improving mechanisms for the skill base: review the references, then decide what fits (e.g. extend retro-it, feed audit findings and user corrections back into skills, checks and evals) `question` (user 2026-10-19; after the current plans)
  - References: https://github.com/BerriAI/self-improving-agent, https://github.com/microsoft/Trace, https://github.com/XMUDeepLIT/Awesome-Self-Evolving-Agents, https://github.com/selfimproving-agent/awesome-Self-Improving-Agents
  - Related: T29 (retro-it mines transcripts for corrections), T22 (red-flag tables from observed failures), T23 (behaviour evals), T10 (routing eval variants).
- [ ] T49 Concurrent uncommitted work items: each fingerprint hashes the whole change since its base, so fixing one item invalidates every other item's audit. Scope the fingerprint (and the auditors' diff) to the item's own paths, e.g. a `paths:` field filled as build-it touches files `idea` (do-it run 2026-10-19: three items, one base, no commits)

## Done

- [x] T48 Code map for a real large monorepo reads CONTEXT-MAP.md first and lists top-level manifest dirs as packages (done 2026-10-19: work per-area-contexts)
- [x] T5 Treat packages/, apps/ and services/ as containers in the code map so monorepos show their packages (done 2026-10-19: work codemap-containers)
- [x] T8 Port fingerprint.sh to Node so the flow's main path has no bash dependency (Windows) (done 2026-10-19: work work-item-script)
- [x] T21 A verify-phase script that runs the checks and writes a phase's verified: only on exit 0 (done 2026-10-19: work work-item-script)
- [x] T37 Test/lint commands are discovered in setup-it, map-it and build-it; read setup-it's config first (done 2026-10-19: AGENTS.md Commands line from setup-it, read first by build-it and map-it)
- [x] T36 test-it defines "seam" differently from design-it; link to design-it's definition (done 2026-10-19: test-it links design-it)
- [x] T33 skill-it/SKILL-MECHANICS and AGENTS.md restate the same rules (done 2026-10-19: AGENTS.md links SKILL-MECHANICS, keeps repo specifics)
- [x] T12 scope-it analyze step (done 2026-10-19: scope-it/CHECKS.md analyze pass)
- [x] T11 scope-it builder check (done 2026-10-19: scope-it/CHECKS.md builder check)
- [x] T15 prove-it and sweep-it: a fresh validator subagent confirms each Must before it counts; drop unconfirmed ones (done 2026-10-19: prove-it/VALIDATE.md, Not confirmed section in both reports)
- [x] T34 prove-it/REVIEW-STANDARDS repeats guard-it, it-core and REPORT.md; fold what is left into review-it and delete it (done 2026-10-19: review-it/BASELINE.md, REVIEW-STANDARDS.md removed)
- [x] T35 retro-it and guard-it both describe turning a candidate into a checks.json rule (done 2026-10-19: guard-it owns format and fire/flood check, retro-it links)
- [x] T40 Make look-it-up's output folder configurable (done 2026-10-19: DO_IT_RESEARCH_DIR)

## Dropped
