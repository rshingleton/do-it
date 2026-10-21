# To-dos and the backlog

A to-do is a list line, not a tracker entry. One that needs acceptance
criteria, an owner or a tracker ticket is an issue: promote it.

The file is the repo's resolved to-do file (project docs in session context;
default `docs/TODO.md`), format in [FORMAT.md](FORMAT.md). Create it on the
first add. It stays uncommitted until the user commits or `ship-it` ships
with it.

## Add

- One request may hold many items ("todo the suggestions above"): one entry
  per actionable thing, each a single line of plain words someone could pick
  up cold. Keep the source wording's substance, drop the chatter.
- No questions. Pick a tag from the text: `nice-to-have`, `circle-back`,
  `idea`, `question`, `debt`. Default `nice-to-have`.
- Record where it came from: a file and line, a work id, an issue ref, or
  "session <date>". Context that does not fit the line goes in an indented
  note under it.
- Skip an item already on the list (same intent); say which id it matched.

Reply with the new ids and their lines, nothing else.

## List and review

Read both stores: the to-do file, and open issues through the Skill tool
with "track-it" (`list`). Group by type: bug, feature, defer, then to-dos by
tag. Remote issues are not listed; `track-it` says so in a note, repeat it.

- `list [type or tag]`: open items, oldest first, with ids or refs and age.
- `review`: walk the open items oldest first and suggest, for each, one of:
  keep, drop (no longer relevant), done (already true in the code; cite
  where), or promote. Flag items older than 60 days as stale first. A file
  still holding Done or Dropped sections: offer to remove them first. Apply
  only what the user picks.

## Close

The list holds open items only. Closing removes the line and its notes; the
record lives where the work does, and git history keeps the line. An issue is
closed through `track-it` (`close <ref>`), not here.

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
| A bug or a change worth planning | The issue path (SKILL.md §3) with the line and note as the request, `kind: issue` | Remove it; reply `promoted -> <ref>` |
| Small and ready to build now | Read [do-it](../do-it/SKILL.md) and follow it with the line as the request and `todo: <id>` | Append `-> <work id>` to the open item |
| Extra-large or still foggy | Read [roadmap-it](../roadmap-it/SKILL.md) and follow it to chart a new roadmap | Remove it; reply `promoted -> <roadmap file>` |
| Part of an existing roadmap | Add it to that roadmap's Fog (a new slice only if the user names the milestone) | Remove it; reply `promoted -> <roadmap file>` |

An item promoted to an issue or a roadmap leaves the list; the new artifact
carries it. An item promoted to a build stays open, marked `-> <work id>`,
and the work item records `todo: <id>`; ship-it closes it when the work
ships, so a rejected plan leaves nothing lost.
