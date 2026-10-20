---
status: accepted
---

# Context files and a context map, not GLOSSARY files

mattpocock/skills renamed its domain-doc convention from `CONTEXT.md` /
`CONTEXT-MAP.md` to `GLOSSARY.md` / `GLOSSARY-MAP.md` (upstream d80fa0f) and
recorded no reason. do-it keeps the CONTEXT names: an area's file holds more
than terms (identity, relationships, key files, design notes), so "glossary"
undersells it, and the repos do-it works in (amp) already use a root
`CONTEXT-MAP.md` with one `CONTEXT.md` per area. Following upstream would
have meant renaming those files and losing the richer shape; GLOSSARY files
are still read as a last fallback so mattpocock-style repos keep working.

## Execution notes

- The resolver keeps `DO_IT_GLOSSARY` as an alias of `DO_IT_CONTEXT`, so
  existing configs keep working.
- A dry run of map-it against amp found area files with headings outside
  the five-section shape ("Domain Concepts", "Status"). Such sections are
  kept as written, and one that defines domain words counts as Terms.
- The plan's phase 1 text said the map appears "when a second area gets a
  context", which contradicted the decision that the first area below the
  root creates it; the audit caught it and the decision won.
- Open notes from the audit: a prose-only `## Relationships` heading shows
  empty in the session map; scope-it §5 does not repeat the missing-context
  step; ship-it's DOCS.md can still create a context file for new terms; the
  manifest list lives in both `hooks/lib/codemap.mjs` and CONTEXT-FORMAT.md;
  the code map comment and a test fixture use amp as the example; indented
  headings and escaped pipes are not handled in the over-budget path.
