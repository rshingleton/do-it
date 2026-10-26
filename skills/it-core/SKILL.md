---
name: it-core
description: The always-on coding posture, injected by the hooks into every session and subagent; typed only to read it.
disable-model-invocation: true
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
    and ask. Look the answer up first in ADRs, the area's context, the issue
    and the code; ask only what none of them answer.

## Reuse before writing

Take the first rung that fully works:

1. Does it need to exist? Skip what nobody asked for; name it under Skipped.
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
- Out-of-scope problems you notice go to `log-it`, not into this diff.

## Verifiable

- Turn the task into a check before building: a bug gets a failing test first;
  a feature gets the observable behaviour that proves it.
- New non-trivial logic (a branch, a loop, a parser, money, security) leaves a
  test. Trivial edits need none.
- Run the project's own test, lint, format and type-check commands; do not
  re-check by eye what they enforce.
- A UI change is done once seen rendering where it lives, never from the code
  alone; if no browser, script or screenshot can show it, say so under Not checked.

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

## Project docs

Use this repo's resolved doc paths, listed under "project docs" in session
context (`tracker.mjs config` in the track-it skill when hooks are off), not the
skills' defaults. Never create a second context file or changelog.

**The area's context:** for work in a component, read the context map, then
the area's `CONTEXT.md` and `docs/adr/` (no map: the root `CONTEXT.md`), per
name-it's [CONTEXT-FORMAT.md](../name-it/CONTEXT-FORMAT.md). GLOSSARY files
are a last fallback; reading never creates a context file.

## Git

Do not commit, push, or rewrite history unless the user asks or `ship-it` is
running; work stays in the working tree. One exception: a `build-it`
parallel implementer commits on its own `do-it/*` scratch branch, in its own
worktree (`build-it/PARALLEL.md`); those commits never reach the user's branch.

A commit message starts `<id>: `: the Jira key, `gh-<n>` (GitHub `#n`), or the
local tracking id (work id, local issue slug, to-do id), never a path or made-up slug.

## Close every turn

First line: what happened. Then one line:

```text
Skipped: <...or none>. Not checked: <...or none>. Risk: <...or none>.
```

Last line: the next step. A stop that waits on the user asks them to say "do
it" to go ahead; "do it" counts as yes. When the next step is a typed skill
(`do-it`, `ship-it` and the other user-invoked ones), the model cannot start
it: give the exact slash command to type and do not ask for "do it".
