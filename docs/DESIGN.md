# do-it: design

A standalone skills repo for Claude Code and OpenCode. It keeps the Doc Cycle's
durable record (plans, ADRs, area contexts, changelog, Jira) and drops the fixed
six-hop chain in favour of a flow that scales with the size of the work.

Status: accepted; first cut built. Decisions are recorded in `docs/adr/`.
Sources compared are listed at the end.

## 1. Problems this solves

From a review of `rshingleton/skills` (the current Doc Cycle):

- Every change pays the full cost. `plan-it` grills "however small the work
  looks"; a one-line fix still needs a plan dir, a phase prompt,
  `execution-notes.md`, `audit-report.md`, a verify pass and a docs commit.
- Six user-run hops, each ending in a mandatory `Next:` and refusing to run
  without the previous file (`verify-it` without a PASS report, `implement-it`
  refusing to suggest audit).
- Code and docs are committed in separate skills; `commit-it` refuses a mixed
  tree, so ADRs and glossary never land with the code they describe.
- `verify-it` deletes the plan dir, then `commit-it` digs `jira.md` out of
  `git show HEAD:`.
- Shared rules (commit prefix, `shortcut:` format, the `Next:` chain) are
  restated in up to 9 places and have drifted (from-jira ADR step vs ADR-0012,
  commit-it README vs ADR-0011, compliance rules vs ADR-0011).
- Two competing planning paths (`to-spec`/`to-tickets` vs `plan-it`) plus
  `wayfinder`, with a README note that they "aren't meant to be mixed".

## 2. Principles

1. **One entry, scaled lanes.** `/do-it` sizes the work and runs only the
   steps that size needs. Every step is still callable directly.
2. **Files are the state, not the transcript.** One state block per work item
   records size, status, approvals, assumptions and the verified baseline, so
   any step resumes in a fresh session (addyosmani, ballet).
3. **Approve once, then run.** After plan approval, build runs every ready
   phase and stops only on defined stop conditions (addyosmani `/build auto`).
4. **Different eyes for audit.** Audit runs in fresh-context subagents that get
   the plan, the diff and the build report, never the build transcript
   (ballet).
5. **Outcome routes the next step.** Each step ends `done | blocked | failed`;
   failed audit loops to build, capped at 3 rounds, then becomes a question
   (ballet).
6. **One always-on core.** The coding posture (minimal, reuse first, surgical,
   verifiable) lives in one file and reaches subagents too (ponytail,
   karpathy).
7. **Each rule has one home.** Skills call skills; shared conventions live in
   one reference file; CI fails on drift (mattpocock ADR-0010 style, ponytail
   copy check).
8. **Assume or ask.** Reversible, low-impact unknowns are recorded as
   assumptions and work continues; irreversible or ambiguous ones stop. The
   user confirms the assumption list at ship (ballet).

## 3. Lanes

`/do-it` reads the request (or an issue / Jira key / existing work id), sizes
it, states the lane in one line and proceeds. The user can override
(`/do-it --lane m`). A lane can be raised mid-flight when scope grows; it is
never lowered silently.

| Lane | Signal | Steps | Files written |
|------|--------|-------|---------------|
| XS | 1-2 files, < ~30 lines, no public API, auth, data, schema or config | build -> self-review -> commit | none |
| S | one coherent change, one session | grill (0-3 Qs) -> plan (single file) -> build -> audit (1 reviewer) -> ship | `docs/planning/<id>.md` |
| M | several phases or seams, may span sessions | grill -> phased plan -> build auto -> audit (fan-out) -> ship | `docs/planning/<id>/` |
| L | bundled or epic-sized | roadmap (roadmap-it) -> one S/M item per slice | `docs/roadmap/<slug>.md` (kept) + one plan per slice |

The XS signal mirrors addyosmani's `/ship` skip rule. Anything touching auth,
payments, data migrations, CI or secrets is at least S regardless of size.

## 4. Work-item state

One frontmatter block, in `docs/planning/<id>.md` (S) or
`docs/planning/<id>/README.md` (M), owned by whichever step is running:

