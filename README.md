<p align="center"><img src="docs/assets/do-it.png" alt="Retro badge: a man with a silver pompadour and tinted aviators points at the viewer above the words DO IT" width="240"></p>

# do-it

Agent skills for Claude Code and OpenCode that run one workflow from issue to
ship, sized to the work: a typo gets three steps, an epic gets a roadmap.
Always-on coding standards and compliance hooks come with it.

```text
/do-it "rate-limit the login endpoint"
  → lane S: plan (one approval) → build → audit → ship (one question)
```

## Quick start

1. [Install](#install) (Node 18+): one command links the skills, agents and hooks.
2. In a repo, run `/setup-it` once. It detects your test and lint commands,
   tracker and doc paths, and writes only what you accept.
3. Run `/do-it "<what you want>"` or `/do-it <issue ref>`. It sizes the work
   and asks only when a decision is yours.

Skills marked *typed* below run only when you type the slash command; the
rest the model can also pick up from what you say.

## Why this exists

Coding agents fail in a few predictable ways. Each step of the flow answers one.

| What goes wrong | What do-it does about it |
|-----------------|--------------------------|
| A one-line fix gets a plan, a review and a report | `/do-it` sizes the work first. Small work skips the ceremony |
| The agent builds something you did not mean | The plan is grilled with you and approved once, before any code. Each step is written as `step → verify:` |
| The agent reviews its own work and finds nothing | Audit runs in fresh-context reviewers that see the plan and the diff, never the build transcript |
| A long session loses the thread | State lives in a file, not the chat. `/clear` and resume any time |
| A secret or a bad commit slips through | Hooks block secrets and env files before the edit and scan the diff before the commit |
| The agent commits before you looked | Nothing is committed until you say "do it" at ship |

It does not own your process. Every step is also a skill you can call alone,
and the plan, ADRs and context files are plain Markdown in your repo.

## What it looks like

These sessions are condensed and illustrative; the wording varies.

**A small fix (lane XS).** One file, no risk area: build, self-review, ship.

```text
> /do-it #31        (issue: the 404 page says "Pagenotfound")

Lane XS: one string in src/pages/NotFound.tsx, no risk area.
[edits the string, runs the page's test, reads its own diff]
Ship: commit "gh-31: fix 404 page title"? Say "do it", or leave it for review.
```

**A feature (lane S).** One approval on the plan, then it runs.

```text
> /do-it "rate-limit the login endpoint"

Lane S: auth is a risk area; `RateLimiter` exists in src/middleware/,
only the login wiring is new.

Plan (docs/planning/rate-limit-login.md)
  1. Limit login to 5 tries per minute per IP   → verify: 6th request returns 429
  2. Reset the counter on success               → verify: test passes
  Assumption: per IP, not per account. Approve?

> yes
[builds test-first; a fresh-context reviewer audits the diff against the plan]
Audit PASS. 1 Nice: extract the limit to config.
Ship: 1. keep all assumptions?  2. log the Nice as a to-do?  3. commit now or leave it?
```

**Picking it up tomorrow.** The state is in the plan file, so a new session starts where the old one stopped.

```text
> /clear
> /do-it rate-limit-login
Resuming rate-limit-login: build is done and audited, waiting at ship.
```

**The guard.** An edit that writes a secret is refused before it lands, and the agent is told why. `DO_IT_HOOKS=off` turns the hooks off.

**One-liners you will use**

| Command | When |
|---------|------|
| `/do-it #42` or `/do-it ABC-123` | Work an issue from GitHub or Jira |
| `/log-it "retry flaky upload"` | Park an idea or bug without planning it |
| `/map-it payments` | Learn an unfamiliar area before changing it |
| `/sweep-it --hot` | Audit the code that changes most for bugs and debt |
| `/roadmap-it "move billing to Stripe"` | Chart work too big for one plan, then `/do-it docs/roadmap/billing.md#R1` |
| `/usage-it` | See what your sessions cost in tokens |

## Does it save tokens?

Not by itself, and the docs should not claim it. do-it spends tokens to buy
fewer wrong turns and less rework. Here is what is measured and what is not.

| Question | Answer | Evidence |
|----------|--------|----------|
| What does it add to every session? | About 3,100 tokens: ~1,250 for the hook block (posture, project docs, code map), ~1,300 for skill descriptions, ~540 for the repo's `CLAUDE.md` and `AGENTS.md` | `usage.mjs --baseline` on this repo, against a median start context of about 53,600 tokens over 437 sessions |
| Does small work stay cheap? | Lane XS skips the plan and the audit. A lane M run does more work than a bare prompt and costs more | By design; check your own with `/usage-it` |
| Do the role agents cost less? | Scout runs on the cheap tier, builder and reviewer on the mid tier; only the planner and skeptic use the top tier. Audit reviewers run in their own contexts, so the main session does not carry them | By design; the per-agent split is in `/usage-it` |
| Does the terse report voice save tokens? | **No evidence of a saving.** Output tokens were not lower in 3 of 4 cases and no dropped finding was detected | [50 paired headless runs](docs/research/terse-voice-ab.md), with its limits stated |
| Do the `/clear` nudges and file-based state help? | Plausible, not measured. A long session re-reads its whole context every turn | `/usage-it` flags context outliers |

To see your own numbers, run `/usage-it`, or
`node skills/usage-it/scripts/usage.mjs --baseline` for the per-session cost
of having do-it installed. Cost in dollars is not estimated; tokens only.

## The flow

| Step | Skill | Does |
|------|-------|------|
| Entry | `/do-it` | Sizes the work, picks a lane, runs only the steps that lane needs; resumes any work item |
| Intake | `/log-it` | One entry for the backlog: sorts each item into an issue (configured tracker) or a one-line to-do (`docs/TODO.md`); also lists, reviews, closes and promotes both |
| Plan | `/scope-it` | Grill scaled to the lane, seams, `step → verify:` steps, ADR only when warranted |
| Build | `/build-it` | Test-first at the agreed seams; parallel phases when ready; **never commits** |
| Audit | `/prove-it` | Fresh-context reviewers (spec, standards, compliance, architecture); numbered verdict; failures loop back to build, at most 3 rounds |
| Ship | `/ship-it` | Confirms assumptions, finalizes ADRs, area contexts and changelog, updates the tracker, then asks: commit now or leave it for review |

| Lane | When | Steps |
|------|------|-------|
| XS | 1-2 files, small, no risk area | build → self-review → ship |
| S | One coherent change, one session | plan → build → audit → ship |
| M | Several slices, a new seam, or multi-session | grill → phased plan → build → audit → ship |
| L | Epic or bundled work | `/roadmap-it` → one S/M item per slice (`/do-it docs/roadmap/x.md#R3`) |

The user is stopped only at: plan approval (for M, the grill rounds, whose
last round is the approval; for L, the roadmap approval), a build stop
condition, a third failed audit, and the ship question, plus a one-line
commit confirmation after reviewing work left uncommitted. Work stays
uncommitted in the working tree until ship, and ship commits only on a
"do it". Risk-area work gets a rollback note at ship. Between steps, `/do-it`
suggests a fresh session when the context is getting long; the state block
makes that free.

State lives in one YAML block at the top of the plan file
(`docs/planning/<id>.md` or `docs/planning/<id>/README.md`), so any step
resumes in a fresh session. Every change to it goes through
`skills/do-it/scripts/work.mjs`, which refuses a transition the state does
not allow; never edit the block by hand. See
[skills/do-it/STATE.md](skills/do-it/STATE.md).

Before sizing, `/do-it` scouts the code the request points at: it decides
whether the project is new or existing, reads `docs/reference/` when a map
exists, and finds what is already there. The lane line names what it found.
A new project plans with a greenfield agenda: stack, shape, a walking
skeleton first.

## Exploring existing code

| Skill | Does |
|-------|------|
| `/map-it [area] [--chat]` | Maps the repo or an area as `docs/reference/` (facts only), or in chat; for an area, also writes its `CONTEXT.md` and `CONTEXT-MAP.md` row, and reports drift between the map and the files on disk |
| `/sweep-it [path \| --hot]` | Audits existing code for bugs, risks, test gaps, debt, drift and dead weight; files the findings you pick |
| `/deepen-it [area]` | Finds deepening opportunities, shows them as an HTML report, grills the one you pick, hands it to `/do-it` or `log-it` |
| `/look-it-up` | Answers library, API and standards questions from primary sources |

`/do-it` routes "understand" and "find problems" requests to these instead
of starting a build.

## Planning ahead

| Skill | Does |
|-------|------|
| `/roadmap-it` | Charts an extra-large effort as a durable roadmap: destination with numbered requirements, milestones of S/M slices (covers, blocked by, verify, risk), open decisions, fog, out of scope. `next` shows where every slice stands and starts the next one; `replan` re-plans without touching shipped slices |

## Setting up and improving

| Skill | Does |
|-------|------|
| `/setup-it` (typed) | One-time per repo: detects commands, tracker and doc paths, proposes `.do-it/config.env`, a starter `checks.json` and an `AGENTS.md` section, writes only what you accept |
| `/retro-it` (typed) | Turns repeated mistakes and audit guardrail candidates into `checks.json` rules, lint config, standards lines or issues |

## Supporting skills

| Skill | Does |
|-------|------|
| `it-core` | The always-on coding posture the hooks inject |
| `track-it` | The tracker seam: local files, GitHub or Jira |
| `guard-it` | Compliance: mechanical checks and judgement rules |
| `doubt-it` | Fresh-context check of a claim before a risky step |
| `grill-it` | Interview to shared understanding, one decision at a time |
| `name-it` | Domain model: context files, the context map and ADRs |
| `design-it` | Deep-module vocabulary: module, interface, seam, depth |
| `test-it` | Test-first at agreed seams |
| `debug-it` | Diagnosis loop for hard bugs and regressions |
| `review-it` | Two-axis review: standards and spec |
| `sketch-it` | Throwaway prototype to answer a design question |
| `merge-it` | Resolves merge, rebase and cherry-pick conflicts by intent |
| `pass-it` | Handoff note for the next session (typed) |
| `usage-it` | HTML report of token usage by agent, model, project and day, context outliers and a plan-meter projection, from the usage ledger (typed) |
| `skill-it` | Writing skills and agent instructions |

Every name carries an `it` segment (`log-it`, `look-it-up`) so it never
collides with another skill repo installed beside this one.

## Install

Requires Node 18+. Pick one.

**One-liner (Claude Code and OpenCode):**

```bash
bash <(curl -fsSL 'https://raw.githubusercontent.com/rshingleton/do-it/main/scripts/install.sh')
```

It clones the repo into `~/.local/share/do-it` (or pulls it when the clone is
there), then installs from the clone; re-run it to update. Options pass
through: append `--no-hooks`, `--dry-run` or `--uninstall`. `DO_IT_REPO`
points it at a mirror, `DO_IT_HOME` at another clone directory.

**From a clone:**

```bash
git clone https://github.com/rshingleton/do-it.git ~/.local/share/do-it
cd ~/.local/share/do-it
scripts/install.sh            # skills, OpenCode commands and agents, hooks on
scripts/install.sh --dry-run  # show what it would do
scripts/install.sh --no-hooks
scripts/install.sh --uninstall
```

Skills link into `~/.claude/skills` and `~/.agents/skills` (OpenCode reads
both). The five role agents in `agents/` (`it-scout`, `it-reviewer`,
`it-builder`, `it-planner`, `it-skeptic`) link into `~/.claude/agents`; each
pins its own model, so skills that delegate pick the tier by naming the agent.
For OpenCode, `.opencode/command/` (OpenCode 1) and `.opencode/commands/`
(OpenCode 2) link into `~/.config/opencode/`, and `.opencode/agents/` links
into `~/.config/opencode/agents/`: the same five roles, generated from
`agents/` with a deny-first `permission` map in place of `tools` and no
`model` (OpenCode has no tiers). Never link `agents/*.md` itself into an
OpenCode agents directory: its `tools: Read, Grep` form makes OpenCode reject
the whole config.
An existing skill of the same name from another repo is skipped unless you
pass `--force`. Hooks register in `~/.claude/settings.json` and
`~/.config/opencode/opencode.json`; each file is backed up as `*.bak-do-it`
first.

**Claude Code plugin:**

```text
/plugin marketplace add rshingleton/do-it
/plugin install do-it@do-it
```

The plugin carries skills, agents and hooks (its agents are namespaced, for
example `do-it:it-reviewer`). Use it or the symlinks for Claude Code,
not both. Using OpenCode too? Use the symlink install; it covers both hosts.

**Update:** re-run the one-liner, `git pull` in the clone (symlinks pick it
up), or `/plugin marketplace update do-it` for the plugin.

## Hooks

On by default; `DO_IT_HOOKS=off` turns them off for a user, a repo or a shell.

| When | Does |
|------|------|
| Session start, subagent start | Injects the `it-core` posture, pointers to the repo's standards and compliance rules, its resolved project docs, and a compact code map (`DO_IT_MAP=off` to skip) |
| Before an edit | Blocks HIGH hits: secrets, env files, rules in `.compliance-rules/checks.json` |
| After an edit | Reports MEDIUM/LOW hits; runs `DO_IT_LINT_CMD` on the file and feeds failures back |
| Before `git commit` | Scans the staged diff and any untracked files the commit would add; blocks on HIGH. A `-m` message without an `<id>: ` prefix gets a warning on Claude Code, never a block |
| Session stop, subagent stop (Claude Code) | Records the run's token usage in a local ledger (see [Token usage](#token-usage)); suggests `/pass-it` then `/clear` when the context passes `DO_IT_CLEAR_AT` |

Hooks fail open: a crash or bad input never blocks the agent, and a hook that
runs long is cut off at its timeout.

Mechanical rules (a regex decides) live in `checks.json` and run on every
edit; judgement rules (`.compliance-rules/*.md`) are checked by `prove-it`.
See [skills/guard-it/SKILL.md](skills/guard-it/SKILL.md).

### Code map

The code map is capped at 1500 characters and takes the first source that
exists:

1. The context map (`CONTEXT-MAP.md`): its headings and table rows, so a
   monorepo shows its areas and where each one's `CONTEXT.md` lives. Over
   budget it keeps the Context and Location columns before it drops rows.
2. The module map (`module-map.md` in the reference directory, written by
   `/map-it`): its first rows.
3. One `git ls-files` call (tracked and untracked files), capped at 1.5
   seconds; on timeout the map is left out and nothing else changes.
   Monorepo `packages/`, `apps/` and `services/` show up to 12 packages each
   by name, and a top-level directory with its own manifest (`package.json`,
   `cpanfile`, `go.mod`, `pyproject.toml`, `Cargo.toml`) counts as a package.
   Packages come after shared code and before plain directories; `temp/`,
   `tmp/` and build output are skipped.

It runs at every session and subagent start (every turn under OpenCode).
`DO_IT_MAP=off` turns it off.

### OpenCode hooks

OpenCode has no subagent-start hook; its plugin injects the posture into
every turn's system prompt instead. The plugin's default export carries the
OpenCode 1 hook object (`experimental.chat.system.transform`,
`tool.execute.before/after`; a throw blocks the tool) and a v2 `setup` that
registers `session` and `tool` hooks, which OpenCode 2 runs (verified on
2.1.2). Register the plugin as a directory on OpenCode 2 (`plugins`:
`.opencode/plugins`, which holds an `index.js`); a plugin file path is
skipped there. `scripts/install-hooks.mjs` picks the form from
`opencode --version`. The OpenCode 2 `execute` code tool cannot write or run
a command by itself on 2.1.2, and a nested tool call reaches the same guards.

### Token usage

On Claude Code, the `Stop` and `SubagentStop` hooks sum each main
session's and each subagent's tokens from its transcript and keep one line per
run in `~/.claude/do-it/usage/<day>.jsonl` (about 50 KB a heavy day) for 30
days (`DO_IT_USAGE_DAYS`). A line holds the tokens, the run's start and end
times, and the context size of its first turn (`ctx0`) and its largest turn
(`peak`). Older days roll up into `rollup.jsonl`, one row per day, agent, model
and project, kept 365 days (`DO_IT_USAGE_ROLLUP_DAYS`) for trends.
`DO_IT_USAGE_DIR` moves it all. Cost in dollars is not estimated, since prices
change; tokens only. Days in every report are local calendar days; the files
are named by UTC date.

- `/usage-it` writes an HTML report: totals, work and cache reads over time,
  by agent, model and project, a context-outliers table (main sessions by peak
  context) and a plan-meter section.
- `node skills/usage-it/scripts/usage.mjs [--days N, default 30 | --hours N]
  [--by agent|model|day|month|project] [--json]` prints the same rows as a
  table, rolled-up rows included (`--days 90 --by month` for a trend).
  `--from <iso> --to <iso>` keeps runs that ended in that window, so a step's
  usage is its start and end time. `--import` first backfills from the
  transcripts Claude Code already keeps. `--baseline` prints what do-it adds to
  every session next to the median start context.
- When a main session's context first passes `DO_IT_CLEAR_AT` tokens (default
  300000, `0` is off), the `Stop` hook shows one line suggesting `/pass-it`
  then `/clear`. It never blocks and adds nothing to the model's context.
