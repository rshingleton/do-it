# To-do file format

Plain Markdown so it reads well on GitHub and diffs cleanly. Ids are
`T<n>`, never reused; the next id is one more than the highest in the file.

```markdown
# To-do

Nice-to-haves and things to circle back to. Managed by todo-it; edit freely.

## Open

- [ ] T7 Add a CI workflow running npm test and npm run check `nice-to-have` (session 2026-10-19)
- [ ] T8 Treat packages/, apps/, services/ as containers in the code map `idea` (hooks/lib/codemap.mjs)
  - Monorepos show one line per container today; children are hidden.

## Done

- [x] T3 Rename word-it to skill-it (done 2026-10-19: commit 1800c62)
- [x] T5 Fingerprint script in Node (done 2026-10-20: promoted -> gh-14)

## Dropped

- [x] T2 Port wayfinder (dropped 2026-10-19: roadmap-it covers it)
```

Rules:

- One item per line: id, text, tag in backticks, source in parentheses.
  Optional indented notes below.
- Open items keep the order they were added. Done and Dropped are newest
  first.
- A hand-edited file is fine: keep whatever the user wrote, only add or move
  lines.