```yaml
id: ABC-123            # Jira key, or a slug
lane: m
status: building       # planned | building | auditing | shipping | done
base_ref: 1a2b3c4
phases:
  - { n: 1, status: done, commit: 9f8e7d6, verified: "npm test @ 9f8e7d6" }
  - { n: 2, status: ready, blocked_by: [] }
assumptions:
  - "Retry cap of 3 is acceptable (reversible: config)"
approvals:
  plan: 2026-10-19
audit: { verdict: null, at: null, round: 0 }
jira: { epic: ABC-123, phases: { 1: ABC-124, 2: ABC-125 } }
```

Rules:

- A recorded verification is a claim about a specific commit; re-run it only if
  the code moved (addyosmani).
- Approvals count only when recorded here, never inferred from a past chat.
- Phase files (`phase-N.md`) exist only in lane M. Sections: Goal, Scope,
  Seams, Steps (`step -> verify: check`, karpathy), Done when.
- No `jira.md` stub, no `sources/` move, no separate `execution-notes.md`. Jira
  keys and intake links live in the state block.

## 5. Skills

Every skill is named as an `-it` verb so this repo can be installed beside
mattpocock/skills or rshingleton/skills without name collisions (symlink and
OpenCode installs have no namespace). Renamed from their sources:

| Old | New | Old | New |
|-----|-----|-----|-----|
| issue-it | log-it | research | look-it-up |
| plan-it | scope-it | prototype | sketch-it |
| audit-it | prove-it | handoff | pass-it |
| improve-codebase-architecture | deepen-it | writing-for-agents | skill-it |
| grilling | grill-it | doubt | doubt-it |
| tdd | test-it | compliance | guard-it |
| code-review | review-it | tracker | track-it |
| codebase-design | design-it | core | it-core |
| domain-modeling | name-it | diagnosing-bugs | debug-it |

### Flow (user-invoked, short descriptions)

| Skill | Replaces | Job |
|-------|----------|-----|
| `do-it` | ask-matt router, the `Next:` chain | Size, pick lane, resume from state, run steps |
| `log-it` | issue-it, from-jira intake, todo-it | The one intake and backlog skill: sorts each item into an issue (`docs/issues/` or a remote tracker) or a one-line to-do (`docs/TODO.md`); lists, reviews, closes and promotes both; receives out-of-scope discoveries (`propose_work`). See ADR 0007 |
| `scope-it` | plan-it, from-jira, to-spec, to-tickets | Grill scaled to lane, write plan, optional `--jira` publish |
| `build-it` | implement-it, implement, implement-spec | One phase, or the whole frontier with parallel worktrees; never commits |
| `prove-it` | audit-it, code-review gate | Fresh-context fan-out, findings, verdict, loop cap |
| `ship-it` | verify-it + commit-it | Finalize docs, confirm assumptions, one commit only on the user's "do it", push/PR on request |

### Discipline (model-invoked, trigger-rich descriptions)

Rewritten in this repo's own words from mattpocock / the fork's ideas, and
fitted to do-it's conventions (state block, resolved project docs, it-core,
seams agreed in scope-it): `grill-it`, `name-it`, `design-it`, `test-it`,
`debug-it`, `review-it`, `look-it-up`, `sketch-it`, `pass-it`, `skill-it`,
`deepen-it`. None carries more than a few lines of boilerplate in common with
its source.

New or reshaped:

- `setup-it` (typed): one-time per-repo onboarding; detects, proposes
  `.do-it/config.env`, a starter `checks.json` and an `AGENTS.md` section,
  writes only what the user accepts.
- `merge-it`: resolves merge, rebase and cherry-pick conflicts by intent;
  build-it's parallel merges call it.
- `retro-it` (typed): turns repeated mistakes and prove-it's guardrail
  candidates into checks, lint config, standards or issues.

- `it-core`: the always-on posture (section 6). Also loaded as `AGENTS.md`.
- `doubt-it`: adversarial fresh-context check of a claim before acting on it
  (addyosmani doubt-driven-development), used by audit and by build on risky
  steps.
- `track-it`: the issue-tracker seam (local, GitHub, Jira) over a small Node
  CLI, with layered dotenv config. The only skill that knows any tracker;
  others call it (ADR-0003).
- `guard-it`: mechanical checks (hooks) and judgement rules (audit), one
  rule set (ADR-0004).

### Dropped

