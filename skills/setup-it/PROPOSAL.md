# The setup proposal

One numbered list, so the user can answer "yes, but 2 is github and skip 4".

## 1. `.do-it/config.env` (committed, no secrets)

```sh
# do-it project config. Secrets go in .do-it/local.env or ~/.config/do-it/config.env.
DO_IT_TRACKER=local
DO_IT_LINT_CMD=npx eslint --max-warnings=0 {file}
```

- `DO_IT_TRACKER`: `local` by default. `github` when the remote is GitHub and
  the team tracks there; `jira` when commit subjects carry Jira keys. For
  Jira add `JIRA_BASE_URL` and `JIRA_PROJECT_KEY` here, and name the keys the
  user sets privately (`JIRA_API_TOKEN`, plus `JIRA_EMAIL` on Cloud).
- `DO_IT_LINT_CMD`: only when the linter accepts a file path and runs in a
  few seconds; otherwise leave it out and say why.
- Doc paths (`DO_IT_GLOSSARY`, `DO_IT_CHANGELOG`, `DO_IT_ADR_DIR`,
  `DO_IT_REFERENCE_DIR`): only when detection picked the wrong file.
- Keys already set to the same value: "no change".

## 2. `.gitignore`

Add `.do-it/local.env` if missing.

## 3. `.compliance-rules/checks.json` (optional)

Offer only; default is skip unless the repo has compliance rules already.
When accepted, start with the rules the repo's own docs imply (a banned API,
a logging rule) in the `guard-it` format, each with a line it would catch.
Built-in secret rules need no entry.

## 4. `AGENTS.md` section

Appended under a `## do-it` heading (replaced in place on re-run):

```markdown
## do-it

- Test: `npm test`. Lint: `npm run lint`. Format: `npm run format`. Types: `npm run typecheck`.
- Layout: `src/` app code, `test/` tests, `docs/adr/` decisions.
- Work items live in `docs/planning/`; issues in `docs/issues/`.
```

Commands and layout only, each verified to exist. No rules that tooling or
`it-core` already carries.

## 5. `CLAUDE.md`

When missing, a one-line file: `@AGENTS.md`. When present without that
pointer, offer to add it.

## 6. Next step

Existing repo without `docs/reference/`: offer `/map-it`. New repo: the
greenfield agenda runs with the first `/do-it`.
