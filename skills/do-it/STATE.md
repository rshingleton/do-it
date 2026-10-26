# Work-item state

Every work item from lane S up keeps its state in one YAML frontmatter block.
Steps hand off through this block and the files it names, never through the
conversation, so any step resumes in a fresh session.

## The script

`scripts/work.mjs` in this skill's directory is the only writer of the block.
Steps read the block freely but change it only through the script, which
checks every move and prints the item as JSON (`error` and exit 1 on a
refused move, naming the moves allowed from the current status). Below,
`work.mjs` means `node <this skill's directory>/scripts/work.mjs`; it runs
from anywhere in the repo.

| Command | Does |
|---------|------|
| `work.mjs new <id> --lane s\|m --title "<title>"` | Creates the plan file with the full empty block, `status: draft` |
| `work.mjs set <id> <key> <json>` | Sets a field with no event: `title`, `lane`, `tracker`, `sources`, `roadmap`, `todo`, `blocked_by`, `phases`, `assumptions`, `defects`. An empty or null value is refused (`[]` clears a list). `phases` takes `n`, `title`, `blocked_by`; a phase's `status` and `verified` are kept across a re-plan and only events change them |
| `work.mjs event <id> <event> [args]` | Moves the item (table below) |
| `work.mjs show <id> [--brief]` / `work.mjs list` | One item (`--brief`: only `id`, `lane`, `status`, `allowed`, `blocker` and `needs_user`, enough to resume), with `allowed` (the next moves: the events `event` takes, plus `close` from shipping) and `needs_user`; or every open item |
| `work.mjs fingerprint <id>` | Hash of the change since `base_ref`, planning files excluded |
| `work.mjs review-diff <id>` | Files changed since ship-it prepared the commit (the user's review edits), with a diffstat |
| `work.mjs verify-phase <id> [n] [--in <dir>] -- "<checks>"` | Runs the checks (in `<dir>` with `--in`, the plan staying this checkout's); records the phase (lane S: the item) as verified only on exit 0. The only way a phase is recorded. Quote a chain (`"npm test && npm run lint"`) so the script runs all of it |
| `work.mjs roadmap <file>` | Every slice's derived state and the next one to start |
| `work.mjs close <id>` | Deletes the plan and prints the to-do ids, roadmap slice and tracker refs to close |

`new`, `set`, `event`, `verify-phase` and `list` take `--brief`: the same short
shape as `show --brief` (`list`: `id`, `lane`, `status` per item). A step that
only needs the result of a write passes it and re-reads with `show` when it
needs more. `fingerprint`, `review-diff`, `roadmap` and `close` already print
only what the caller reads, so they have no brief form. Free text in the block
(`blocker`, `assumptions`, `fix`, `defects`, `verified`) follows
[VOICE.md](../it-core/VOICE.md): terse, numbers and paths verbatim, negations kept.

## Events

| Event | From | To | Records |
|-------|------|----|---------|
| `approve` | draft | planned | `approvals.plan` |
| `start` | planned, building | building | `base_ref` = HEAD, only when not set yet |
| `phase-done` (fired by `verify-phase` only) | building | building | phase `n` done with `verified` (lane S: top-level `verified`); its `blocked_by` phases must be done |
| `block <why> [--phase n]` | planned, building, auditing, shipping | blocked | `blocker`; with `--phase`, only that phase is blocked and the item keeps building |
| `unblock [--phase n]` | blocked (phase: building) | building | clears `blocker` |
| `build-done` | building | auditing | needs every phase done (lane S: `verified`); in fix mode it needs a `verify-phase` that passed since the fix began (`fix_verified`, dropped with the fix) and clears `fix` |
| `audit-pass [fingerprint]` | auditing | shipping | `audit`: PASS, `round` 0, `must` [], `fingerprint` (computed when omitted), `at` |
| `audit-fail <must...>` | auditing | building; blocked at round 3 or later | `audit`: FAIL, `round` + 1, `must`, `at`; from round 3 a `blocker` asking the user |
| `ship-prepared [fingerprint]` | shipping | shipping | `ship`: `prepared`, `fingerprint` (computed when omitted), `tree` (a snapshot of the working tree, written through a throwaway index) |
| `reaudit` | shipping | auditing | clears `ship`: the user wants their review edits audited |
| `reject-assumption <n> <instead>` | auditing, shipping | building | moves assumption `n` to `fix` with what replaces it, clears `ship` |
| `replan` | any but draft | draft | clears `approvals.plan`, `audit`, `fix` and `ship`; scope-it re-plans, the work so far and done phases stay |

**Fix mode** is `audit.verdict: FAIL` or a non-empty `fix` list: build-it
fixes those and nothing else. **Needs the user** (`needs_user: true`) when
`status: blocked`, including after the third (or any later) failed audit in
a row; the user's answer is recorded by `unblock` (or `replan`), so each
failed round asks once.

## Where

| Lane | File |
|------|------|
| S | `docs/planning/<id>.md` (the plan and the state in one file) |
| M | `docs/planning/<id>/README.md` (phases in `phase-N.md` beside it) |

The planning directory is `DO_IT_PLANNING_DIR` when configured. Lane L has no
state block: its roadmap (roadmap-it) is the durable map, and each slice is
its own S or M item that names the slice in `roadmap:`.

`<id>` is the tracker ref when there is one (`ABC-123`, `gh-42`), else a local
issue's slug (its file name without `.md`), else a short kebab-case slug. It
is also the commit id (it-core Git).

## Block

As `work.mjs` writes it (lane M; lane S has top-level `verified` instead of
`phases`):

```yaml
---
id: ABC-123
title: Rate-limit the login endpoint
lane: m
status: building
tracker:
  kind: jira
  ref: ABC-123
  phases:
    1: ABC-124
sources: [docs/issues/login-rate-limit.md]
roadmap: docs/roadmap/auth-hardening.md#R3
todo: [T5]
base_ref: 1a2b3c4
approvals:
  plan: 2026-10-19
phases:
  - n: 1
    title: Limiter module
    blocked_by: []
    status: done
    verified: "npm test, npm run lint: pass"
  - n: 2
    title: Wire into login
    blocked_by: [1]
    status: ready
    verified: null
assumptions:
  - "Limit is 5 attempts per minute per IP (reversible: config)"
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
```

While in fix mode the block also carries `fix_verified` (the passing
`verify-phase` text since the fix began); `build-done` drops it.

`roadmap` is set when the item is a roadmap slice, `todo` when it was promoted
from the to-do list, `tracker` when it was published or the slice has a
`Ref`. An optional `blocked_by: [<work id>]` names other items this one must
wait for. Raising lane S to M with `set lane m` moves the file into a
directory; a lane is never lowered. Phase statuses are
`ready | done | blocked`. The script reads block style, one-line
scalar lists and `{}`, and a scalar `todo:`. It no longer reads the older flow
maps (`audit: { verdict: null, ... }`) or brackets spanning lines: it stops
with an error, and the plan is rewritten in block style by hand.

## Rules

- **Owner.** The running step is the only writer, through the script.
  `scope-it` creates the block; `build-it`, `prove-it` and `ship-it` fire
  their own events.
- **Approvals are recorded or they did not happen.** Never infer approval from
  an earlier conversation.
- **Verification is a claim about code.** A phase's `verified` holds while its
  files are unchanged; `prove-it` re-runs everything regardless.
- **Fingerprint.** The hash of the change since `base_ref`, tracked edits and
  untracked files, excluding the planning directory. `audit-pass` records it;
  ship-it compares `work.mjs fingerprint <id>` with `ship.fingerprint` once
  it has written the docs, else with `audit.fingerprint`. A mismatch means
  the code moved since the audit.
- **No `done` status.** `work.mjs close` deletes the plan when ship-it
  commits; the ADRs, changelog and commit hold what is worth keeping.
- **No commits until ship.** Steps leave their work in the working tree.
  `base_ref` plus the working tree is the whole change.