`ask-matt` (replaced by `do-it`), `to-spec`/`to-tickets` as a parallel path,
`implement-spec` (folded into `build-it`), `resolving-merge-conflicts`
(replaced by `merge-it`), in-progress `review` (duplicates `code-review`),
`write-a-skill` (superseded by `skill-it`), the
`improve-codebase-architecture` sub-files duplicated from `design-it`.
`wayfinder`, `triage`, `teach` and `wizard` are not carried over.

## 6. Core posture (always on)

Merged from ponytail and karpathy, one source file:

- **Think first.** State assumptions. If unclear, name the confusion; apply
  assume-or-ask.
- **Ladder.** Take the first option that fully works: does it need to exist;
  already in this codebase; stdlib or platform; installed dependency; one line;
  otherwise the minimum.
- **Lazy about the solution, never about the change.** Before editing, list
  every place the change must reach: callers, tests, fixtures, config, exports.
- **Surgical.** Every changed line traces to the request. Remove only orphans
  your change created; mention other dead code, don't touch it. Out-of-scope
  findings go to `log-it`.
- **Verifiable.** Turn the task into a check (bug -> failing test first).
  Non-trivial logic leaves a test.
- **Shortcuts are recorded.** `shortcut: <limit>, <when to upgrade>`.
- **Never cut** validation at trust boundaries, data-loss handling, security,
  accessibility.
- **Close every turn** with what happened, then `Skipped / Not checked / Risk`,
  then the next step.

### Terse internal voice

Text another agent or a script reads (briefs, subagent reports, review
findings, scout notes, state-block free text, script output) is terse and
fixed in shape; anything the user reads stays normal prose. One source,
`skills/it-core/VOICE.md`, reaches agents two ways: `npm run gen` copies it
into each `agents/it-*.md` (`npm run check` fails a missing or stale copy),
and the subagent-start hook appends it for every other subagent type
(general-purpose spawns from `look-it-up`, `design-it`, `map-it`). The hook
skips `it-*` so the block is not paid for twice. OpenCode has no subagent
hook and shares one system prompt, so it gets only the agent-file copy
where agents are installed. Each `it-*` agent has a `## Report` contract
with a word cap, and every skill paragraph that starts a subagent names a
cap (`npm run check` fails one without it). `work.mjs show --brief` prints
status, lane, next moves and blocker only.

