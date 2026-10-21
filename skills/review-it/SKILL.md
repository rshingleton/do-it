---
name: review-it
description: Review a change since a base (a commit, branch, tag or merge-base, committed or still in the working tree) on two separate axes, Spec (did it build what was asked) and Standards (does it follow this repo's rules), in parallel fresh-context reviewers, reported side by side. Use when asked to review a branch, a PR, work in progress or "everything since X", or when prove-it needs its spec and standards review.
---

# review-it

Two questions, asked by two reviewers who never see each other's answer:

- **Spec:** does the change do what the issue or plan asked, no less, no more?
- **Standards:** does it follow the rules this repo writes down?

A change can be perfectly styled and wrong, or right and off-standard.
Merging the two answers lets one hide the other, so they stay apart.

## 1. The change

The base is whatever the caller names: `prove-it` passes the work item's
`base_ref`; a person may say a branch, tag, commit or `main`. No base given:
ask for one.

| Work is | Diff | Also list |
|---------|------|-----------|
| Committed (a branch, a PR) | `git diff <base>...HEAD` (against the merge-base) | `git log --oneline <base>..HEAD` |
| Uncommitted (a do-it build) | `git diff <base>` (against the working tree) | untracked files: `git ls-files --others --exclude-standard` |

Check here, not inside the reviewers, that the base resolves
(`git rev-parse --verify <base>`) and the change is not empty.

## 2. The spec

First match wins:

1. A spec the caller passed (`prove-it` passes the plan and its `sources:`).
2. A do-it work item in `docs/planning/` whose `base_ref` is this base
   ([STATE.md](../do-it/STATE.md)).
3. Issue refs in the commit messages or branch name (`#12`, `owner/repo#12`,
   `ABC-123`): call the Skill tool with "track-it" and fetch them.
4. A spec or plan file under `docs/` named after the branch or feature.
5. Ask the user. "There is none" means the Spec reviewer is skipped and the
   report says so.

## 3. The standards

Collect every file in the repo that says how code should be written:
`CODING_STANDARDS.md`, `CONTRIBUTING.md`, `AGENTS.md`, style guides,
`.compliance-rules/coding-standards*.md`, anything the caller adds. On top
of those, the Standards reviewer always carries the smell baseline in
[SMELLS.md](SMELLS.md) and the fit and hygiene baseline in
[BASELINE.md](BASELINE.md), under two rules: a documented repo rule beats a
baseline wherever they disagree, and a smell is always a judgement call,
never a hard violation. Neither reviewer reports what a linter or formatter
already enforces.

## 4. Two reviewers at once

Start both as `it-reviewer` agents in the same turn (mid-tier model, reports
in its `## Report` shape under 400 words each); each reads one diff against one source, which does not need the top tier. Give each
the diff commands and file list, never this conversation.

**Spec reviewer** gets the spec (path or fetched text) and this brief:

> Find (a) requirements missing or only partly done, (b) behaviour added that
> nobody asked for, (c) requirements that look done but behave wrongly.
> One line per finding: `Must|Should|Nice | file:line | claim | case`, the
> case quoting the spec line. Under 40 words a line, 300 in all.

**Standards reviewer** gets the paths of the standards files,
[SMELLS.md](SMELLS.md) and [BASELINE.md](BASELINE.md), and this brief:

> Find (a) breaches of a documented rule, citing the file and the rule, and
> (b) baseline smells, named and with the hunk quoted. A smell is a judgement
> call, never Must, and a documented rule overrides it. One line per finding:
> `Must|Should|Nice | file:line | claim | case`. Under 40 words a line, 300
> in all.

## 5. Report

Put the two reports under `## Spec` and `## Standards`, as returned or
lightly tidied. Do not merge, rerank or pick a winner between them. Close
with one line per axis: how many findings, and the worst one on that axis.

Called by `prove-it`: return the two sections; it writes the verdict.
