# do-it configuration

Dotenv files (`KEY=value`, `#` comments, optional quotes, no interpolation),
read in this order; later wins:

| # | File | Holds | Commit it? |
|---|------|-------|------------|
| 1 | built-in defaults | | |
| 2 | `~/.config/do-it/config.env` (`$XDG_CONFIG_HOME`) | Your defaults for every repo, and secrets | n/a (`chmod 600`) |
| 3 | `<repo>/.do-it/config.env` | The project's tracker and hook settings | Yes. No secrets. |
| 4 | `<repo>/.do-it/local.env` | Your overrides and secrets for this repo | No (gitignore it) |
| 5 | Environment variables `DO_IT_*`, `JIRA_*`, `GITHUB_*` | One-off overrides, CI | n/a |

`tracker.mjs config` prints the result and which file set each value. It
warns when a token-like key sits in the committed project file.

## Trust

Two keys decide what runs and where your token goes: `DO_IT_LINT_CMD` (a
shell command the hooks run after every edit) and `JIRA_BASE_URL` (the host
that receives `JIRA_API_TOKEN`). Set in a repo's `.do-it/config.env` or
`.do-it/local.env`, they apply only after you trust those exact values on
your machine:

```bash
node skills/track-it/scripts/tracker.mjs config   # "untrusted": the keys ignored, with the values
node skills/track-it/scripts/tracker.mjs trust    # pins the current values
```

Until then the value from your user config, the environment or the default
applies, and the session notice says which keys were ignored. Trust is a
hash of the values in `~/.config/do-it/trusted`, so every clone and worktree
with the same values shares it, and a changed value (a pull, a teammate's
edit) needs trusting again. To revoke, delete the line. The reasons are in
the repo's ADR 0006 (repo files are untrusted for commands).

## Keys

### General

| Key | Default | Meaning |
|-----|---------|---------|
| `DO_IT_TRACKER` | `local` | `local`, `github` or `jira`: where `create` and `publish` go |
| `DO_IT_ISSUES_DIR` | `docs/issues` | Local tracker directory |
| `DO_IT_PLANNING_DIR` | `docs/planning` | Work items |
| `DO_IT_PUBLISH_PLANS` | `false` | `scope-it` publishes lane M plans to the tracker without `--publish` |
| `DO_IT_COMMIT` | `ask` | `ask`: ship-it offers to commit. `never`: ship-it only proposes the message |
| `DO_IT_PROTECTED_BRANCHES` | `main,master` | ship-it offers a feature branch before committing here |

### Project docs

Empty means auto-detect: the first candidate that exists, else the default.
`DO_IT_GLOSSARY` is read as `DO_IT_CONTEXT` when that is unset.
`tracker.mjs config` shows the result under `docs`, and the hooks put it in
every session.

| Key | Candidates, in order | Default when none exist |
|-----|----------------------|-------------------------|
| `DO_IT_CONTEXT` | `CONTEXT.md`, `docs/CONTEXT.md`, then `GLOSSARY.md`, `docs/GLOSSARY.md`, `docs/glossary.md` | `CONTEXT.md` |
| `DO_IT_CONTEXT_MAP` | `CONTEXT-MAP.md`, `docs/CONTEXT-MAP.md`, then `GLOSSARY-MAP.md` | `CONTEXT-MAP.md` |
| `DO_IT_CHANGELOG` | `CHANGELOG.md`, `docs/CHANGELOG.md`, `docs/changelog.md`, `CHANGES.md`, `HISTORY.md`, `.changeset/` | none (ship-it skips the entry) |
| `DO_IT_ADR_DIR` | `docs/adr`, `docs/decisions`, `docs/architecture/decisions`, `doc/adr`, `adr` | `docs/adr` |
| `DO_IT_REFERENCE_DIR` | `docs/reference` | `docs/reference` |
| `DO_IT_TODO_FILE` | `docs/TODO.md`, `TODO.md`, `docs/todo.md` | `docs/TODO.md` (log-it) |
| `DO_IT_ROADMAP_DIR` | `docs/roadmap`, `docs/roadmaps` | `docs/roadmap` (roadmap-it) |
| `DO_IT_RESEARCH_DIR` | `docs/research` | `docs/research` (look-it-up) |

