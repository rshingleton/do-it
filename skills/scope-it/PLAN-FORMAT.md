# Plan format

The state block is defined in [STATE.md](../do-it/STATE.md) and written by
`work.mjs new` and `work.mjs set`; never type it by hand. Describe
behaviour and interfaces, not procedures: name the types, functions, commands
or config shapes that change and what they must do. A path named in a step is a
starting point, not the contract; the `## Files` list is.

## Files and interfaces

Two slices run as two tracks only when they do not overlap, so the plan states
what it changes: `## Files` and `## Interfaces`, both below. Scope-it writes
them for every slice, whether or not it runs in a track; a plan without them
pairs with nothing. The `## Files` list is also what the pre-flight compares,
so it holds every file the slice edits, tests included, and no directory: names
are compared and none is expanded.

Lane S puts both sections in the plan body, after `## Seams`. Lane M puts them
in its README: the README's `## Files` is the union of its phases' files, while
`## Interfaces` stays at the README only, because a track pairs the whole slice
by it.

`## Files`: repo-relative paths, one per line, `/` on every platform.

A release version is not a slice's file: no manifest `version`, no tag, no
changelog heading. The commit that lands the branch sets it once, so a plan
that names it makes every pair share a file and serialises the run for
nothing. A repo that wants a bump in each change still gives it to the commit
that lands, not to the slices that precede it.

`## Interfaces`: one line per interface, `<signature> -> <what it produces>`.
The left of `->` is what a caller passes, the right the shape the slice
produces. A line without `->` names an interface the slice only consumes, so
the plan does not pin it. Two slices may share an interface when one plan pins
it; an interface two plans name and neither pins cannot be paired.

## Lane S: `docs/planning/<id>.md`

After `work.mjs new login-rate-limit --lane s --title "..."`, `set sources`
and `set assumptions`, the file is the block plus this body:

```markdown
---
id: login-rate-limit
title: Rate-limit the login endpoint
lane: s
status: draft
tracker: null
sources: [docs/issues/login-rate-limit.md]
roadmap: null
todo: []
base_ref: null
approvals:
  plan: null
verified: null
assumptions:
  - "5 attempts per minute per IP (reversible: config)"
fix: []
defects: []
audit:
  verdict: null
  round: 0
  must: []
  fingerprint: null
  at: null
ship:
  prepared: null
  fingerprint: null
blocker: null
---

# Rate-limit the login endpoint

## Goal
One paragraph: the behaviour that will be true when this ships.

## Seams
- `Limiter.check(key)`: catches counting and window expiry; misses wiring.
- `POST /login` returns 429: catches the wiring end to end.

## Files
src/limiter.js
src/routes/login.js
test/limiter.test.mjs

## Interfaces
`Limiter.check(key) -> {allowed, wait}`
`POST /login -> 429 on the 6th try`

## Link
~/.local/share/do-it-bridge/billing-api--web-app.md

## Steps
1. Add `Limiter` with a sliding window → verify: unit tests at `Limiter.check`
2. Call it from the login handler → verify: request test gets 429 on the 6th try

## Done when
- Acceptance from the source issue, restated as checks.

## Non-goals
- Per-account limits (filed as docs/issues/per-account-limits.md)
```

`## Link` is optional, written only when the plan is paired through
[link-it](../link-it/SKILL.md). It holds one path line, the contract path
link-it §3 derives, so it is never an `assumptions:` entry (ship asks the user
about those) or a `sources:` ref. It is legal in a lane M README as well as a
lane S plan, and `replan` keeps it.

## Lane M: `docs/planning/<id>/`

`README.md` holds the state block, with `phases:` set by
`work.mjs set <id> phases '[{"n":1,"title":"Limiter module"},{"n":2,"title":"Login wiring","blocked_by":[1]}]'`,
then:

```markdown
# <title>

## Goal
## Phases
| Phase | Delivers | Blocked by |
|-------|----------|------------|
| [1](phase-1.md) | Limiter module | none |
| [2](phase-2.md) | Login wiring | 1 |

## Files
src/limiter.js
src/routes/login.js
test/limiter.test.mjs

## Interfaces
`Limiter.check(key) -> {allowed, wait}`

## Decisions
- One line per decision from the grill, with any ADR link.

## Non-goals
```

The README's `## Files` is the union of its phases' files, while `## Interfaces`
stays at the README: every phase file states its own `## Files`, and the README
states what a track pairs the whole slice by. A phase's consumed and produced
interfaces go in its `## Seams`, not a per-phase `## Interfaces`. Two phases with
no dependency path between them must not share a file, or one blocks the other:
cut along the file boundary, or add the `blocked_by` edge that makes the pair
serial.

Each `phase-N.md`:

```markdown
# Phase N: <title>

Plan: <id>. Blocked by: <phases or none>.

## Goal
## Scope
What changes, and what is explicitly left alone.
## Files
src/limiter.js
## Seams
One line per seam: interface, what a test there catches, what it misses.
## Steps
1. <step> → verify: <check>
## Done when
## Starting points
Files worth reading first.
```

Each phase's `## Files` lists one repo-relative path per line: every file the
phase changes, tests included.

## Slices that compare or measure

A roadmap Verify that compares or measures (differences listed, parity, the
same suite passes on both, a benchmark, an audit) can surface product defects
the slice does not fix. Its last step, after the last build step:

```markdown
N. File each surfaced defect with `log-it`, `source: <work id>` → verify: every `defects:` entry in the state block ends `(issue: <ref>)`
```

build-it records each defect in `defects:` as it appears, and the step adds `(issue: <ref>)`
to each entry it files; ship-it offers the rest.

No Jira map file, no `sources/` move, no execution-notes file. Refs and
progress live in the state block.
