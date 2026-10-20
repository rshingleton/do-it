# Skill mechanics

What changes when the document is a skill. The writing guidance in
[SKILL.md](SKILL.md) still applies; this repo's own rules are in its
`AGENTS.md` and are enforced by `npm run check`.

## Typed or automatic

| | Automatic (model-invoked) | Typed (user-invoked) |
|---|---|---|
| Frontmatter | no `disable-model-invocation` | `disable-model-invocation: true` |
| Description | what it does, then "Use when ..." with the distinct triggers | one line for a human reading a command list |
| Who can start it | the agent on its own, another skill, or the user | only the user, by typing it |
| Context cost | its description, every turn | none |

Never summarize the process in a description: an agent that reads a summary
may follow it instead of the skill. Choose automatic only when the agent or
another skill must reach the skill without the user. A step the user drives (the do-it flow steps, deepen-it,
pass-it) is typed.

A skill calls an automatic skill as Call the Skill tool with "<name>", with
the name in quotes so `npm run check` can verify it. A typed skill cannot be
loaded that way (the host refuses), so another skill reaches it by reading
its file: "read [scope-it](../scope-it/SKILL.md) and follow it".

## Files

- One directory per skill directly under `skills/`, named after the skill;
  the frontmatter `name` matches the directory.
- `SKILL.md` stays within 100 lines (150 is a hard error). Detail goes in
  sibling files one level deep, linked from the step that needs them.
- Links between skills stay inside `skills/` (`../do-it/STATE.md`), so they
  work after a symlink install. Scripts a skill runs live in its own
  `scripts/` directory and are referenced from the skill's directory.
- Shared conventions have one home (`do-it/STATE.md`, `do-it/LANES.md`);
  other skills link there instead of restating them.

## Names

Skill names are short `-it` verbs (`scope-it`, `track-it`) so they never
collide with another skill set installed beside this one. Before adding a
name, check it against the other skill repos in use and against the host's
built-in commands.

## When to split off a skill

Split when a part has its own trigger the agent should react to on its own,
or when another skill needs to reach it. Each new automatic skill adds a
description to every turn, so the independent reach has to be worth that.
When typed skills multiply, one typed entry that names the others (as do-it
does for the flow) keeps the list a person must remember short.

## Before handing off

```bash
npm test && npm run check
```
