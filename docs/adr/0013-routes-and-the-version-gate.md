---
status: accepted
---

# The managed install is the managed route; the plugin and `skills` CLI are reported

do-it reaches a host by one of three routes, and it manages one of them.
`scripts/install.mjs` is the managed route on both hosts: it is the only route
that carries the OpenCode commands and agents, and the only one that serves
both hosts at once, and it is what the one-liner bootstrap runs. It copies
skills, agents and commands, and links them only with `--link` for developing
do-it itself ([ADR 0019](0019-install-copies-by-default.md)). The Claude
Code plugin carries skills, agents and hooks for Claude Code alone, and a
`skills` CLI install carries skills alone, from a local path that
`skills update` never touches
(the facts sheet in game-skillet's `docs/research/installer-updater-facts.md`,
C2; `scripts/install.mjs` and `.claude-plugin/plugin.json` here).

Claude Code decides an update from `version` in `.claude-plugin/plugin.json`,
not from file content (facts A2), so every commit since the initial one still
ships to plugin users as `0.1.0`; they reach it only when the string moves.
`scripts/version-gate.mjs` fails a change under `skills/`, `agents/` or
`hooks/` that leaves it alone: the version must be higher, compared
numerically, than the merge base's and the base ref's tip; and `package.json`,
when it exists, must carry the same string. CI runs it, and so does `npm run
check` against `origin/main`.

game-skillet makes the `skills` CLI its managed route for every non-Claude
client and drops hand-copy and symlink as routes
(`../game-skillet/docs/adr/0004-distribution-and-versioning.md`). That fits a
skills-only payload. Adopting the CLI here would put every skill on the machine
twice, since OpenCode's commands and agents still need the managed install, and
the client's precedence order would decide which copy wins.

So a CLI install found on a machine is detected and reported by
`scripts/doctor.mjs`, never adopted: the report names its source path and
recorded hash and says to re-run `npx skills@latest add <path>`, because the
CLI has no update for a local install. The alternatives rejected: adopting the CLI alongside the managed
install (duplicate skills, two things to keep honest); dropping the CLI from
the docs and the doctor (people reach for it anyway, and silence reads as
support).

Evidence: `README.md` Install and Update; `scripts/install.mjs`;
`scripts/version-gate.mjs`; `scripts/doctor.mjs`; `docs/reference/install-routes.md`.

## Options considered

Omitting `version` from the manifest makes the commit SHA the version (facts
A2), which is the other honest fix for the stale-plugin problem. It was
rejected because the published route needs a number a release can name, and a
gate that requires a bump is the smaller change.

## Execution notes

Built 2026-11-16, audited in two rounds. Round 1's nine Shoulds were fixed.
Round 2 found eleven more and no Must: six fixed, two accepted (a push that
changes a gated path must carry a higher version than the tip it replaces; a
base version outside `major.minor.patch` falls back to inequality), one filed
as T280, two Nice left.

What the build learned:

- `scripts/install.mjs` and `scripts/doctor.mjs` import each other (`readRef`
  against `planLinks`). Both are hoisted declarations, so it works; moving
  `readRef` into `scripts/lib/` is T273.
- The doctor reads the plugin from `claude plugin list --json`, which on
  2.1.325 keys the entry `id` rather than the documented `pluginId`; both are
  accepted.
- A fresh clone has no `FETCH_HEAD`, so a first install prints `never fetched`
  (T275).
- The build ran beside another item's session in one checkout: three commits
  landed after `start`, so `base_ref` covers them and the reviewers were given
  the tree against the later commit instead.
