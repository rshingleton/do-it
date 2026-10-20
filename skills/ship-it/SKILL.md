---
name: ship-it
description: Close a do-it work item after its audit passes: confirm assumptions, finalize ADRs, area contexts and changelog, update the tracker, and prepare one commit, which is made only when the user says so.
disable-model-invocation: true
argument-hint: "<work id> | --lane xs [--ref <tracker ref>] [--todo <id>]"
model: sonnet
---

# ship-it

The only step that touches git history, and only on the user's word. Nothing
is written before the user answers the one question (§2).

## 1. Gate

`work.mjs` below is the work-item script in [STATE.md](../do-it/STATE.md);
a refused command (exit 1) is `blocked`.

- **Lane XS:** no state block. Run the project's checks; show the diff
  summary. `--ref` and `--todo` name the issue and to-do item it came from.
  Nothing uncommitted: the user committed it; go to §3 step 4's closes.
- **Otherwise** `work.mjs show <id>` and require `status: shipping` and
  `audit.verdict: PASS`. First run: `work.mjs fingerprint <id>` must equal
  `audit.fingerprint`, else the code moved after the audit:
  `work.mjs event <id> reaudit`, stop, **Next:** `/prove-it <id>`.
- **Resumed after review** (`ship.prepared` set), no §2 question:
  - nothing uncommitted outside the plan: the user committed; §3 step 4's closes;
  - fingerprint equals `ship.fingerprint`: ask one line, "Commit now with
    this message?" (show it), then §3 step 4;
  - it differs: the review edited files. Show `work.mjs review-diff <id>`
    (`files: null`: no snapshot, show `git status --short`) and the commit
    message, and ask one line: commit as reviewed (default), or re-audit first
    (default when a changed file is in a risk area,
    [LANES.md](../do-it/LANES.md)). As reviewed: `event ship-prepared`
    again, then §3 step 4. Re-audit: `event reaudit`; **Next:** `/prove-it <id>`.

## 2. The one question

One turn; write nothing yet. **Show** (information, no answer needed):

- `git status --short`: everything that will be in the change.
- The docs this will write, per [DOCS.md](DOCS.md): ADRs to accept, the
  area's `CONTEXT.md` and map row, the changelog entry (lane XS: changelog only, and only
  when the repo keeps one).
- Tracker, to-do and roadmap updates: one `close` per ref (state block refs,
  the slice's `Ref` cell, or `--ref`) with a comment drawn from the
  changelog. **Risk-area work** ([LANES.md](../do-it/LANES.md)): a rollback
  note (revert, a flag, a down migration, data to restore) for the
  changelog and commit body; no safe rollback: say so plainly.
- The commit message: `<key>: <summary>` (key = the tracker ref, else the
  work id, else a short slug), a blank line, one bullet per phase or step;
  on a protected branch (`main`, `master`, `DO_IT_PROTECTED_BRANCHES`), the
  feature branch to create first.

**Ask** at most three things, numbered, each left out when empty; an answer
to the last alone keeps the defaults:

1. `assumptions:`, numbered: reject any? (default: keep all)
2. New `shortcut:` markers with no upgrade trigger: file any? (default: none)
3. **Commit now** or **leave it for review**? Recommend leave it unless the
   user asked to commit; `DO_IT_COMMIT=never` makes it the only option.

## 3. After the answer

1. **A rejected assumption that changes code:** `work.mjs event <id>
   reject-assumption <n> "<instead>"`; stop. **Next:** `/do-it <id>`. One
   that changes nothing: `work.mjs set` the assumptions.
2. **Docs:** write what §2 showed, per [DOCS.md](DOCS.md), updating what an
   earlier run wrote rather than adding it again; park or file the markers. Then `work.mjs event <id>
   ship-prepared` (lane XS: skip).
3. **Leave it for review:** stop; the plan stays (`status: shipping`), the
   tracker stays open. Repeat the commit message and the command that
   finishes: `/ship-it <id>` (lane XS: `/ship-it --lane xs` with its `--ref`
   and `--todo`), which commits, or closes once the user has committed.
4. **Commit now** (or a resumed run after the user committed):
   - the refs to close: `todo`, `roadmap` and `tracker` from
     `work.mjs show <id>`; lane XS: `--todo` and `--ref`;
   - each roadmap slice: set its Status to `shipped <date> <work id>` and
     add a dated line to the roadmap's Changes; each to-do id: call the Skill
     tool with "todo-it" to mark it done with the work id (lane XS: the
     commit). Both ship in the same commit;
   - create the feature branch if §2 named one; stage by path (never
     `git add -A`); commit with the approved message. Already committed by
     the user: leave these edits uncommitted and say so;
   - only after the commit succeeds: `work.mjs close <id>` (lane XS: none),
     then the tracker closes; a tracker failure never undoes the commit.

## 4. Close

"Shipped <id>: committed as abc123 | prepared, left for review", then
Skipped / Not checked / Risk, then **Next:** (the finish command, push when
ready, or nothing). Guardrail candidates or a failed round in the audit: one
line offering `/retro-it <id>` to turn them into checks.

## Rules

- Never commit, push, amend or squash without an explicit yes in this run;
  push or open a PR only when the user asks.
- One commit for code and docs together unless the user asks for two; hooks
  still run on it, and a compliance block stops it.
