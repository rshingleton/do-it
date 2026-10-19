# Probing

Stage 4 of [debug-it](SKILL.md).

## Order of tools

1. A debugger or REPL, where the environment allows it: one paused frame shows
   more than a page of output.
2. A few log lines at the boundaries that tell the hypotheses apart.
3. Never blanket logging followed by a search through the noise.

## Tag every probe

Give every temporary log or print one unique tag for this session, such as
`[dbg-7c1e]`. At the end a single grep for the tag finds every probe, so none
ship. Untagged debug output is how stray prints reach production.

## Slowness is measured, not logged

For a performance regression, logs mislead. Take a baseline first (a timing
harness, `performance.now()`, a profiler, the database's query plan), then
bisect or vary one thing at a time against that number. No fix before a
measurement says where the time goes.
