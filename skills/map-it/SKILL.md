---
name: map-it
description: Map an existing codebase or one area of it, as reference docs under docs/reference/ or as a map in chat, so later planning and review start from facts. Use when onboarding to an unfamiliar repo, when asked how something is structured or where something lives, before planning work in an area nobody has mapped, or when docs/reference/ is stale.
argument-hint: "[path or area] [--chat]"
---

# map-it

Read-only for code. Describes what is, not what should be: judgement
(debt, gaps, risks) belongs to `sweep-it`; structural proposals belong to
`deepen-it`.

## Modes

| Invocation | Writes | Use for |
|------------|--------|---------|
| `/map-it` | `docs/reference/` for the whole repo | First map of a repo, or a full refresh |
| `/map-it <path or area>` | Only the pages and sections that area touches | Before planning in that area; after it changed |
| `/map-it <area> --chat` | Nothing; the map goes in chat | A quick zoom-out: how does this fit together |

A model-invoked run (someone asked "how does X work?") defaults to `--chat`.
Write files only when the user asked for docs or ran `/map-it` directly.

## 1. Scope

- Read `GLOSSARY.md`, `docs/adr/`, and any existing `docs/reference/` first.
  Refresh, do not rewrite, what is still true.
- Huge repo with no area named: map the top level (module map, entry points)
  and say which areas deserve their own `/map-it <area>` run.

## 2. Explore

With a host that has an exploring subagent, send it with the scope and
[LAYOUT.md](LAYOUT.md) as the brief, very thorough, and work from its
findings; otherwise explore in the main context. Find:

- modules and what each is responsible for, with paths;
- entry points: routes, CLIs, jobs, workers, public APIs, `main` paths;
- how data flows in, where it is stored, what goes out;
- where tests live, what kinds exist, how they are run;
- the build, lint, format, type-check and test commands: take them from the
  `Commands:` line in `AGENTS.md` (setup-it writes it) and only discover
  them when it is missing.

Confirm in the code anything a doc or comment claims. Mark what could not be
confirmed `*(unverified)*`.

## 3. Write

Follow [LAYOUT.md](LAYOUT.md). Use `GLOSSARY.md` terms; list domain words the
code uses that the glossary lacks under **Glossary gaps** in `domains.md`
(offer them to `name-it`, do not add them here). Write the index
(`docs/reference/README.md`) last, with the date and the scope mapped.

`--chat`: the same content, condensed: a module table with paths, the main
flow in a few lines, where to start reading. No files.

## 4. Close

> Mapped <scope> (<N> pages). **Next:** `/sweep-it <scope>` to look for
> problems, or `/do-it "<change>"` to build in it.

Skipped / Not checked: the areas not read, and anything marked unverified.

## Rules

- No code edits, no judgement words ("messy", "should"), no findings.
- Never paste secrets, tokens or `.env` values into a map.
- Every section that names a module gives at least one path.
