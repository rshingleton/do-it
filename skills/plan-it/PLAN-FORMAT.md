# Plan format

The state block is defined in [STATE.md](../do-it/STATE.md). Describe
behaviour and interfaces, not procedures: name the types, functions, commands
or config shapes that change and what they must do. File paths are starting
points, not the contract.

## Lane S: `docs/planning/<id>.md`

```markdown
---
id: login-rate-limit
title: Rate-limit the login endpoint
lane: s
status: planned
tracker: { kind: local, ref: docs/issues/login-rate-limit.md }
sources: [docs/issues/login-rate-limit.md]
base_ref: null
approvals: { plan: 2026-10-19 }
assumptions:
  - "5 attempts per minute per IP (reversible: config)"
audit: { verdict: null, round: 0, fingerprint: null }
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

`README.md` holds the state block (with `phases:`), then:

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

No Jira map file, no `sources/` move, no execution-notes file. Refs and
progress live in the state block.
