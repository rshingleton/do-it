---
name: pass-it
description: Write a short handoff note so a fresh session or another agent can pick up exactly where this one stops.
argument-hint: "[what the next session is for]"
disable-model-invocation: true
---

# pass-it

A handoff note carries only what the next session cannot read for itself.
Everything already on disk gets a pointer, not a summary.

## 1. Where it goes

The OS temp directory (`$TMPDIR`, else `/tmp`; `%TEMP%` on Windows), as
`handoff-<repo>-<yyyymmdd-hhmm>.md`, never in the repo. Give the user the
absolute path.

## 2. What it says

```markdown
# Handoff: <one-line goal>

Next session is for: <the user's argument, or the obvious next step>

## Work item
<docs/planning/<id>(.md)>: lane <x>, status <y>. The state block there is
the source of truth; read it first.
Next step: <from do-it's status table, e.g. "/do-it <id>" resumes build-it>

## Since the state block was last written
- <decisions, findings or changes not yet recorded anywhere>

## Open questions
- <what is undecided, and who decides>

## Read first
- <paths, issue refs, ADRs, commits that matter, each with one line on why>

## Load
- <skills the next session should use, and for what>
```

Without a do-it work item, the `Work item` section names the branch, the
uncommitted files (`git status --short`) and the next concrete action.

## 3. Rules

- **Pointers over copies.** Plans, issues, ADRs, diffs and commits are
  referenced by path, ref or hash. If something important is only in the
  conversation, write it into the work item's state block or plan first (it
  is a decision or an assumption), then point at it.
- **Short.** One screen. The next session reads it before anything else.
- **Redacted.** No tokens, passwords, keys or personal data; write
  `<REDACTED>` where one would have gone.
- **Honest about state.** Say what is unverified or half-done. "Tests not
  run since the last edit" is worth more than a confident summary.
