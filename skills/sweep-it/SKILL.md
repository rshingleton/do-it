---
name: sweep-it
description: Audit existing code (the whole repo, a path, or recent hot spots) for pre-existing bugs, security and compliance risks, test gaps, tech debt, doc drift and dead weight, as ranked findings each with a concrete case; then offers to file the chosen ones as issues. Use for "audit this codebase", a tech-debt or health survey, finding gaps before planning work in an area, or inheriting unfamiliar code.
argument-hint: "[path | --hot] [--chat]"
---

# sweep-it

Read-only for code. Audits what is already there, unlike `prove-it`, which
audits one change. Reports; changes nothing; files only what the user picks.

## 1. Scope

| Invocation | Scope |
|------------|-------|
| `/sweep-it` | The whole repo, deepest where a mistake costs most |
| `/sweep-it <path>` | That path and what it calls |
| `/sweep-it --hot` | Files changed most in recent history (`git log --format= --name-only -n 300 \| sort \| uniq -c \| sort -rn`) |

Start from `docs/reference/` when it exists; otherwise read the README,
build and deploy config, dependency manifests, entry points and tests. Find
the expected load (one user running a script, or many users at once) and say
which you assumed. Read the risky paths end to end: user input, auth, money,
data writes, background jobs, shared state.

## 2. Lenses

Run the lenses in [LENSES.md](LENSES.md): bugs, risk, scale, test gaps, debt,
drift, lean, and a short architecture pass. A repo-wide sweep on a host with
subagents: one fresh-context `it-reviewer` agent (mid-tier model) per group of
lenses (correctness and risk; tests; debt, drift and lean), each reporting
in its `## Report` shape under 500 words and given the scope, the assumed load and
[LENSES.md](LENSES.md); merge their findings here and re-check each one.

Compliance: call the Skill tool with "guard-it" on the scope, so repo
rules and the mechanical checks are applied the same way as in `prove-it`.

## 3. Check before reporting

The finding contract in [REPORT.md](../prove-it/REPORT.md) applies: a concrete
case or no finding; recorded decisions (ADRs, `shortcut:` markers that name
their limit) are not findings; before calling code unused, grep the whole
tree including tests, config and string references. Prefer fixes that delete
code. At most 20 findings; say how many smaller ones were left out. Validate
every Must per [VALIDATE.md](../prove-it/VALIDATE.md) before reporting it;
rejected ones go under Not confirmed with the reason.

## 4. Report

Shape in [REPORT.md](REPORT.md). Written to
`docs/reference-audit/<date>-<scope>.md`, or in chat only with `--chat` (the
default when a model-invoked run was a quick question). Present the findings
and the verdict in chat either way.

## 5. File what matters

Ask once which numbered findings to file, and where. Must and Should go to
an issue: call the Skill tool with "log-it" (`kind: issue`, `source: sweep-it`, the
finding's case and fix in the body). Nice findings default to the to-do list:
call the Skill tool with "log-it" (`kind: todo`, tag `nice-to-have`, the
finding's location as source). Never file the whole report unasked.

> Swept <scope>: <N> findings (<M> Must). Filed: <refs or none>.
> **Next:** `/do-it <ref>` for a filed issue, or
> `/deepen-it <area>` for the structural notes.

Not checked: the parts not read, commands not run, the load assumed.