Adopted from [caveman](https://github.com/juliusbrussee/caveman)
(research: `docs/research/caveman-source-and-flow.md`):

| Rule | Why |
|------|-----|
| Fixed report shapes and word caps | Its own data: voice alone saves about 3% over "answer concisely"; shape, caps and reading less carry the saving |
| Never drop not, never, no, only; numbers, paths, commands, errors verbatim | A lost negation costs more than every token saved |
| Plain wins when terse is not shorter; full sentences for security, irreversible steps and anything needing the user | Clarity over compression where a misread is expensive |
| "This format overrides any other style instruction" | A user who also installs caveman gets these agents' own format |

Skipped: the proxy, shrink, browse and compress tools (they rewrite what the
user and tools produce, not agent-to-agent text); the per-turn reminder and
mode switching (this posture is injected once per subagent, never per turn);
its savings claims (mostly unproven, research section 7). Effect measured in
`docs/research/caveman-baseline.md`.

## 7. Step contracts

### build-it

- Inputs: state block, phase file (M) or plan (S), repo standards.
- Per phase: `test-it` at agreed seams; after 3 failed fix rounds call
  `debug-it`. No commits: the change stays in the working tree
  (ADR-0002).
- Frontier from the state block; parallel phases run on scratch branches in
  worktrees and land with `git merge --squash` + `git reset`, so the user's
  branch only ever sees an uncommitted change. Subagents inherit `it-core` via
  the SubagentStart hook on Claude Code.
- Stop conditions: ambiguity that fails assume-or-ask, a failure after
  diagnosis, a merge break on the integration branch (revert the phase merge,
  mark `blocked`), anything `git revert` cannot undo.
- Output: per-phase report in the state block (`done|blocked|failed`,
  verification command and commit).

### prove-it

- Fresh-context subagents in parallel, merged in the main context: Spec and
  Standards (`review-it`), Compliance (`.compliance-rules/`, secrets),
  Architecture (deletion test, seams). Lane S runs Spec+Standards only.
- Finding contract (fork + ponytail): concrete case or no finding; recorded
  decisions and `shortcut:` markers are not findings; numbered Must / Should /
  Nice, one line each (`Must|Should|Nice | file:line | claim | case`, with a
  word cap, after caveman's terse reports); ends with `Verdict:` and
  `Not checked:`.
- Writes `audit` in the state block; the full report goes in
  `audit-report.md` only for lane M.
- FAIL routes back to `build-it` with the numbered Must list; round 3 FAIL
  becomes a user question.

### ship-it

One step, one or two commits:

1. Gate: audit PASS at current HEAD (lane XS: self-review footer instead).
2. Show the assumptions list; user confirms, edits or rejects (rejects go to
   `log-it`).
3. Accept linked ADRs, merge terms into the area's CONTEXT.md, write the changelog entry, offer
   untriggered `shortcut:` markers to `log-it`.
4. Jira: one combined prompt for all keys (comment + resolve), not per key.
5. Delete the planning dir after the user answers, before any commit.
6. One question: commit now (code and docs in one commit) or leave it for
   review. `DO_IT_COMMIT=never` makes ship-it only propose the message. Push
   or PR only on request.

## 8. Packaging: Claude Code and OpenCode

```
do-it/
  AGENTS.md, CLAUDE.md        # conventions for working on this repo
  skills/<name>/SKILL.md      # flat, so ../other-skill links survive symlinks
  agents/<role>.md            # it-scout, it-reviewer, it-builder, it-planner, it-skeptic: pinned model and tools
  hooks/
    claude.mjs                # Claude Code entry: session/subagent start, pre/post tool
    lib/                      # host-neutral checks, context, guard decisions
    hooks.json                # plugin hook config
  .opencode/plugins/          # OpenCode plugin over hooks/lib
  .opencode/command/*.md      # generated from skills, never hand-edited (OpenCode 1)
  .opencode/commands/*.md     # same files for OpenCode 2
  .opencode/agents/*.md       # generated from agents/: deny-first permission map, no model
  .claude-plugin/             # plugin.json, marketplace.json
  scripts/
    install.sh                # symlinks + hook registration (hooks on by default)
    install-hooks.mjs         # idempotent settings merge, with backups
    gen-opencode.mjs          # skills -> OpenCode commands, agents -> OpenCode agents (--check for drift)
    check.mjs                 # frontmatter, line budget, skill calls, links, em-dashes, agent files and tools
  tests/                      # node --test, no dependencies
  docs/DESIGN.md, docs/adr/
```

- Install: `scripts/install.sh` for both hosts (OpenCode reads
  `~/.agents/skills`), from a clone or piped from curl (it clones or pulls
  `~/.local/share/do-it`, then runs the clone's copy); the Claude plugin is
  the alternative for Claude Code.
- OpenCode facts verified on 1.18.35 and the `dev` snapshot
  (`docs/research/opencode-v2-integration.md`): the plugin hook object blocks
  by throwing; a `permissions` list in an agent file is ignored (the agent
  stays allow-all), so agents use the `permission` map; a Claude-style
  `tools: Read, Grep` makes a 1.x config invalid (2.x reads it); `skills`, `instructions`
  (frontmatter included), `commands/` and `command/` are all read. No `skills`
  or `instructions` entry is installed: the symlinks already work, and the
  plugin injects the posture each turn.
- OpenCode usage: on 1.x a plugin's `event` hook sees `cost` and `tokens`
  (input, output, reasoning, cache read/write) with `agent`, `modelID` and
  `providerID` on each `message.updated` assistant message; on 2.x
  `ctx.event.subscribe` yields `session.step.ended` and `session.usage.updated`
  with `cost` and `tokens`, and agent and model come from the `context` hook.
  Nothing records it there until `work.mjs` has a usage field (the per-step
  usage issue). On Claude Code the `Stop` and `SubagentStop` hooks already keep
  a per-run usage ledger from the transcripts (`skills/usage-it`, tokens only,
  no dollar estimate since prices change); it is not tied to a work item or step,
  but a step's usage can be read by time window (`usage.mjs --from/--to`).
- Org-specific material (Jira, `.compliance-rules/`) is configuration, not
  code: the repo works with neither.

## 9. Authoring rules

- Skill anatomy (addyosmani, trimmed): When to use / not use, Process, Red
  flags, Verification. Common-rationalizations table only for discipline
  skills that get skipped under pressure (tdd, audit).
- SKILL.md target 100 lines; detail in sibling files one level deep. Shared
  conventions live in one skill (`do-it/STATE.md`, `do-it/LANES.md`) and
  others link to them with `../do-it/...`.
- Descriptions: user-invoked get one human line; model-invoked get "what it
  does" + "Use when ..." with concrete triggers. Never summarize the process
  in the description.
- Routing evals in CI: each positive prompt ranks its skill first; fail on
  description pairs that are too similar (addyosmani tier 2).
- No em-dashes; the area's CONTEXT.md vocabulary; no AI attribution in anything that
  ships.

## 10. Decisions

1. **Build step name:** `build-it`.
2. **Commits:** none until ship; ship commits only on the user's "do it"
   (ADR-0002).
3. **Hooks:** standards and compliance hooks on by default (ADR-0004).
   OpenCode has no subagent hook; its plugin injects into every turn (the
   internal voice rules are not injected there; see Terse internal voice).
4. **Tracker:** a configurable seam, local by default, GitHub and Jira by
   config; user defaults with per-project overrides (ADR-0003).

## 11. Exploring existing and new projects

- **Scout before sizing.** `do-it` reads the code the request points at
  (`do-it/SCOUT.md`): new vs existing (mapped or unmapped), what already
  exists, reach, risk, overlapping work items. Never asks; names what it
  found in the lane line.
- **New projects** plan with `scope-it/GREENFIELD.md`: purpose, stack (via
  `look-it-up`), shape, quality bar, ADRs for foundation choices, and a walking
  skeleton phase that blocks the rest.
- **Exploration skills**, routed from `do-it` when the request is to
  understand rather than change (`do-it/EXPLORE.md`):
  - `map-it`: facts only, `docs/reference/` or chat (replaces `doc-it` phase
    1 and `zoom-out`); `/map-it <area>` also writes the area's `CONTEXT.md`
    (all but Terms) and its map row, and every run reports map drift.
  - `sweep-it`: pre-existing problems, ranked, concrete cases, files what the
    user picks (replaces `doc-it` phase 2 and the old `audit-it repo` mode;
    adds ponytail-audit's lenses).
  - `deepen-it`: upstream mattpocock `improve-codebase-architecture`, plus a
    hand-off to `do-it` or `log-it`.
  - `look-it-up`: mattpocock `research`, unchanged.
- **Project docs resolve per repo.** Context map (`CONTEXT-MAP.md`), context
  (`CONTEXT.md`), changelog, ADR and reference directories are detected or
  configured once (`resolveDocs` in the shared config) and injected into every
  session; skills keep naming the defaults.
- **One context per area, listed in a root map.** Every step reads the map,
  then the area's `CONTEXT.md` (identity, terms, relationships, key files,
  design notes). name-it writes Terms, map-it the rest; files and map rows
  are created lazily, never by a read-only step. GLOSSARY files are read
  only as a fallback (ADR 0005). The session code map leads with the map's
  tables, so a monorepo shows its areas first.

## 12. Not built yet

- OpenCode 2: `permission.hook("evaluate")` is not used (it gets
  scanner-split shell pieces, not the whole command). The `execute` code tool
  needs no guard on 2.1.2: it has no write or shell tool, and a nested tool
  call fires `execute.before` again (`docs/research/opencode-v2-integration.md`).

Built since the first cut: routing evals (`scripts/eval-routing.mjs`,
`evals/routing.json`, part of `npm run check`), the session-start code map
(`hooks/lib/codemap.mjs`, `DO_IT_MAP`; context map, then module map, then
git), step-boundary guidance
(`do-it/BOUNDARIES.md`), rollback notes for risk-area work at ship.

## Sources reviewed

- rshingleton/skills (local `/prod/skills`, HEAD d19a769)
- mattpocock/skills (HEAD 5beb35b): PHASE-BOUNDARIES, implement, implement-spec,
  code-review, writing-for-agents, chief-of-staff wiki memory
- addyosmani/agent-skills (v0.6.13): lifecycle, `/build auto`, size skip rules,
  artifact handoff, routing evals, skill anatomy
- denyszorinets/ballet: stage reports, fresh-context stages, assume-or-ask,
  propose_work, iteration cap
- dietrichgebert/ponytail (v5.3.2): ladder, scope list, finding format,
  SubagentStart injection, drift check
- multica-ai/andrej-karpathy-skills: four principles, `step -> verify:`
