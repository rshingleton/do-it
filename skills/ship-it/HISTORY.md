# The history entry

Detail for [SKILL.md](SKILL.md) §3 step 2. The plan is removed when the item
ships, so what a later reader needs is written first, before `work.mjs close`.

## Where each thing goes

Take the first that fits:

1. **An ADR**, when a decision meets this repo's bar (hard to reverse,
   surprising without context, a real trade-off). Offer it in the ship
   question, taken by default, status `Accepted`; write it in the ADR format
   ([name-it](../name-it/SKILL.md)). Offer at most one.
2. **The entry**, for anything else a later reader needs.
3. **Nothing**: the rest is discarded. Git history holds it.

## The entry

Append to `## Work items and runs` in the resolved reference docs'
`history.md`, newest last, under `### <id>`. About 12 lines at most:

- Id, title, date, lane, and the commit or PR. Commit: the `<id>:` message
  prefix, found with `git log --grep`, never a hash: the entry is written
  before the commit, so no hash exists yet.
- Decisions that mattered, then Assumptions kept and Non-goals.
- Findings logged, each with its to-do id.
- A run entry (written by [finish-it](../finish-it/DIGEST.md) §4) adds the
  slices shipped, the audit rounds, the final review's result, token input and
  output, and the four retro lines.

Entries are never pruned. No `history.md` yet: create it on the first entry,
with the title `History` and a `## Work items and runs` section, so no plan is
removed without a record.