- The plan meter: Claude Code caches its `/usage` percentages in
  `~/.claude.json`; the `Stop` hook and the report record each new reading, and
  the report charts the week, lists each day's growth and projects when the
  week would reach 100%. The report refreshes a stale cache first with `claude -p /usage` (no model call;
  `DO_IT_USAGE_REFRESH=0` turns it off) and re-imports the last two days of
  transcripts. `usage.mjs --snapshot` takes a reading now (or
  `--snapshot --week <pct> --resets <iso>` gives one by hand). Readings are
  account-wide; the tokens stored with them are this host's.

OpenCode notes for repos that use do-it:

- OpenCode reads `AGENTS.md`, not `CLAUDE.md`. Put the standards in
  `AGENTS.md` (a `CLAUDE.md` that is only `@AGENTS.md` works for both hosts).
- OpenCode 2 has no todo tool or LSP by default and allows
  `external_directory` by default; set it to `ask` or `deny` in
  `opencode.json` if the guards should not be sidestepped by paths outside the
  repo. `/setup-it` checks this and offers the fix.
- The OpenCode plugin records the same token usage into the ledger (the
  `event` hook on 1.x, `ctx.event.subscribe` on 2.x), so `/usage-it` covers
  both hosts. The event shapes are not yet confirmed on a live OpenCode 2. A
  per-work-item usage field is deferred; see
  `docs/issues/per-step-usage-record-on-do-it-work-items.md`.

