---
name: ship-it
description: Close a do-it work item after its audit passes: confirm assumptions, finalize ADRs, glossary and changelog, update the tracker, and prepare one commit, which is made only when the user says so.
disable-model-invocation: true
argument-hint: "<work id> | --lane xs"
model: sonnet
---

# ship-it

The only step that touches git history, and only on the user's word.

## 1. Gate

- Lane XS: no state block. Run the project's checks; show the diff summary.
- Otherwise read the state block ([STATE.md](../do-it/STATE.md)). Require
  `audit.verdict: PASS`, then recompute the fingerprint
  (`bash ../do-it/scripts/fingerprint.sh <base_ref>`). A mismatch means code
  moved after the audit: stop, `blocked`, **Next:** `/audit-it <id>`.

## 2. Assumptions

Show `assumptions:` as a numbered list and ask, in the same turn as the
commit question (§6), which to keep. Rejected ones go to `issue-it` with
`source: ship-it`. None recorded: skip.

## 3. Durable docs

Follow [DOCS.md](DOCS.md): accept the plan's ADRs, merge `GLOSSARY.md`, write
one changelog entry, list new `shortcut:` markers and offer the ones with no
upgrade trigger to `issue-it`. Lane XS: changelog entry only, and only when
the repo keeps one.

## 4. Tracker

When the state block names tracker refs, call the Skill tool with "tracker"
and prepare one `close` per ref with a resolution comment drawn from the
changelog entry. Show them all as one list in the §6 turn; run them after the
user answers. A tracker failure is reported and never blocks the commit.

## 5. Retire the plan

After the user answers §6 and before any commit, delete `docs/planning/<id>`
(file or directory). The ADRs and changelog hold what is worth keeping; read
the tracker refs and title first, since nothing after this needs the plan. A
rejected assumption that changes the code stops here instead: back to
`build-it`, plan kept.

## 6. The one question

Present, in one turn:

1. `git status --short`: everything that will be in the change.
2. The proposed commit message: `<key>: <summary>` (key = tracker ref, else
   the work id), a blank line, one bullet per phase or step.
3. Assumptions to confirm (§2) and tracker updates to run (§4).
4. The choice: **commit now** or **leave it for review** (the default when
   `DO_IT_COMMIT=never`, and the recommendation unless the user asked to
   commit).

After the answer: file rejected assumptions (§2), run the tracker updates
(§4), retire the plan (§5).

On **commit now**: stage by path (never `git add -A`), commit with the
approved message. On a protected branch (`main`, `master`, or
`DO_IT_PROTECTED_BRANCHES`), offer a feature branch first. Push or open a PR
only when the user asks.

On **leave it**: change nothing in git; repeat the message so the user can
use it.

## 7. Close

> Shipped <id>: <committed as abc123 | left uncommitted for review>.
> Skipped / Not checked / Risk.
> **Next:** <review the diff | push when ready | nothing>.

## Rules

- Never commit, push, amend or squash without an explicit yes in this run.
- One commit for code and docs together unless the user asks for two.
- Hooks still run on `git commit`; a compliance block stops the commit.
