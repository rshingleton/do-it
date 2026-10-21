---
status: accepted
---

# One intake skill, two stores

Work was entered through `log-it` (issues) or `todo-it` (one-line to-dos), and
the user had to decide which before typing. `log-it` is now the only skill:
it sorts each item into an issue or a to-do from the text, defaults to a
to-do when unclear, and also lists, reviews, closes and promotes both.
`todo-it` is removed.

The stores stay separate. Issues have status, acceptance criteria, a log and
possibly a GitHub or Jira ref; to-dos are lines that vanish when closed. One
backlog file would break remote trackers, lose per-issue status and bodies,
and make every add edit the same file. A wrong call is cheap to undo:
promoting a to-do to an issue files it properly, and an unclear item landing
as a to-do costs a line, where a wrong issue costs a remote ticket.

`track-it` stays a separate seam: it is called by the build flow to fetch and
close issues by ref, which is not intake. The combined list reads local
issues through `tracker.mjs list`; GitHub and Jira issues are not listed.

## Execution notes

- `list --status` takes open, closed or all; `in-progress` counts as open.
  Files in the issues directory with no title are skipped.
- Routing eval after the merge: 95.5% (threshold 90%). `log-it` now ranks
  first for 8 of 10 positives, and its longer description pulls one
  `name-it` prompt toward it; watch this when either description changes.
- Remote (GitHub, Jira) issues are not in the combined list; `list` says so.
