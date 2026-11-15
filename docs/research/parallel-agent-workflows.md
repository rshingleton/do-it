# Swarm and parallel-agent workflows in other skills repos, and what do-it should change

Answer: parallel coding agents pay only when the work is partitioned, not duplicated:
a single coordinator owning scope, ship, docs and the run record, with two or three
worktree workers that each build and prove one independent slice, is the shape the
evidence supports. Agent teams, hive-mind swarms and competitive multi-implementations
cost more tokens and, in the measured cases, did not improve accuracy. Confidence:
medium. Versions: Claude Code docs read 2026-11-15; Superpowers at `main`
(2026-11-15); wshobson/agents at `main`; claude_code_agent_farm at `main`. Checked:
2026-11-15.

## Findings

### The repos, and what they actually run

| Repo | Model | What it contributes | Evidence quality |
|------|-------|---------------------|------------------|
| [obra/superpowers](https://github.com/obra/superpowers) | Fresh subagent per task; controller reviews each task (spec, then quality); final whole-branch review on the top model. Never parallel implementers. | The most transferable rules: briefs as files, reports as files, no inherited history, explicit model per dispatch, turn count over token price, a ledger that survives compaction. | Asserted from practice, with named real-session failures; no benchmark. |
| [Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system) | Orchestrator plus 3 to 5 parallel subagents, each with its own context, returning compressed findings. | The numbers: agents use about 4x chat tokens, multi-agent about 15x; token use explains 80% of quality variance; 3 to 5 parallel subagents cut time up to 90%; most coding has fewer truly parallel tasks; synchronous waits are the bottleneck; hand artifacts over as files. | Internal eval plus production experience, research domain, not coding. |
| [Claude Code: run agents in parallel](https://code.claude.com/docs/en/agents) | Five surfaces: subagents, agent view, agent teams, workflows, projects. | The decision table: subagents are the lower-token option; agent teams are experimental; worktrees isolate file edits; `/batch` fans one change across 5 to 30 worktree subagents; teams do not isolate worktrees, so split by file. | Vendor docs. |
| [Claude Code: agent teams](https://code.claude.com/docs/en/agent-teams) | Lead plus teammates, shared task list, mailboxes. | When teams fit (research, review, competing hypotheses), and the limits: experimental, one team per session, no nested teams, no worktree isolation, coordination overhead. | Vendor docs. |
| [Claude Code: costs](https://code.claude.com/docs/en/costs) | n/a | Subagent and teammate requests count against the same plan limits; teams use about 7x a standard session in plan mode; start with 3 to 5 teammates; Sonnet for teammates; `/usage` attributes usage to skills, subagents and MCP. | Vendor docs. |
| [wshobson/agents](https://github.com/wshobson/agents) | 202 agents across 94 plugins, model aliases. | Model routing as a first-class field, and hybrid chains: Sonnet designs, Haiku executes a complete spec, Sonnet reviews. Adapts the same source to Claude Code and OpenCode. | Catalog, no measured outcomes. |
| [claude_code_agent_farm](https://github.com/Dicklesworthstone/claude_code_agent_farm) | 20 to 50 interactive sessions in tmux, lock files claim files, context cleared near the limit. | The coordination mechanics: file locks with stale-lock expiry, a shared work registry, per-agent context thresholds, auto-restart, about 500 MB RAM per agent. | Operational experience, no accuracy data. |
| [parallel-worktrees skill](https://github.com/SpillwaveSolutions/parallel-worktrees) | N worktrees, status files, optional competing implementations. | Patterns: divide and conquer, review pipeline, competitive solutions; and the warnings: about 15x tokens, no nested subagents, subscription limits. | Asserted. |
| [LogRocket benchmark](https://blog.logrocket.com/splitting-across-ai-agents) | One feature, five orchestrators. | The only cross-tool measurement found: solo 29m50s/$7.71/61 tests; Agent Teams 16m05s/~$1.99/18 tests; Cursor subagents 12m/2.11M tokens/54 tests; OpenAI handoff 1m30s/$0.009/0 tests; Claude-Flow requested 10 workers, ran 1, 38m. | One task, one run per tool, token columns not comparable. |

### What the measurements say

- **Parallelism halves wall clock when the split is real.** The benchmark's 3-way team cut
  30 minutes to 16; Cursor's implement-then-parallel-test-docs run took 12. Anthropic
  reports up to 90% time reduction from 3 to 5 parallel subagents plus parallel tool calls.
- **Duplication multiplies tokens; partitioning does not.** The 15x figure comes from
  subagents exploring the same question in breadth (research). Three lanes that each build
  a different slice replace three serial builds; total token spend stays near one run plus
  brief and report overhead. Duplicated implementations (the "run N, pick one" pattern)
  are the 15x case and are not what T246 proposes.
- **Accuracy tracked interface agreement, not agent count.** The cheapest, fastest run
  (OpenAI handoff, 90 seconds) produced 0 passing suites because the implementer missed one
  import contract. The 30-minute solo run produced the most tests and the cleanest
  interfaces. Superpowers encodes the fix: every worker gets the interfaces and decisions
  from earlier tasks, and a reviewer checks spec and quality after every task.
- **Swarm marketing outran the software.** Claude-Flow's independent run asked for 10
  workers and got one Queen session; quality was fine, parallelism was absent. Anthropic's
  own teams feature is still experimental and disabled by default.
- **Cheap models can cost more.** Superpowers: turn count beats token price; cheap models
  take 2 to 3 times the turns on multi-step work. Use the cheapest tier only when the plan
  contains the exact code, and keep a mid-tier floor for reviewers.

### What do-it already does right

- Fresh-context workers with pinned models, tools and report caps
  ([agents/](../../agents/), [it-core](../../skills/it-core/SKILL.md)).
- File-based handoff: plans, state ([STATE.md](../../skills/do-it/STATE.md)), the run
  record it describes, and reviewer briefs that point at paths, not pasted diffs
  ([review-it](../../skills/review-it/SKILL.md)).
- Up to four reviewers in parallel on separate axes (spec and standards through
  review-it, compliance through guard-it, architecture for lane M), with
  "unverified is never clean" ([review-it](../../skills/review-it/SKILL.md),
  [prove-it](../../skills/prove-it/SKILL.md)).
- Worktrees and scratch branches already exist for parallel phases
  ([PARALLEL.md](../../skills/build-it/PARALLEL.md)), including verify-on-merged-tree.
- No polling, no nested reviewers, no self-improvised agent chains
  ([finish-it](../../skills/finish-it/SKILL.md) section 2.6, [DELEGATE.md](../../skills/build-it/DELEGATE.md)).
- The run is single-coordinator by construction: one run record, one branch, one ship.
  This is the property the evidence says to keep, not remove.
- Our own A/B found no token saving from a terser voice on already short reports
  ([terse-voice-ab.md](terse-voice-ab.md)). Token work should go to context duplication
  and turn count, not wording.

### Where do-it is weaker than these repos

1. **No declared file ownership.** Superpowers gets a pre-flight conflict scan and
   per-task scope; agent farm uses lock files. do-it plans record no `files:` line
   ([STATE.md](../../skills/do-it/STATE.md) block, [PLAN-FORMAT.md](../../skills/scope-it/PLAN-FORMAT.md)),
   so T246's lane contract would be hand-written guesswork. This is also T20.
2. **No interface handoff between slices.** Superpowers' briefs carry the interfaces and
   decisions from earlier tasks; do-it's plan has no per-phase Interface field (T13).
   In a parallel run that omission is the exact failure the benchmark punished.
3. **One slice in flight.** `nextSlice` returns one, `MAX_SLICES` counts shipped, not
   running (`skills/do-it/scripts/run.mjs:241`). Parallel dispatch needs a
   claim/batch result, not N independent callers racing the same record.
4. **Shared check resource is unmanaged.** N lanes running the same heavy test suite
   contend for CPU and can fail each other; agent farm restarts on that, but a check slot
   is cheaper. Gate's `slice_cap_min` also counts queue time
   (`skills/do-it/scripts/gate.mjs:112`).
5. **Merged-tree verification records the wrong tree.** `run verify --in` runs the checks
   in the worktree but records `dirtyHashes(root, ...)` and `fingerprintOf(item)` from the
   user's checkout (`skills/do-it/scripts/runs.mjs:56`,
   `skills/do-it/scripts/work.mjs:115`). Parallel lanes make this a lie
   the gate cannot detect.
6. **No check-slot or token attribution per lane.** `usage-it` records sessions, and the
   Claude Code `/usage` breakdown now attributes usage to subagents, but do-it does not
   split a run's spend by slice or lane (T175, T214, T219).
7. **No prior-art section.** The research tags live in [TODO.md](../TODO.md) but the
   README does not credit the repos the ideas came from; the rule says ideas are credited.

## Recommendations

Ordered by value per unit of change. The first two are cheap and independent of T246.

**1. Add token rules to the briefs now (no new machinery).** In `it-core` and the
`build-it`/`prove-it` briefs: artifacts as files, status only back; never paste session
history or accumulated summaries; do not re-run checks the previous agent already ran;
batch independent reads and greps in one turn; report caps as today. Expected: fewer input
tokens per step, no accuracy loss. This is the Superpowers "42k-character dispatch" lesson
and the Anthropic "filesystem instead of telephone" lesson.

**2. Make the coordinator the only writer, and give it a batch dispatch.** Extend `run
next` with a count/claim result so the coordinator can offer k free slices, and keep all
run-record, TODO, roadmap, ADR, gate and ship writes in the coordinator. This is what the
sources converge on: superpowers' controller, agent farm's registry, Anthropic's
orchestrator. It also removes the need for a lock on `updateRun` (T164) in the T246 path.

**3. Reshape T246 as coordinator plus at most three tracks.** Each track gets a worktree,
one slice at a time, build and prove only; the coordinator scopes, starts, gates, ships
and finalizes. The contract is generated from the plan, not hand-written, and lives beside
`RUN.md`. Wall clock drops on the build and prove share only (Amdahl); tokens stay about
flat per slice. Cap at 3 by default: Anthropic says start with 3 to 5 and 3 focused beats
5 scattered, and each lane is a full session against the same plan quota.

**4. Require `files:` and `interfaces:` before a slice can run in a track.** Scope-it emits
both for a run; the pre-flight conflict table (T20) refuses two ready slices that share a
file or an interface not pinned in the plan. This is the accuracy lever the benchmark
identified. Without it, parallel lanes reproduce the 0-test handoff failure.

**5. Fix merged-tree verification before any lane lands.** Record hashes and fingerprint
from the tree the checks ran in (`--in`), or compute the fingerprint over the merged
scratch branch and compare it after the merge. Also add a scoped re-review after a merge:
the slice's verify plus one reviewer on the merge diff, not a full re-audit, unless the
merge touched a risk area or more than a handful of files. Expected: accuracy up, tokens
down against re-auditing every merged slice.

**6. Introduce a check slot.** A single lock around the heavy suite (per repo, not per
run) so lanes queue instead of thrashing, with a configurable count for fast suites.
Keep the slice clock starting after the lock is acquired.

**7. Keep model routing but state the floor.** Master/scout cheap, implementer and
reviewer mid, planner/skeptic top: this matches wshobson's distribution and Superpowers'
rule. Add the exception in writing: a cheap implementer only when the plan contains the
complete code, because turn count usually outweighs the cheaper rate.

**8. Measure a pilot before committing to T246.** Run two real slices with one track and
two tracks on the same roadmap and compare wall clock, total tokens (usage-it plus
`/usage` subagent share) and audit findings. Protocol:
[parallel-pilot.md](parallel-pilot.md), with a Phase 0 gate that can stop before the
expensive run. Kill criterion: under 25% wall-clock saving, or any accuracy regression,
means keep one track.

### Rejected for do-it

- **Agent teams, mailboxes, shared task lists.** Experimental, about 7x tokens in plan
  mode, no worktree isolation, and absent from OpenCode (T246 already notes this). The
  coordinator plus subagents already gives the needed report-back.
- **Hive-mind and swarm frameworks.** The independent run produced no parallelism; the
  coordination layer is prompt theatre on top of one session.
- **Competitive implementations (N agents on one task).** The 15x case, and do-it's value
  is one verified change, not a beauty contest.
- **Parallel implementers in one worktree.** Superpowers names this a defect; conflicts
  and duplicated review seats follow.
- **Cheap model everywhere.** Higher turn count, more chances to drift.

### Usage guidelines to stay inside

- Every subagent request counts against the same plan window as the main session
  (Claude Code costs page); Team and Enterprise seats use rolling 5-hour and weekly
  windows. A 3-track run is roughly 3 concurrent consumers for its duration.
- Start at 3 tracks, not 19. Scale only when the pilot shows a saving and the plan quota
  has headroom. Budget about 500 MB RAM per lane (agent farm's figure).
- Prefer subagents over teams for cost; prefer one coordinator over peer messaging.
- Keep dispatches small: a brief path, the interfaces it must honor, the report path.
  Do not re-explain the run.
- Keep lanes busy in one sitting: subagent prompt caches default to 5 minutes, so long
  idle gaps re-pay input tokens on every lane.
- Use `/usage` (Claude Code) and the usage ledger (OpenCode gap: T214) to see the
  subagent share before and after the pilot.

## Open

- No source measured partitioned coding work with a single coordinator on a real roadmap;
  the 15x and 7x figures are research and plan-mode teams. The pilot is the missing datum.
- Whether OpenCode's subagent sessions can be told to run in a worktree, or the coordinator
  must `git worktree add` and pass absolute paths as build-it PARALLEL already does. The
  docs show no worktree isolation field for OpenCode agents.
- Whether a per-lane token budget can be enforced from the host in either tool; today the
  caps are slice and audit counts, not spend.
- The benchmark's token columns mix context size with billed tokens (Agent Teams ~59K
  "context bloat" against a ~$1.99 cost), so its cost ranking is indicative, not exact.
