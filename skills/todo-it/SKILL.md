---
name: todo-it
description: Keep a lightweight to-do list in the repo for nice-to-haves, ideas and things to circle back to, one line each and no planning; add several at once, list, close, drop, or promote an item into an issue, a build or a roadmap. Use when the user says todo, note this, remember to, park this, circle back, nice to have, add these to the list, or asks what is on the to-do list.
argument-hint: "[add <text> | list [tag] | done <id> | drop <id> | promote <id> | review]"
---

# todo-it

A list, not a tracker. Each item is one line someone can act on later. An
item that needs acceptance criteria, an owner or a tracker ticket is an issue:
promote it to `log-it`.

## Where

The repo's resolved to-do file (project docs in session context; default
`docs/TODO.md`). Format in [FORMAT.md](FORMAT.md). Create it on the first add.
It is a doc like any other: it stays uncommitted until the user commits or
`ship-it` ships with it.

## Add

- One request may hold many items ("todo the suggestions above"): split it
  into one entry per actionable thing, each in a single line of plain words
  someone could pick up cold. Keep the source wording's substance, drop the
  chatter.
- No questions. Pick a tag from the text: `nice-to-have`, `circle-back`,
  `idea`, `question`, `debt`. Default `nice-to-have`.
- Record where it came from: a file and line, a work id, an issue ref, or
  "session <date>". Context that does not fit the line goes in an indented
  note under it.
- Skip an item that is already on the list (same intent); say which id it
  matched.

Reply with the new ids and their lines, nothing else.

## List and review

- `list [tag]`: open items, oldest first, with ids and age.
- `review`: walk the open items oldest first and suggest, for each, one of:
  keep, drop (no longer relevant), done (already true in the code; cite
  where), or promote. Flag items older than 60 days as stale first. A file
  still holding Done or Dropped sections: offer to remove them first. Apply
  only what the user picks.

## Close

The list holds open items only. Closing removes the line and its notes; the
record lives where the work does, and git history keeps the line.

- `done <id> [how]`: remove it. Shipped through ship-it: its changelog entry
  and commit already carry it. Done another way with a change worth noting
  and the repo has a resolved changelog: add one entry in its style unless
  one covers it. "Already true" needs no record.
- `drop <id> [why]`: remove it.

Reply with each closed id, its line and the how or why, so the commit
message can say it.

## Promote

| The item is | Promote to | Then |
|-------------|------------|------|
| A bug or a change worth planning | Call the Skill tool with "log-it", passing the line and note | Remove it; reply `promoted -> <ref>` |
| Small and ready to build now | Read [do-it](../do-it/SKILL.md) and follow it with the line as the request and `todo: <id>` | Append `-> <work id>` to the open item |
| Extra-large or still foggy | Read [roadmap-it](../roadmap-it/SKILL.md) and follow it to chart a new roadmap | Remove it; reply `promoted -> <roadmap file>` |
| Part of an existing roadmap | Add it to that roadmap's Fog (a new slice only if the user names the milestone) | Remove it; reply `promoted -> <roadmap file>` |

An item promoted to an issue or a roadmap leaves the list; the new artifact
carries it. An item promoted to a build stays open, marked `-> <work id>`,
and the work item records `todo: <id>`; ship-it closes it when the work
ships, so a rejected plan leaves nothing lost.

## From other skills

A calling skill passes the item and its source; add it with no confirmation
round and return the id.
