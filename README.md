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
| Intake | `issue-it` | Files a bug, feature, todo or deferral in the configured tracker |
| Plan | `/plan-it` | Grill scaled to the lane, seams, `step → verify:` steps, ADR only when warranted |
| Build | `/build-it` | Test-first at the agreed seams; parallel phases when ready; **never commits** |
| Audit | `/audit-it` | Fresh-context reviewers (spec, standards, compliance, architecture); numbered verdict; failures loop back to build, at most 3 rounds |
| Ship | `/ship-it` | Confirms assumptions, finalizes ADRs, glossary and changelog, updates the tracker, then asks: commit now or leave it for review |

| Lane | When | Steps |
|------|------|-------|
| XS | 1-2 files, small, no risk area | build → self-review → ship |
| S | One coherent change, one session | plan → build → audit → ship |
| M | Several slices, a new seam, or multi-session | grill → phased plan → build → audit → ship |
| L | Epic or bundled work | capability map → one S/M item per module |

The user is asked at three points at most: plan approval (and grill rounds for
M), a build stop condition, and the ship question. Work stays uncommitted in
the working tree until ship, and ship commits only on a yes.

State lives in one YAML block at the top of the plan file
(`docs/planning/<id>.md` or `docs/planning/<id>/README.md`), so any step
resumes in a fresh session. See [skills/do-it/STATE.md](skills/do-it/STATE.md).

## Supporting skills

`core` (the always-on posture), `tracker`, `compliance`, `doubt`, plus
`grilling`, `domain-modeling`, `codebase-design`, `tdd`,
`diagnosing-bugs`, `code-review`, `research`, `prototype`, `handoff` and
`writing-for-agents`.

## Install

Requires Node 18+. Clone, then pick one.

**Symlinks (Claude Code and OpenCode):**

```bash
scripts/install.sh            # skills, OpenCode commands, hooks on
scripts/install.sh --dry-run  # show what it would do
scripts/install.sh --no-hooks
scripts/install.sh --uninstall
```

Skills link into `~/.claude/skills` and `~/.agents/skills` (OpenCode reads
both). An existing skill of the same name from another repo is skipped unless
you pass `--force`. Hooks register in `~/.claude/settings.json` and
`~/.config/opencode/opencode.json`; each file is backed up as
`*.bak-do-it` first.

**Claude Code plugin:**

```text
/plugin marketplace add <path or git URL of this repo>
/plugin install do-it@do-it
```

The plugin carries skills and hooks. Use it or the symlinks for Claude Code,
not both.

## Hooks

On by default; `DO_IT_HOOKS=off` turns them off for a user, a repo or a shell.

| When | Does |
|------|------|
| Session start, subagent start | Injects the `core` posture and pointers to the repo's standards and compliance rules |
| Before an edit | Blocks HIGH hits: secrets, env files, rules in `.compliance-rules/checks.json` |
| After an edit | Reports MEDIUM/LOW hits; runs `DO_IT_LINT_CMD` on the file and feeds failures back |
| Before `git commit` | Scans the staged diff; blocks on HIGH |

Mechanical rules (a regex decides) live in `checks.json` and run on every
edit; judgement rules (`.compliance-rules/*.md`) are checked by `audit-it`.
See [skills/compliance/SKILL.md](skills/compliance/SKILL.md).

OpenCode has no subagent-start hook; its plugin injects the posture into
every turn's system prompt instead. The plugin targets the OpenCode 1 plugin
API (`experimental.chat.system.transform`, `tool.execute.before/after`).

## Configuration

Layered dotenv files: `~/.config/do-it/config.env` (yours, may hold secrets)
→ `<repo>/.do-it/config.env` (committed, no secrets) → `<repo>/.do-it/local.env`
(gitignored) → environment. The tracker defaults to local files under
`docs/issues/`; GitHub uses `gh`, Jira uses REST v2 with a token. Full key
list: [skills/tracker/CONFIG.md](skills/tracker/CONFIG.md).

```bash
node skills/tracker/scripts/tracker.mjs config   # effective config, secrets redacted
```

## Develop

```bash
npm test         # node --test, no dependencies
npm run check    # frontmatter, line budget, skill calls, links, OpenCode command drift
npm run gen      # regenerate .opencode/command/ from the skills
```

Design: [docs/DESIGN.md](docs/DESIGN.md). Decisions: [docs/adr/](docs/adr/).

## Credits

The discipline skills (`grilling`, `domain-modeling`, `codebase-design`,
`tdd`, `diagnosing-bugs`, `code-review`, `research`, `prototype`, `handoff`,
`writing-for-agents`) come from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT) by way of
[rshingleton/skills](https://github.com/rshingleton/skills). Ideas adapted
from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills),
[denyszorinets/ballet](https://github.com/denyszorinets/ballet),
[dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) and
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills).
