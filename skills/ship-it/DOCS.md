# Durable docs

The plan is temporary. What survives it: ADRs (why), the changelog (what
shipped), the area's `CONTEXT.md` and the context map (words and where
things live), and issues for what was left undone.

## ADRs

The plan's ADRs are the ones it links that exist under `docs/adr/`. For each:
status `Proposed` → `Accepted`, then add an `## Execution notes` section with
the audit's Should and Nice findings and anything the build learned that
changes the context. Touch no other ADR. Create none here.

## Area context and the map

The area is the one the plan worked in (it-core). In its `CONTEXT.md`:

- **Terms:** merge the terms the plan or the code introduced, in the existing
  format.
- **Key files:** add, move or drop rows for files the build created, moved or
  deleted. Leave the other sections to `map-it`.

In `CONTEXT-MAP.md`, update the area's row when its Location or Scope moved.
No context file for the area and the plan introduced domain terms: create it,
and its map row, as name-it's
[CONTEXT-FORMAT.md](../name-it/CONTEXT-FORMAT.md) says.

## Changelog

Use the repo's resolved changelog (project docs in session context; a
`.changeset/` directory means write a changeset file). Add one entry in its
existing style: what shipped, in user-facing terms.
With no linked ADR, add the audit's non-blocking notes and the plan's key
decisions as sub-bullets. No changelog in the repo: skip, do not create one.

## Audit findings

With no changelog (no resolved changelog and no `.changeset/`) to carry them,
the audit's Should and Nice findings would be lost when the plan is deleted.
Take them from the plan's `## Audit` section (lane M: `audit-report.md`), in
the `Must|Should|Nice | file:line | claim` shape. For each one the user chose,
call the Skill tool with "log-it": one to-do, `source: <work id> audit`, the
claim and its `file:line`. None chosen, none found, or no plan audit (lane
XS): skip. With a changelog: log none; they go into its entry as under
"Changelog".

## Rollback note

**Risk-area work** ([LANES.md](../do-it/LANES.md)): a rollback note (revert,
a flag, a down migration, data to restore) for the changelog and commit body;
no safe rollback: say so plainly.

## Shortcut markers

List the markers the change added:

```bash
git diff -U0 <base_ref> | grep -E '^(\+\+\+ |@@ |\+.*shortcut:)'
```

plus any in untracked files. A marker without an upgrade trigger is
`no-trigger`. Offer the `no-trigger` ones, numbered, in the ship question.
Each one the user picks goes to the to-do list by default (call the Skill
tool with "log-it", `kind: todo`, tag `debt`, the `file:line` and limit as
source), or to an issue with `log-it` (`type: defer`) when the user wants it planned.

## What the plan knows

The plan is deleted at commit time, so while writing these docs, check it for
decisions or context that neither an ADR nor the changelog entry holds. Put
them in the changelog entry (or the ADR's execution notes) now. Keep it to a
few lines; the code and the commit say the rest.
