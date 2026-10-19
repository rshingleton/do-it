---
name: ship-it
description: Close a do-it work item after its audit passes: confirm assumptions, finalize ADRs, glossary and changelog, update the tracker, and prepare one commit, which is made only when the user says so.
disable-model-invocation: true
argument-hint: "<work id> | --lane xs [--ref <tracker ref>]"
model: sonnet
---

# ship-it

The only step that touches git history, and only on the user's word. Nothing
is written before the user answers the one question (§2).

## 1. Gate

The fingerprint script is `scripts/fingerprint.sh` in the do-it skill
directory (`../do-it/` from this file). It runs from the repo root on its
own; a non-zero exit is `blocked`.

- **Lane XS:** no state block. Run the project's checks; show the diff
  summary. `--ref` names the tracker issue the work came from, if any.
- **Otherwise** read the state block ([STATE.md](../do-it/STATE.md)) and
  require `audit.verdict: PASS`. Recompute the fingerprint and compare it with
  `ship.fingerprint` when ship already prepared the docs (a resumed run),
  else with `audit.fingerprint`. A mismatch means the code moved after the
  audit: stop, `blocked`, **Next:** `/prove-it <id>`.
- **Resumed with `ship.prepared` and no uncommitted change outside the plan**
  (the user committed it themselves): skip to §3 step 4 for the tracker and
  the plan.

## 2. The one question

Present, in one turn, and write nothing yet:

1. `git status --short`: everything that will be in the change.
2. The docs this will write, per [DOCS.md](DOCS.md): ADRs to accept,
   glossary terms, the changelog entry text (lane XS: changelog only, and only
   when the repo keeps one).
3. `assumptions:` as a numbered list: keep or reject each. None: skip.
4. New `shortcut:` markers with no upgrade trigger, numbered: file any?
5. Tracker updates: one `close` per ref (state block refs, or `--ref`) with a
   resolution comment drawn from the changelog entry.
   **Risk-area work** (the list in [LANES.md](../do-it/LANES.md)): a rollback
   note, how to undo this in production (revert the commit, a flag to turn
   off, a down migration, data to restore). It goes in the changelog entry and
   the commit body; with no safe rollback, say so plainly.
6. The commit message: `<key>: <summary>` (key = the tracker ref, else the
   work id, else a short slug of the summary), a blank line, one bullet per
   phase or step. On a protected branch (`main`, `master`, or
   `DO_IT_PROTECTED_BRANCHES`), the feature branch name to create first.
7. The choice: **commit now** or **leave it for review**. Recommend leave it
   unless the user asked to commit; `DO_IT_COMMIT=never` makes it the only
   option.

A resumed run with `ship.prepared` shows only items 1, 6 and 7.

## 3. After the answer

1. **A rejected assumption that changes code:** file it with `log-it`
   (`source: ship-it`), set `status: building`, keep the plan, stop. **Next:**
   `/do-it <id>`. Rejections that change nothing are just filed.
2. **Docs:** write what item 2 showed, per [DOCS.md](DOCS.md); file the
   shortcut markers the user picked with `log-it`. Then record
   `ship: { prepared: <date>, fingerprint: <fingerprint.sh output> }`.
3. **Leave it for review:** stop here. The plan stays (`status: shipping`),
   the tracker stays open. Repeat the commit message. **Next:** review the
   diff, then `/ship-it <id>` to commit, or commit yourself and run
   `/ship-it <id>` to close the tracker and retire the plan.
4. **Commit now** (or a resumed run after the user committed):
   - read the tracker refs and title, then delete `docs/planning/<id>` (file
     or directory); the ADRs and changelog hold what is worth keeping;
   - create the feature branch if item 6 named one; stage by path (never
     `git add -A`); commit with the approved message. Already committed by
     the user: leave the plan removal uncommitted and say so;
   - run the tracker closes. A tracker failure is reported and never undoes
     the commit.

Push or open a PR only when the user asks.

## 4. Close

> Shipped <id>: <committed as abc123 | prepared, left uncommitted for review>.
> Skipped / Not checked / Risk.
> **Next:** <review the diff, then /ship-it <id> | push when ready | nothing>.

When the audit listed Guardrail candidates or failed a round, add one line
offering `/retro-it <id>` to turn those into checks.

## Rules

- Never commit, push, amend or squash without an explicit yes in this run.
- One commit for code and docs together unless the user asks for two.
- Hooks still run on `git commit`; a compliance block stops the commit.
