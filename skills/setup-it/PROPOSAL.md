# The setup proposal

One numbered list, so the user can answer "yes, but 2 is github and skip 4".

## 1. `.do-it/config.env` (committed, no secrets)

```sh
# do-it project config. Secrets go in .do-it/local.env or ~/.config/do-it/config.env.
DO_IT_TRACKER=local
DO_IT_LINT_CMD=npx eslint --max-warnings=0 {file}
```

- The file is written even when every value is a default: its presence marks
  the repo as set up (the do-it scout checks for it).
- `DO_IT_TRACKER`: `local` by default. `github` when `origin` is GitHub and
  its issues are in use (offer it; confirm in the proposal); `jira` when
  commit subjects or `.env.example` show Jira. For
  Jira add `JIRA_BASE_URL` and `JIRA_PROJECT_KEY` here, and name the keys the
  user sets privately (`JIRA_API_TOKEN`, plus `JIRA_EMAIL` on Cloud).
- `DO_IT_LINT_CMD`: only when the linter accepts a file path and runs in a
  few seconds; otherwise leave it out and say why.
- `DO_IT_LINT_CMD` and `JIRA_BASE_URL` here apply only once each developer
  trusts them (the track-it skill's CONFIG.md, Trust). Say so in the
  proposal; after writing, offer `tracker.mjs trust` and run it only on the
  user's yes.
- Doc paths (`DO_IT_CONTEXT`, `DO_IT_CHANGELOG`, `DO_IT_ADR_DIR`,
  `DO_IT_REFERENCE_DIR`): only when detection picked the wrong file.
- `DO_IT_CONTEXT_MAP`: only when the repo's map exists at a path other than
  the default `CONTEXT-MAP.md` (for example `docs/CONTEXT-MAP.md`).
  Never propose creating a map; it is created with the first area context
  below the root.
- Keys already set to the same value: "no change".

## 2. `.gitignore`

Add `.do-it/local.env` if missing.

## 3. `.compliance-rules/checks.json` (optional)

Offer only; default is skip unless `.compliance-rules/` already holds rule
documents (`*.md`). When accepted, start with the rules those documents imply
(a banned API, a logging rule) in the format in
[guard-it](../guard-it/SKILL.md), each with a line it would catch. Propose
only rules that pass guard-it's flood check: run `scan.mjs` over the current
tree, and drop or narrow any rule that hits existing code wholesale. Built-in
secret rules need no entry.

## 4. `AGENTS.md` section

Appended under a `## do-it` heading (replaced in place on re-run):

```markdown
## do-it

- Commands: test `npm test`; lint `npm run lint`; format `npm run format`; types `npm run typecheck`.
- Layout: `src/` app code, `test/` tests, `docs/adr/` decisions.
- Work items live in `docs/planning/`; issues in `docs/issues/`.
```

Commands and layout only, each verified to exist. No rules that tooling or
[it-core](../it-core/SKILL.md) already carries. When `AGENTS.md` already
defines another workflow over `docs/issues/` or `docs/planning/`, say so in
the proposal and ask which one owns those folders. The `Commands:` line is the one place the repo's
check commands are recorded: build-it and map-it read it first and only
discover commands themselves when it is missing (then suggest `/setup-it`).

## 5. `CLAUDE.md`

When missing, a one-line file: `@AGENTS.md`. When present without that
literal line (a Markdown link to AGENTS.md does not load it), offer to add
it.

## 6. Next step

Existing repo without `docs/reference/`: offer `/map-it`. New repo: the
greenfield agenda runs with the first `/do-it`.
