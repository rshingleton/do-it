---
name: skill-it
description: Write or revise a skill, an AGENTS.md or CLAUDE.md, or any document an agent follows, so it runs the same way every time and stays small. Use when creating or editing a skill, changing agent instruction files, splitting a skill that grew too long, or reviewing why an agent skipped or misread instructions.
---

# skill-it

An agent document is a program written in prose: the aim is that every run
takes the same path, not that every run says the same words. For skill files
specifically (frontmatter, invocation, naming, the checks this repo runs),
read [SKILL-MECHANICS.md](SKILL-MECHANICS.md) as well.

## Pointers decide when material is read

Anything an agent reaches from elsewhere is reached through a **pointer**: a
skill's description, a line in `AGENTS.md`, a link inside a skill. The
wording of the pointer, not the quality of what it points at, decides whether
the agent goes there. When material that matters keeps being skipped, sharpen
its pointer before inlining the material.

A good pointer says what the material is and lists the distinct situations
that should send the agent to it, one phrase per situation. Synonyms for one
situation are one situation; keep one. Pointers that are always loaded
(descriptions, `AGENTS.md`) cost tokens on every turn, so they are pruned
hardest.

## Two budgets

- **Context:** what sits in the agent's window every turn whether it is used
  or not. Descriptions and always-loaded files spend it.
- **Attention of the person:** what the human must remember exists. Typed
  commands spend it. Spend it where a human should choose, save it elsewhere.

## Layout of a document

Two kinds of content: **steps** (what to do, in order) and **reference**
(rules and facts looked up when needed). Place each by how soon it is needed:

1. Steps the agent always takes: in the main file, in order.
2. Reference most runs need: in the main file, grouped by topic, with each
   topic's definition, rules and exceptions together under one heading.
3. Reference only some paths need: a sibling file, linked from the step that
   needs it, with the link saying when to read it.

Inline what every path needs; move behind a link what only some paths reach.
A file can be too long even when every line is live: past the budget, split
by path or by stage rather than trimming useful lines.

## Every step ends on a check

Each step finishes on a condition the agent can test: "every caller listed
with its path", not "understand the callers". A vague end invites stopping
early, especially when the next steps are visible. Sharpen the condition
first; split the later steps into another file or subagent only if a sharp
condition still gets rushed. The demand in the wording sets the effort:
"every rule applied to every changed file" asks for more than "check the
rules".

## Words that carry weight

Prefer a short word the model already knows well (tight, red, frontier,
seam, fog) over a sentence describing the same idea, and reuse that exact
word everywhere the idea appears. It saves tokens and gives the agent one
handle to think with. Use a term the project already uses in its code and
prompts when one exists; coin a new one only with a definition.

Say what to do, not what to avoid: "write one-line comments" works better
than a ban, because naming the unwanted behaviour makes it more likely. Keep
a prohibition only as a hard guardrail, paired with the positive target.

## Keep it lean

- **One home per rule.** Repeating a rule in two files costs tokens, drifts,
  and makes it look more important than it is. Link to the home instead.
- **Do not copy the environment.** `package.json` scripts, config files and
  `--help` output are already the truth; restating them goes stale. Write down
  what the repo cannot tell the agent: the reason, the convention, the trap.
- **Delete no-ops.** A sentence the model would follow anyway changes
  nothing. Test a doubtful one by running the document without it. Remove
  whole sentences rather than trimming words.
- **Prune for staleness.** Every edit is a chance to remove a line that no
  longer bears on the task.
