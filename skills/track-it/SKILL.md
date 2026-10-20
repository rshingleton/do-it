---
name: track-it
description: The issue-tracker seam for do-it: create, fetch, comment on, start, close and publish issues in the configured tracker (local docs/issues files by default, GitHub, or Jira). Use when a skill needs to read or update an issue, when the user gives an issue ref like #42, ABC-123 or an issue URL, or asks which tracker or tracker config is in effect.
---

# track-it

One interface, three trackers. Other skills call this one; none of them talks
to GitHub or Jira directly.

## Pick the route

1. **An MCP tool for that tracker is in your tool list** (a Jira or GitHub
   connector): use it for the operation. It carries the user's own auth.
2. **Otherwise**, the CLI beside this file:

   ```bash
   node <this skill's dir>/scripts/tracker.mjs <command> ...
   ```

Both routes do the same operations; results go into the work item's state
block the same way.

## Operations

| Command | Does | Local | GitHub (`gh`) | Jira (REST v2) |
|---------|------|-------|---------------|----------------|
| `config` | Effective config, secrets redacted, with the file each value came from, and `untrusted` keys | | | |
| `trust` | Pins the repo's current `DO_IT_LINT_CMD` / `JIRA_BASE_URL` values for this user ([CONFIG.md](CONFIG.md#trust)). Run it only when the user says to, after showing them the values | | | |
| `create --title T --type bug\|feature\|todo\|defer --body-file F` | New issue | `docs/issues/<slug>.md` | `gh issue create` | Task (Bug for `bug`) |
| `get <ref>` | Title, status, body, comments | reads the file | `gh issue view` | issue + comments |
| `comment <ref> --body-file F` | Add a comment | appends to `## Log` | `gh issue comment` | comment (wiki markup) |
| `start <ref>` | Work began | `status: in-progress` | adds `DO_IT_GITHUB_START_LABEL` if set | assigns `JIRA_ASSIGNEE` if unassigned, transition `JIRA_START_TRANSITION` |
| `close <ref> --body-file F` | Work shipped | `status: closed` | `gh issue close` | comment, transition `JIRA_DONE_TRANSITION` |
| `publish --spec F` | Parent + one child per phase | nothing | parent issue with a task list | Epic (or `JIRA_DEFAULT_EPIC`) + Tasks |

`publish` takes JSON: `{"title", "body", "phases": [{"n", "title", "body"}],
"parent"?}`. Write it to a temp file or pipe it with `--spec -`. The caller
records the returned `parent` and `phases` under `tracker:` in the state
block, through the work-item script ([STATE.md](../do-it/STATE.md)).

A ref routes by its shape, whatever the default tracker is:
`docs/issues/x.md` is local; `owner/repo#42`, `#42`, `gh-42` or an issue URL
on any GitHub host is GitHub; `ABC-123` (any case) or a `/browse/ABC-123` URL
is Jira. GitHub results carry `owner/repo#N` so later calls reach the same
repo; use that form when recording refs. `create` and `publish` use
`DO_IT_TRACKER` unless `--tracker` says otherwise. When `gh` rejects a label,
the issue is still created and the result lists `labelsDropped`.

## Configuration

See [CONFIG.md](CONFIG.md). Run `tracker.mjs config` before the first remote
call in a session; act on its `warnings` (a secret in a committed file) and its `untrusted`
repo values (show them to the user and offer `trust`).

## Rules

- Bodies are Markdown; the Jira adapter converts them to wiki markup.
- Never print tokens. Never write secrets into `.do-it/config.env`.
- A tracker failure is reported in the closing message and never blocks
  building or shipping. Missing config: say which keys, point to CONFIG.md.
- Jira transitions are matched by name; when one is missing the CLI returns
  `skipped` with the available names. Report it; do not guess another.
