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
tool with "domain-modeling" for the format.

## Changelog

Find the repo's changelog (`CHANGELOG.md`, `docs/changelog*`, a changesets
dir). Add one entry in its existing style: what shipped, in user-facing terms.
With no linked ADR, add the audit's non-blocking notes and the plan's key
decisions as sub-bullets. No changelog in the repo: skip, do not create one.

## Shortcut markers

List the markers the change added:

```bash
git diff -U0 <base_ref> | grep -E '^(\+\+\+ |@@ |\+.*shortcut:)'
```

plus any in untracked files. A marker without an upgrade trigger is
`no-trigger`. Offer the `no-trigger` ones, numbered, in the ship question;
file each one the user picks with `issue-it` (`type: defer`,
`source: ship-it`, the `file:line` and limit).

## Before deleting the plan

Check the plan for decisions or context that neither an ADR nor the changelog
entry holds. Move them into the changelog entry (or the ADR's execution notes)
first. Keep it to a few lines; the code and the commit say the rest.