## Configuration

Layered dotenv files: `~/.config/do-it/config.env` (yours, may hold secrets)
→ `<repo>/.do-it/config.env` (committed, no secrets) → `<repo>/.do-it/local.env`
(gitignored) → environment. A lint command or Jira URL set in the repo's
files applies only after you trust those values (`tracker.mjs trust`), so a
cloned repo cannot run commands or redirect your token. The tracker defaults to local files under
`docs/issues/`; GitHub uses `gh`, Jira uses REST v2 with a token. A new Jira
issue needs its project, components and epic or parent settled
(`JIRA_COMPONENTS`, `JIRA_DEFAULT_EPIC`, or `none` for either). Commits start
`<id>: ` with the Jira key, `gh-<n>` or the local tracking id. Full key list:
[skills/track-it/CONFIG.md](skills/track-it/CONFIG.md).

```bash
node skills/track-it/scripts/tracker.mjs config   # effective config, secrets redacted
```

Project docs are detected per repo: the context map (`CONTEXT-MAP.md`) and
context (`CONTEXT.md`; `GLOSSARY.md` and `GLOSSARY-MAP.md` as a fallback),
the changelog (`CHANGELOG.md`, `docs/changelog.md`, a
`.changeset/` directory, ...), ADRs (`docs/adr/`, `docs/decisions/`, ...),
the reference map, the to-do list (`docs/TODO.md`, `TODO.md`), roadmaps
(`docs/roadmap/`) and research notes (`docs/research/`). Override with
`DO_IT_CONTEXT`, `DO_IT_CONTEXT_MAP`, `DO_IT_CHANGELOG`, `DO_IT_ADR_DIR`, `DO_IT_REFERENCE_DIR`,
`DO_IT_TODO_FILE`, `DO_IT_ROADMAP_DIR`, `DO_IT_RESEARCH_DIR`. The hooks tell
every session which files are in use.

