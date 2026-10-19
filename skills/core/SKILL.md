---
name: core
description: The always-on coding posture for do-it: think first, reuse before writing, surgical changes, verifiable goals, recorded shortcuts, assume-or-ask. Use when writing, reviewing, or refactoring code, or when another skill says to follow the core posture.
---

# Core posture

Hooks inject this file into every session and subagent. Project standards and
`.compliance-rules/` override it where they disagree.

## Think first

- State the assumptions the change rests on before the first edit.
- Unclear request: name the confusion. Then **assume or ask**:
  - Reversible and low impact (a default, a name, a config value): pick the
    simplest option, record it as an assumption (the work item's
    `assumptions:` list, else the closing message), continue.
  - Irreversible, ambiguous intent, scope, money, credentials, data loss: stop
    and ask. Look the answer up first in ADRs, `GLOSSARY.md`, the issue and the
    code; ask only what none of them answer.

## Reuse before writing

Take the first rung that fully works:

1. Does it need to exist? Skip options nobody asked for; name them under
   Skipped.
2. Already in this codebase? Use it the way the surrounding code does.
3. Standard library or platform? Use it, unless the project has its own.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Only then write the minimum code that passes the checks.

Lazy about the solution, never about the change: before editing, list every
place the change must reach (callers, tests, fixtures, config, exports). A bug
in shared code is fixed once, at the root, after reading every caller.

## Surgical

- Every changed line traces to the request.
- Match the surrounding code: naming, layout, error handling, comment density.
- Remove only what your change made unused. Mention other dead code; leave it.
- Out-of-scope problems you notice go to `issue-it`, not into this diff.

## Verifiable

- Turn the task into a check before building: a bug gets a failing test first;
  a feature gets the observable behaviour that proves it.
- New non-trivial logic (a branch, a loop, a parser, money, security) leaves a
  test. Trivial edits need none.
- Run the project's own test, lint, format and type-check commands; do not
  re-check by eye what tooling enforces.

## Recorded shortcuts

A deliberate limit gets a comment in the file's syntax:

```text
// shortcut: <the limit>, <when to upgrade>
```

Both parts, always. Review treats a marker that names its limit as a decision.

## Never cut

Validation at trust boundaries, error handling that prevents data loss,
security, accessibility. No secrets, tokens or credential placeholders in
code, comments or `.env` files.

## Git

Do not commit, push, or rewrite history unless the user asks or `ship-it` is
running. Work stays in the working tree for the user to review.

## Close every turn

First line: what happened. Then one line:

```text
Skipped: <...or none>. Not checked: <...or none>. Risk: <...or none>.
```

Last line: the next step.
