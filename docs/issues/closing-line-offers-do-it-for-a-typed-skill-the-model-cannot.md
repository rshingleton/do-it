---
title: "Closing line offers \"do it\" for a typed skill the model cannot start"
type: bug
status: open
source: session
---

## Context

Seen after PR #6 merged. The close-every-turn rule in `skills/it-core/SKILL.md`
says a stop that waits on the user asks them to say "do it", and "do it"
counts as yes. The turn's last line named `/do-it <issue>` as the next step.
The user replied "do it"; the Skill tool refused `do-it` because it has
`disable-model-invocation: true` (typed skills start only from a slash
command the user types). The user asked "so it breaks me just saying do it?"

## Problem

The "say do it" convention works when the next step is something the model
can do itself (commit, push, edit). It fails when the next step is a typed
skill (`do-it`, `ship-it`, `scope-it` and the other user-invoked skills): the
model cannot start them, so "do it" has no effect and the user hits an error
instead of a clear instruction.

## Acceptance

- `skills/it-core/SKILL.md` says that when the next step is a typed skill,
  the last line gives the exact slash command to type (`/do-it <ref>`) and
  does not ask for "do it".
- Skills that end by pointing at a typed skill (log-it's close line, ship-it,
  prove-it, build-it hand-offs) use that form; `npm run check` fails a closing
  line that offers "do it" for a user-invoked skill, or the gap is recorded as
  a shortcut.
- The SessionStart context carries the updated rule.

## Notes

- Related rule in `scripts/check.mjs`: user-invoked skills may not be called
  through the Skill tool.
- log-it's close line already reads "`/do-it <ref>` when you want it built";
  check the others for the same.
