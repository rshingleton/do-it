# Durable docs

The plan is temporary. What survives it: ADRs (why), the changelog (what
shipped), `GLOSSARY.md` (words), and issues for what was left undone.

## ADRs

The plan's ADRs are the ones it links that exist under `docs/adr/`. For each:
status `Proposed` → `Accepted`, then add an `## Execution notes` section with
the audit's Should and Nice findings and anything the build learned that
changes the context. Touch no other ADR. Create none here.

## GLOSSARY.md

Merge terms the plan or the code introduced, in the existing format. New file
only if the plan introduced domain terms and the repo has none; call the Skill
tool with "name-it" for the format.

## Changelog

Use the repo's resolved changelog (project docs in session context; a
`.changeset/` directory means write a changeset file). Add one entry in its
existing style: what shipped, in user-facing terms.
With no linked ADR, add the audit's non-blocking notes and the plan's key
decisions as sub-bullets. No changelog in the repo: skip, do not create one.

## Shortcut markers

List the markers the change added:

```bash
git diff -U0 <base_ref> | grep -E '^(\+\+\+ |@@ |\+.*shortcut:)'
```

plus any in untracked files. A marker without an upgrade trigger is
`no-trigger`. Offer the `no-trigger` ones, numbered, in the ship question.
Each one the user picks goes to the to-do list by default (call the Skill
tool with "todo-it", tag `debt`, the `file:line` and limit as source), or to
an issue with `log-it` (`type: defer`) when the user wants it planned.

## What the plan knows

The plan is deleted at commit time, so while writing these docs, check it for
decisions or context that neither an ADR nor the changelog entry holds. Put
them in the changelog entry (or the ADR's execution notes) now. Keep it to a
few lines; the code and the commit say the rest.
