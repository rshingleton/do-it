---
title: Compliance scanner cannot run from a skills-only install
type: bug
status: open
source: todo-clearance-2026-11 R1 audit round 1
---

## Context

Filed from the todo-clearance-2026-11 run, R1 audit round 1, 2026-11-16.
The compliance scanner the installed skill points at is broken: the installed
skill has no `hooks/lib/checks.mjs` (it exists in this checkout). The repo also
has no `.compliance-rules/`, no security policy and no dependency manifests, so
the equivalent check was run by hand: a secret-like string scan of the diff,
which found none. The gap belongs in the digest's "not checked" list.

## Problem

The mechanical compliance scan cannot run from a skills-only install: it
resolves `hooks/lib/checks.mjs` relative to the installed skill root, and a
`skills` CLI or plugin install carries skills alone. Every audit therefore
loses that axis silently, which reads as clean. On a repo with no rules file,
no policy and no manifests the scan has nothing to run either, and that is not
reported as a limitation.

## Acceptance

- The scan runs from every install route (symlink, plugin, `skills` CLI), or
  says plainly that it cannot and why.
- A missing `hooks/lib/checks.mjs` is reported as unverified, never as a clean
  scan.
- A repo with no `.compliance-rules/`, security policy or dependency manifests
  names which inputs were absent.
- An audit's digest lists the gap under "not checked".

## Notes

- `hooks/lib/checks.mjs` exists in the checkout; the installed copy lacks it.
- Related: T78 (tracker and install doctors), guard-it's dependency item.
- Workaround used in the run: a manual secret-like string scan of the diff; no
  findings.