## Develop

```bash
npm test         # node --test, no dependencies
npm run check    # frontmatter, -it names, "Use when", line budget, skill calls, spawn caps, agent files and tools, links (and none leaving skills/), routing entries, OpenCode command drift
npm run gen      # regenerate .opencode/command/, commands/ and agents/
npm run eval     # routing eval: does each prompt in evals/routing.json reach the right skill
```

`npm run check` includes the routing eval. A new model-invoked skill needs
entries in `evals/routing.json`.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `npm test`,
`npm run check` and an install dry run on every push and pull request, on
Ubuntu and macOS (bash 3.2 for `install.sh`) with Node 18 and 22.

Design: [docs/DESIGN.md](docs/DESIGN.md). Decisions: [docs/adr/](docs/adr/).

## Credits

do-it began as a rewrite of the Doc Cycle in
[rshingleton/skills](https://github.com/rshingleton/skills) and borrows ideas
from several other repos. All text here is this repo's own; no code is copied.

| Source | What do-it took from it |
|--------|-------------------------|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | The lifecycle shape, building every ready phase after one approval, the size-based skip rule behind lane XS, artifact handoff between steps, the routing eval, and the adversarial check behind `doubt-it` |
| [denyszorinets/ballet](https://github.com/denyszorinets/ballet) | Fresh-context audit stages, the `done`, `blocked`, `failed` outcome that routes the next step, the three-round audit cap, assume-or-ask, and handing out-of-scope finds to the backlog |
| [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) | Reuse-first coding posture, one always-on core injected into subagents too, the finding format, a drift check, and the idea of a usage ledger rebuilt from session transcripts |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | The four coding principles behind `it-core` and the `step → verify:` plan form |
| [juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) | Terse voice and fixed report shapes with word caps for internal agent text. Its proxy, compress and per-turn tools are not used |
| [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) | The starting points for the discipline skills, rewritten here: `grill-it`, `name-it`, `design-it`, `test-it`, `debug-it`, `review-it`, `look-it-up`, `sketch-it`, `pass-it`, `skill-it`, `deepen-it`, `retro-it` |

Where do-it runs on or calls other tools, they keep their own licenses and
terms: [Claude Code](https://claude.com/claude-code),
[OpenCode](https://opencode.ai), the [GitHub CLI](https://cli.github.com),
the Jira REST API and Node.js. do-it has no runtime dependencies of its own.