### Hooks

| Key | Default | Meaning |
|-----|---------|---------|
| `DO_IT_HOOKS` | `on` | `off` disables every do-it hook for this scope |
| `DO_IT_COMPLIANCE_DIR` | `.compliance-rules` | Rule files; `checks.json` holds the machine checks |
| `DO_IT_LINT_CMD` | (none) | Run after each edit; `{file}` is replaced by the edited path, e.g. `npx eslint {file}` |
| `DO_IT_HOOK_TIMEOUT` | `20` | Seconds before the lint command is abandoned; a value that is not a positive number uses 20 |
| `DO_IT_MAP` | `on` | `off` drops the code map from session context. The map is the context map's tables (`CONTEXT-MAP.md`) when it exists, else the reference dir's `module-map.md`, else a directory summary from `git ls-files`; about 1500 characters |

### GitHub

Auth is whatever `gh auth status` shows.

| Key | Default | Meaning |
|-----|---------|---------|
| `DO_IT_GITHUB_REPO` | current repo | `owner/name`, for issues kept in another repo |
| `DO_IT_GITHUB_START_LABEL` | (none) | Label `start` adds |

### Jira

| Key | Default | Meaning |
|-----|---------|---------|
| `JIRA_BASE_URL` | | e.g. `https://jira.example.org` |
| `JIRA_PROJECT_KEY` | | Project for new issues; `create` checks it exists (`--project` overrides) |
| `JIRA_COMPONENTS` | | Comma-separated components for new issues, checked against the project; `none` files without one. Unset: `create` needs `--component`. Not trust-guarded: a repo's own config can set it (or `JIRA_DEFAULT_EPIC`) to `none` |
| `JIRA_API_TOKEN` | | Personal access token (Data Center) or API token (Cloud). User or local file only |
| `JIRA_EMAIL` | | Cloud account email; setting it selects basic auth |
| `JIRA_AUTH` | auto | `bearer` or `basic`, to override the auto choice |
| `JIRA_ISSUE_TYPE` | `Task` | Type for `create` (bugs use `Bug`) |
| `JIRA_EPIC_TYPE` | `Epic` | Parent type for `publish` |
| `JIRA_DEFAULT_EPIC` | | Epic for new issues, and `publish` puts phases under it instead of creating one; `none` files without one. Unset: `create` needs `--epic` or `--parent` |
| `JIRA_SUBTASK_TYPE` | `Sub-task` | Type `create --parent` uses |
| `JIRA_EPIC_LINK_FIELD` | | Data Center epic link field, e.g. `customfield_10008`. Unset: uses `parent` (Cloud) |
| `JIRA_EPIC_NAME_FIELD` | | Data Center epic name field, when epics require one |
| `JIRA_ASSIGNEE` | | Username (Data Center) or accountId (Cloud) that `start` assigns when unassigned |
| `JIRA_START_TRANSITION` | `In Progress` | Transition name for `start` |
| `JIRA_DONE_TRANSITION` | `Done` | Transition name for `close` |

## Examples

Team default in the repo (`.do-it/config.env`, committed):

```sh
DO_IT_TRACKER=jira
JIRA_BASE_URL=https://jira.example.org
JIRA_PROJECT_KEY=CDS
JIRA_COMPONENTS=Core
JIRA_DEFAULT_EPIC=CDS-100
JIRA_EPIC_LINK_FIELD=customfield_10008
DO_IT_LINT_CMD=npx eslint --max-warnings=0 {file}
```

Each developer runs `tracker.mjs trust` once for the URL and lint command
(see Trust).

Your token, once for every repo (`~/.config/do-it/config.env`):

```sh
JIRA_API_TOKEN=...
JIRA_ASSIGNEE=jdoe
```
