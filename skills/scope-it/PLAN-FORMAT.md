# Plan format

The state block is defined in [STATE.md](../do-it/STATE.md) and written by
`work.mjs new` and `work.mjs set`; never type it by hand. Describe
behaviour and interfaces, not procedures: name the types, functions, commands
or config shapes that change and what they must do. File paths are starting
points, not the contract.

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

## Steps
1. Add `Limiter` with a sliding window → verify: unit tests at `Limiter.check`
2. Call it from the login handler → verify: request test gets 429 on the 6th try

## Done when
- Acceptance from the source issue, restated as checks.

## Non-goals
- Per-account limits (filed as docs/issues/per-account-limits.md)
```

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

## Decisions
- One line per decision from the grill, with any ADR link.

## Non-goals
```

Each `phase-N.md`:

```markdown
# Phase N: <title>

Plan: <id>. Blocked by: <phases or none>.

## Goal
## Scope
What changes, and what is explicitly left alone.
## Seams
One line per seam: interface, what a test there catches, what it misses.
## Steps
1. <step> → verify: <check>
## Done when
## Starting points
Files worth reading first.
```

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
