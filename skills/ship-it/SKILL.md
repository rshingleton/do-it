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

- **Lane XS:** no state block, no id to close; [RESUME.md](RESUME.md).
- **Otherwise** `work.mjs show <id>` and require `status: shipping` and
  `audit.verdict: PASS`. First run: `work.mjs fingerprint <id>` must equal
  `audit.fingerprint`, else the code moved after the audit:
  `work.mjs event <id> reaudit`, stop, **Next:** `/prove-it <id>`.
- **Resumed after review** (`ship.prepared` set): [RESUME.md](RESUME.md).

## 2. The one question

One turn; write nothing yet. **Show** (information, no answer needed):

- `git status --short`: everything that will be in the change.
- The docs this will write, per [DOCS.md](DOCS.md): ADRs to accept, the
  area's `CONTEXT.md` and map row, the changelog entry (lane XS: changelog
  only, when the repo keeps one).
- Tracker, to-do and roadmap updates: one `close` per ref (state block refs,
  the slice's `Ref` cell, or `--ref`) with a comment drawn from the
  changelog. Risk-area work also gets a rollback note, per [DOCS.md](DOCS.md).
- Numbered: the audit's Should and Nice findings (no changelog), surfaced `defects:`,
  and a roadmap Verify clause they leave unmet ([DOCS.md](DOCS.md)).
- Guardrail candidates or a failed audit round: one line offering `/retro-it <id>`.
  `work.mjs close` deletes the candidates, so it runs before "commit now".
- The commit message: `<id>: <summary>` (the commit id, it-core Git), a
  blank line, one bullet per phase or step; on a protected branch (`main`,
  `master`, `DO_IT_PROTECTED_BRANCHES`), the feature branch to create first.

**Ask** at most three things, numbered, each left out when empty; an answer
to the last alone keeps the defaults:

1. `assumptions:`, numbered: reject any? (default: keep all). Lane XS, no id:
   always asked, no default: the ref to use, or "file one" with `log-it`?
2. To log: new `shortcut:` markers with no upgrade trigger, the audit findings and
   surfaced defects above (default: findings and defects, no markers)
3. **Commit now** (say "do it") or **leave it for review**? Recommend leave it
   unless the user asked to commit; `DO_IT_COMMIT=never` makes it the only option.

## 3. After the answer

1. **A rejected assumption that changes code:** `work.mjs event <id>
   reject-assumption <n> "<instead>"`; stop. **Next:** `/do-it <id>`. One
   that changes nothing: `work.mjs set` the assumptions.
2. **Docs and closes, before any commit:** write what §2 showed per
   [DOCS.md](DOCS.md), updating an earlier run's; park or file the markers; log
   the chosen findings (no changelog). Then close everything that lives in the
   repo, so one commit holds it all (a user commit after review included):
   - the refs to close: `todo`, `roadmap` and `tracker` from
     `work.mjs show <id>`; lane XS: `--todo` and `--ref`;
   - each roadmap slice: Status `shipped <date> <work id>` (unmet Verify: DOCS.md) and a
     dated line in its Changes; each to-do id: call the Skill tool with "log-it" to mark
     it done with the work id (lane XS: the commit);
   - a local-tracker ref: `tracker.mjs close <ref>`, which deletes the issue
     file; a ref whose file is already gone was closed by an earlier run;
   - `event <id> ship-prepared` (not lane XS; its no-id case is in
     [RESUME.md](RESUME.md)).
3. **Leave it for review:** stop; the plan stays (`status: shipping`), the
   remote tracker stays open. Repeat the commit message and the command that
   finishes, `/ship-it <id>` (lane XS: `--lane xs` with its `--ref` and
   `--todo`), which commits, or finishes once the user has committed.
4. **Commit now** (or a resumed run after the user committed). Step 2 has
   already run, so the working tree holds the whole change:
   - create the feature branch if §2 named one; stage by path (never
     `git add -A`), including the issue, to-do and roadmap edits from step 2;
     commit with the approved message. Already committed by the user: nothing
     is left to stage;
   - only after the commit succeeds: `work.mjs close <id>` (lane XS: none),
     then the remote tracker (GitHub, Jira) closes with a comment drawn from
     the changelog; it cannot be part of the commit, and a tracker failure
     never undoes the commit.

## 4. Close

"Shipped <id>: committed as abc123 | prepared, left for review", then
Skipped / Not checked / Risk, then **Next:** (the finish command, push when
ready, or nothing). On a roadmap slice, the slash command for the next one, never a script.

## Rules

- Never commit, push, amend or squash without an explicit "do it" in this
  run; push or open a PR only when the user asks.
- One commit for code and docs together unless the user asks for two; hooks
  still run on it, and a compliance block stops it.
