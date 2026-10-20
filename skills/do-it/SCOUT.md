# Scout

A short, read-only look at the code before sizing. Budget: a few searches and
a handful of files. Do it in the main context for small repos; with a large
repo and a host that has an exploring subagent, send one with the request
and this brief, and keep only its summary.

## 1. Project state

| State | Signal | Effect |
|-------|--------|--------|
| **New** | No source beyond scaffolding: `git ls-files` shows only docs, config or a template, or the user says it is new | Plan with the greenfield agenda ([GREENFIELD.md](../scope-it/GREENFIELD.md)). At least lane S; lane M when it has more than one module or needs a stack decision. |
| **Existing, mapped** | `docs/reference/` exists (from `map-it`) | Read `docs/reference/README.md` and the pages for the area first; search from there. |
| **Existing, unmapped** | Code, no `docs/reference/` | Search directly. For lane M and up in an area the scout could not get a clear picture of, suggest `/map-it <area>` in the lane line; do not run it unasked. |

A map older than the code it describes is a hint, not a fact: confirm in the
code before relying on it.

No `.do-it/config.env` in an existing repo: the tracker, lint command and doc
paths are all defaults. Say so in the lane line and suggest `/setup-it`
once; proceed with the defaults either way.

## 2. Look

Find, in this order, and stop once the lane is clear:

1. **What already exists.** The modules, functions, commands or config the
   request names or implies (search for the domain terms, the Terms in
   the area's `CONTEXT.md`, route or command names). Existing code that already does most of the
   job shrinks the lane.
2. **Reach.** Callers and dependants of what will change; how many modules
   and layers the change crosses; whether it adds a new seam or public
   interface.
3. **Risk.** Whether it touches a risk area ([LANES.md](LANES.md)); whether
   tests exist around it (no tests around risky code raises the lane).
4. **Constraints.** ADRs in `docs/adr/` and open work items in
   `docs/planning/` that touch the same area. Overlap with an open item: say
   so, and offer to fold the request into it.
5. **External facts.** The request depends on a library, API or standard the
   code does not settle: note it for `scope-it`, which calls `look-it-up`.

## 3. Report

One clause in the lane line naming what was found, and the paths:

> Lane M: no limiter exists; login, signup and reset all need it, and
> `src/auth/` has no tests. Grill, plan, build, audit, ship.

Write nothing to disk. `scope-it` re-reads what it needs; the scout's job is
only to size.
