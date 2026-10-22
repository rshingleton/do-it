---
name: usage-it
description: Report token usage by agent, model, project and day as an HTML page, from the usage ledger the hooks keep.
argument-hint: "[--days N | --hours N] [--import]"
disable-model-invocation: true
---

# usage-it

Shows where tokens went: main sessions and subagents, by model and project,
over time. Read-only: it reads the ledger and writes one HTML file.

## The ledger

The `Stop` and `SubagentStop` hooks add one line per agent run to
`~/.claude/do-it/usage/<day>.jsonl` (override with `DO_IT_USAGE_DIR`). Raw
days are kept 30 days (`DO_IT_USAGE_DAYS`); older days roll up into
`rollup.jsonl`, one row per day, agent, model and project, kept 365 days
(`DO_IT_USAGE_ROLLUP_DAYS`). Tokens only, no dollar estimate: prices change.
`scripts/ledger.mjs` owns reading, writing and pruning; do not edit the files.

## 1. Fill the ledger if it is empty

Without hooks installed, or on a first run, the ledger has nothing. Run:

```bash
node <this skill's directory>/scripts/usage.mjs --import --days 30 --by agent
```

It backfills from the transcripts Claude Code already keeps and prints a
summary. Safe to repeat: a run is keyed by its id and replaced, never added
twice. Skip this step when the ledger already has recent days.

## 2. Build the report

```bash
node <this skill's directory>/scripts/report.mjs --days <N> --open
```

`N` is the user's range, default 30. For a range in hours, pass `--hours <N>`
instead (raw days only, so at most 30 days back). Past 60 days the charts group by month.
It prints the path of the file it wrote
(`~/.claude/do-it/reports/usage-<date>.html`); `--out <file>` writes elsewhere.
The page is self-contained: no network, light and dark themes.

## 3. Say what it shows

Give the path, then at most five lines taken from the page's "What stands out"
list and its tables (the top-sessions table shows the heaviest sessions by id, project and day): the largest consumer, whether main sessions ran on the
top model, unpinned agent types (no model of their own) on the top model, and the cache-read share.
Quote numbers from the report; do not infer causes it does not show. Nothing
recorded for the range: say so and name the ledger directory.

## Reading it

- Work tokens are input, output and cache writes. Cache reads are the context
  re-read each turn; they are cheap per token but dominate long sessions.
- `main` is the user's own session; every other row is a delegated agent run.
- A session's model is the one it used most; a session that switched models
  counts under the majority.
- Sessions of other repos appear too, under their project name.

For a quick table instead of a page: `usage.mjs --days N --by agent|model|day|month|project`.
