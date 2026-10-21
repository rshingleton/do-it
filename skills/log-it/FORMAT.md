# To-do file format

Plain Markdown so it reads well on GitHub and diffs cleanly. Ids are
`T<n>`, never reused. The `Next id:` line holds the next one; take it on
each add and bump it. A file without the line: one more than the highest id
in the file, then write the line.

```markdown
# To-do

Nice-to-haves and things to circle back to. Managed by log-it; edit freely.
Closed items are removed: the changelog, the commit or git history keeps them.

Next id: T9

## Open

- [ ] T7 Add a CI workflow running npm test and npm run check `nice-to-have` (session 2026-10-19)
- [ ] T8 Treat packages/, apps/, services/ as containers in the code map `idea` (hooks/lib/codemap.mjs) -> codemap-containers
  - Monorepos show one line per container today; children are hidden.
```

Rules:

- One item per line: id, text, tag in backticks, source in parentheses,
  then `-> <work id>` while a build is in flight. Optional indented notes
  below.
- Open items keep the order they were added.
- Only open items live here. No Done or Dropped sections.
- A hand-edited file is fine: keep whatever the user wrote, only add or
  remove item lines.
