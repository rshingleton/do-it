<p align="center"><img src="docs/assets/do-it.png" alt="Retro badge: a man with a silver pompadour and tinted aviators points at the viewer above the words DO IT" width="240"></p>

# do-it

A skills repo for Claude Code and OpenCode: one workflow from issue to ship
that scales with the size of the work, plus always-on coding standards and
compliance hooks.

```text
/do-it "rate-limit the login endpoint"
  → lane S: plan (one approval) → build → audit → ship (one question)
```

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
uncommitted in the working tree until ship, and ship commits only on a "do it". Risk-area work
gets a rollback note at ship. Between steps, `/do-it` suggests a fresh
session when the context is getting long; the state block makes that free.

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

`/log-it` sorts what it is given: issues worth planning, with acceptance
criteria, and lighter one-line to-dos.

## Setting up and improving

| Skill | Does |
|-------|------|
| `/setup-it` | One-time per repo: detects commands, tracker and doc paths, proposes `.do-it/config.env`, a starter `checks.json` and an `AGENTS.md` section, writes only what you accept |
| `/retro-it` | Turns repeated mistakes and audit guardrail candidates into `checks.json` rules, lint config, standards lines or issues |

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
| `skill-it` | Writing skills and agent instructions |

Every name is an `-it` verb so it never collides with another skill repo
installed beside this one.

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
scripts/install.sh            # skills, OpenCode commands, hooks on
scripts/install.sh --dry-run  # show what it would do
scripts/install.sh --no-hooks
scripts/install.sh --uninstall
```

Skills link into `~/.claude/skills` and `~/.agents/skills` (OpenCode reads
both). The five role agents in `agents/` (`it-scout`, `it-reviewer`,
`it-builder`, `it-planner`, `it-skeptic`) link into `~/.claude/agents`; each
pins its own model, so skills that delegate pick the tier by naming the agent.
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
| Before `git commit` | Scans the staged diff; blocks on HIGH |

Mechanical rules (a regex decides) live in `checks.json` and run on every
edit; judgement rules (`.compliance-rules/*.md`) are checked by `prove-it`.
See [skills/guard-it/SKILL.md](skills/guard-it/SKILL.md).

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

OpenCode has no subagent-start hook; its plugin injects the posture into
every turn's system prompt instead. The plugin targets the OpenCode 1 plugin
API (`experimental.chat.system.transform`, `tool.execute.before/after`).

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
npm run check    # frontmatter, line budget, skill calls, agent files and tools, links, OpenCode command drift
npm run gen      # regenerate .opencode/command/ from the skills
npm run eval     # routing eval: does each prompt in evals/routing.json reach the right skill
```

`npm run check` includes the routing eval. A new model-invoked skill needs
entries in `evals/routing.json`.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `npm test`,
`npm run check` and an install dry run on every push and pull request, on
Ubuntu and macOS (bash 3.2 for `install.sh`) with Node 18 and 22.

Design: [docs/DESIGN.md](docs/DESIGN.md). Decisions: [docs/adr/](docs/adr/).

## Credits

These skills are this repo's own rewrites of ideas from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT), by way of
[rshingleton/skills](https://github.com/rshingleton/skills):
`grill-it` (grilling), `name-it` (domain-modeling), `design-it`
(codebase-design), `test-it` (tdd), `debug-it` (diagnosing-bugs), `review-it`
(code-review), `look-it-up` (research), `sketch-it` (prototype), `pass-it`
(handoff), `skill-it` (writing-for-agents), `deepen-it`
(improve-codebase-architecture), and `retro-it` (retro). Ideas adapted
from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills),
[denyszorinets/ballet](https://github.com/denyszorinets/ballet),
[dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail),
[juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) (terse
subagent reports) and
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills).
