# do-it: design

A standalone skills repo for Claude Code and OpenCode. It keeps the Doc Cycle's
durable record (plans, ADRs, glossary, changelog, Jira) and drops the fixed
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
| L | bundled or epic-sized | capability map -> one M plan per module | map + several M dirs |

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

### Flow (user-invoked, short descriptions)

| Skill | Replaces | Job |
|-------|----------|-----|
| `do-it` | ask-matt router, the `Next:` chain | Size, pick lane, resume from state, run steps |
| `issue-it` | issue-it, from-jira intake | Capture to `docs/issues/`; also receives out-of-scope discoveries (`propose_work`) |
| `plan-it` | plan-it, from-jira, to-spec, to-tickets | Grill scaled to lane, write plan, optional `--jira` publish |
| `build-it` | implement-it, implement, implement-spec | One phase, or `auto` over the frontier with worktrees |
| `audit-it` | audit-it, code-review gate | Fresh-context fan-out, findings, verdict, loop cap |
| `ship-it` | verify-it + commit-it | Finalize docs, confirm assumptions, commit, squash, push/PR on approval |

### Discipline (model-invoked, trigger-rich descriptions)

Kept from mattpocock / the fork, largely unchanged: `grilling`,
`domain-modeling`, `codebase-design`, `tdd`, `diagnosing-bugs`, `code-review`,
`research`, `prototype`, `handoff`, `writing-for-agents`.

New or reshaped:

- `core`: the always-on posture (section 6). Also loaded as `AGENTS.md`.
- `doubt`: adversarial fresh-context check of a claim before acting on it
  (addyosmani doubt-driven-development), used by audit and by build on risky
  steps.
- `tracker`: the issue-tracker seam (local, GitHub, Jira) over a small Node
  CLI, with layered dotenv config. The only skill that knows any tracker;
  others call it (ADR-0003).
- `compliance`: mechanical checks (hooks) and judgement rules (audit), one
  rule set (ADR-0004).

### Dropped

`ask-matt` (replaced by `do-it`), `to-spec`/`to-tickets` as a parallel path,
`implement-spec` (folded into `build-it auto`), `resolving-merge-conflicts`
(removed upstream), in-progress `review` (duplicates `code-review`),
`write-a-skill` (superseded by `writing-for-agents`), the
`improve-codebase-architecture` sub-files duplicated from `codebase-design`.
`wayfinder`, `triage`, `retro`, `teach`, `wizard` stay optional in an `extras/`
bucket.

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
  findings go to `issue-it`.
- **Verifiable.** Turn the task into a check (bug -> failing test first).
  Non-trivial logic leaves a test.
- **Shortcuts are recorded.** `shortcut: <limit>, <when to upgrade>`.
- **Never cut** validation at trust boundaries, data-loss handling, security,
  accessibility.
- **Close every turn** with what happened, then `Skipped / Not checked / Risk`,
  then the next step.

## 7. Step contracts

### build-it

- Inputs: state block, phase file (M) or plan (S), repo standards.
- Per phase: `tdd` at agreed seams; after 3 failed fix rounds call
  `diagnosing-bugs`. No commits: the change stays in the working tree
  (ADR-0002).
- Frontier from the state block; parallel phases run on scratch branches in
  worktrees and land with `git merge --squash` + `git reset`, so the user's
  branch only ever sees an uncommitted change. Subagents inherit `core` via
  the SubagentStart hook on Claude Code.
- Stop conditions: ambiguity that fails assume-or-ask, a failure after
  diagnosis, a merge break on the integration branch (revert the phase merge,
  mark `blocked`), anything `git revert` cannot undo.
- Output: per-phase report in the state block (`done|blocked|failed`,
  verification command and commit).

### audit-it

- Fresh-context subagents in parallel, merged in the main context: Spec and
  Standards (`code-review`), Compliance (`.compliance-rules/`, secrets),
  Architecture (deletion test, seams). Lane S runs Spec+Standards only.
- Finding contract (fork + ponytail): concrete case or no finding; recorded
  decisions and `shortcut:` markers are not findings; numbered Must / Should /
  Nice, each with What / Problem / Fix / If skipped; ends with `Verdict:` and
  `Not checked:`.
- Writes `audit` in the state block; the full report goes in
  `audit-report.md` only for lane M.
- FAIL routes back to `build-it` with the numbered Must list; round 3 FAIL
  becomes a user question.

### ship-it

One step, one or two commits:

1. Gate: audit PASS at current HEAD (lane XS: self-review footer instead).
2. Show the assumptions list; user confirms, edits or rejects (rejects go to
   `issue-it`).
3. Accept linked ADRs, merge GLOSSARY, write the changelog entry, offer
   untriggered `shortcut:` markers to `issue-it`.
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
  hooks/
    claude.mjs                # Claude Code entry: session/subagent start, pre/post tool
    lib/                      # host-neutral checks, context, guard decisions
    hooks.json                # plugin hook config
  .opencode/plugins/          # OpenCode plugin over hooks/lib
  .opencode/command/*.md      # generated from skills, never hand-edited
  .claude-plugin/             # plugin.json, marketplace.json
  scripts/
    install.sh                # symlinks + hook registration (hooks on by default)
    install-hooks.mjs         # idempotent settings merge, with backups
    gen-opencode.mjs          # skills -> OpenCode commands (--check for drift)
    check.mjs                 # frontmatter, line budget, skill calls, links, em-dashes
  tests/                      # node --test, no dependencies
  docs/DESIGN.md, docs/adr/
```

- Install: `scripts/install.sh` for both hosts (OpenCode reads
  `~/.agents/skills`); the Claude plugin is the alternative for Claude Code.
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
- No em-dashes; repo GLOSSARY vocabulary; no AI attribution in anything that
  ships.

## 10. Decisions

1. **Build step name:** `build-it`.
2. **Commits:** none until ship; ship commits only on the user's yes
   (ADR-0002).
3. **Hooks:** standards and compliance hooks on by default (ADR-0004).
   OpenCode has no subagent hook; its plugin injects into every turn.
4. **Tracker:** a configurable seam, local by default, GitHub and Jira by
   config; user defaults with per-project overrides (ADR-0003).

## 11. Not built yet

- Routing evals (positive and negative prompts per skill).
- Extras: `wayfinder`, `triage`, `retro`, `doc-it`, `wizard`.
- OpenCode 2 plugin API (the plugin targets the OpenCode 1 hooks).

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
