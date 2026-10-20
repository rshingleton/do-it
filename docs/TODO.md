# To-do

Nice-to-haves and things to circle back to. Managed by todo-it; edit freely.
Closed items are removed: the changelog, the commit or git history keeps them.

Next id: T71

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
  - Sweep 2026-10-19 (finding 18): prove-it/VALIDATE.md is doubt-it rebuilt, and no skill calls doubt-it.
- [ ] T43 Explore: make it-core non-invocable (hooks inject it; its description costs ~35 words a turn for nothing) `question` (deepen-it 2026-10-19, candidate 5; see T38, T39)
- [ ] T44 Explore: move shared config and doc resolution from skills/track-it/scripts into a top-level lib/ `question` (deepen-it 2026-10-19, candidate 6; do with T41)
- [ ] T45 Explore: merge log-it with todo-it, and map-it with sweep-it, as single skills with modes `question` (deepen-it 2026-10-19, candidate 7; not recommended now)
- [ ] T46 Code map in large repos: cache the map keyed by HEAD and index mtime so subagent starts reuse it, and fall back to tracked files only (no untracked walk) when the 1.5 s timeout hits `idea` (hooks/lib/codemap.mjs; codemap-containers review)
- [ ] T47 Explore self-improving mechanisms for the skill base: review the references, then decide what fits (e.g. extend retro-it, feed audit findings and user corrections back into skills, checks and evals) `question` (user 2026-10-19; after the current plans)
  - References: https://github.com/BerriAI/self-improving-agent, https://github.com/microsoft/Trace, https://github.com/XMUDeepLIT/Awesome-Self-Evolving-Agents, https://github.com/selfimproving-agent/awesome-Self-Improving-Agents
  - Related: T29 (retro-it mines transcripts for corrections), T22 (red-flag tables from observed failures), T23 (behaviour evals), T10 (routing eval variants).
- [ ] T49 Concurrent uncommitted work items: each fingerprint hashes the whole change since its base, so fixing one item invalidates every other item's audit. Scope the fingerprint (and the auditors' diff) to the item's own paths, e.g. a `paths:` field filled as build-it touches files `idea` (do-it run 2026-10-19: three items, one base, no commits)
- [ ] T50 scope-it §5 (Approve) should list the "create `<area>/CONTEXT.md` with `/map-it <area>`" step that §2 proposes, so the approval turn shows it `debt` (skills/scope-it/SKILL.md:40; per-area-contexts audit round 4)
- [ ] T51 ship-it DOCS.md still lets ship-it create a context file for new terms; the per-area-contexts decision names only name-it, `/map-it <area>` and an accepted plan step as creators, so propose creation in the ship question instead `debt` (skills/ship-it/DOCS.md:23; per-area-contexts audit round 4)
- [ ] T52 The local tracker accepts any .md path as an issue ref and drops nested or list frontmatter on rewrite, so a wrong ref can wipe a plan's phases and audit block; refuse refs outside the issues dir and refuse to write when lines were skipped `debt` (docs/reference-audit/2026-10-19-repo.md, finding 4)
- [ ] T54 GitHub Enterprise issue URLs lose their host in refs.mjs, so gh acts on github.com; keep the host and pass -R host/owner/repo `debt` (docs/reference-audit/2026-10-19-repo.md, finding 6)
- [ ] T56 docs/DESIGN.md still describes the commit-per-phase model ADR 0002 reversed (done status, per-phase commit, commit-it/verify-it); replace those sections with links to STATE.md, LANES.md and the ADRs `debt` (docs/reference-audit/2026-10-19-repo.md, finding 8)
- [ ] T57 LANES.md says lane S gets prove-it Spec and Standards only, prove-it runs Compliance in lane S too; LANES names only the step, prove-it owns the matrix `debt` (docs/reference-audit/2026-10-19-repo.md, finding 10)
- [ ] T58 One frontmatter module (split/join keeping CRLF, flat read/write) under state.mjs, the local tracker, scripts/lib/skills.mjs and context.mjs, which each parse it their own way `debt` (docs/reference-audit/2026-10-19-repo.md, finding 11)
- [ ] T59 The deletion test and pass-through checks are written out in design-it, prove-it ARCHITECTURE.md, sweep-it LENSES.md and review-it SMELLS.md; keep them in design-it and link, so one lane M audit does not raise the same finding twice `debt` (docs/reference-audit/2026-10-19-repo.md, finding 18)
- [ ] T60 Drop the plan parser's flow-map and multi-line paths (about 120 lines in state.mjs) now that no plan uses the older format `debt` (docs/reference-audit/2026-10-19-repo.md, architecture notes)
- [ ] T61 Skills tell subagents to start subagents (prove-it to review-it, roadmap-it to look-it-up); one rule in SKILL-MECHANICS.md that only the main context fans out, and inline runs when already in a subagent `debt` (docs/reference-audit/2026-10-19-repo.md, finding 15)
- [ ] T62 The lifecycle stops at a local commit: no skill owns push or PR (body, protected-branch check), changelog version headings, or carrying out ship-it's rollback note `idea` (docs/reference-audit/2026-10-19-repo.md, finding 20; T24 covers PR feedback)
- [ ] T63 Guardrail candidates are deleted with the audit report at work.mjs close before /retro-it can read them; offer retro-it at the ship question, before close `debt` (docs/reference-audit/2026-10-19-repo.md, finding 9)
- [ ] T64 Review the to-do list for additive ideas versus simplification: most open items add features, while removing duplication would save roughly 150 to 250 lines `question` (docs/reference-audit/2026-10-19-repo.md)
- [ ] T65 The commit scan reads only the first `git commit` in a chain (`git commit a.js && git commit b.js`) and does not recognise `VAR=x git commit`, `env`/`sudo` prefixes, a commit after a newline, `then` or `{`, or `git -c key='a b' commit`; find every commit in the command
  - Also: a relative `cd` after one that does not persist (`cd B && (cd C) && cd sub`) resolves from the wrong step; the hook scans each step of the cd chain, not every combination. `debt` (hook-trust-hardening audit round 2, finding 2)
- [ ] T66 A redirect before the paths (`git commit -m x 2>&1 a.js`) ends the commit's arguments, so later paths are not scanned `nice-to-have` (hook-trust-hardening audit round 2, finding 6)
- [ ] T67 build-done in fix mode records no verification, so a fix round can reach audit with failing checks; require a passing verify-phase since the fix started `debt` (skills/do-it/scripts/state.mjs build-done; work-item-module audit round 2)
- [ ] T68 Move the shell lexer (`commandWords`, `parseGitCommit`) from hooks/lib/guard.mjs to its own hooks/lib/shell.mjs with direct tests; do with T65 and T66 `idea` (deepen-it 2026-10-19, candidate 4)
- [ ] T69 In an apply_patch, a unified `---`/`+++ <path>` pair names <path> for path rules only; also scan the added lines after it under <path>, as unifiedFiles does, so an embedded unified section cannot steer a `files`-scoped rule or `exceptFilePattern` `debt` (hooks/lib/checks.mjs applyPatchFiles; host-decision-layer audit round 5, #30)
- [ ] T70 Added lines after a delete (`*** Delete File:`, `+++ /dev/null`) are scanned under the deleted path, so an `exceptFilePattern` on that path exempts them; scan them under '' as well `debt` (hooks/lib/checks.mjs; host-decision-layer audit round 5, #31)
