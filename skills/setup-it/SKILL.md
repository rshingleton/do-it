---
name: setup-it
description: Set up a repo for do-it once: tracker, lint command, doc paths, compliance checks and the AGENTS.md section, detected first and written only on your approval.
disable-model-invocation: true
argument-hint: "[--tracker local|github|jira]"
---

# setup-it

One-time onboarding for a repo. Safe to re-run: it shows what would change
and writes nothing that is already right.

## 1. Detect (never ask what you can read)

Read, without writing anything:

- **Project state:** new or existing, per the project-state table in
  [SCOUT.md](../do-it/SCOUT.md) §1. Existing and no `docs/reference/`: note
  it for §4.
- **Commands:** test, lint, format, type-check, from `package.json` scripts,
  `Makefile`, `pyproject.toml`, `build.gradle`/`pom.xml`, `Cargo.toml`, the CI
  workflow, and test scripts (`*.test.sh`, `test/`, `tests/`). Record `none`
  for a kind that does not exist. Pick a per-file lint command if the linter
  takes paths (for `DO_IT_LINT_CMD`, with `{file}`). They are recorded once,
  in the `AGENTS.md` `Commands:` line ([PROPOSAL.md](PROPOSAL.md) §4), which
  build-it and map-it read instead of rediscovering.
- **Current config:** `node <track-it dir>/scripts/tracker.mjs config` (the
  `track-it` skill's directory is `../track-it/`). It shows existing
  `.do-it/` values, the detected glossary, changelog, ADR and reference
  paths, and warnings.
- **Tracker hints:** whether `origin` (not forks or upstreams) is GitHub,
  Jira keys in recent commit subjects, `JIRA_*` names in `.env.example`, an
  existing `docs/issues/`. `--tracker` overrides all of them.
- **Agent docs:** `AGENTS.md`, `CLAUDE.md`, whether either already has a
  do-it section, the repo's own writing rules (the appended text follows
  them), and any other workflow already defined there that uses
  `docs/issues/` or `docs/planning/` (flag the overlap in the proposal).
- **Compliance:** `.compliance-rules/` and any `checks.json`.

## 2. Propose (one turn, every item with a default)

Follow [PROPOSAL.md](PROPOSAL.md). Show each file as the exact text or diff
it would write, and mark items that are already correct as "no change".

## 3. Write on approval

Write only the items the user accepts, then re-run
`tracker.mjs config` and show the result. Any warning (a secret in the
committed file, a configured path that does not exist) is fixed before
closing.

## 4. Close

> Set up <repo>: <files written>. Tracker: <kind>. Lint: <command | none>.
> Skipped / Not checked / Risk.
> **Next:** `/map-it` (existing repo, no map), else `/do-it "<first change>"`.

## Rules

- Never write a secret anywhere in the repo. Tokens go in
  `~/.config/do-it/config.env` or `.do-it/local.env` (see the `track-it`
  skill's [CONFIG.md](../track-it/CONFIG.md)); say which keys the user needs
  to set there and let them do it.
- Append to `AGENTS.md`; never rewrite what is there.
- Re-running replaces only the do-it section and the `.do-it/config.env` keys
  it manages; everything else is left as found.
