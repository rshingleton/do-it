---
name: retro-it
description: Turn mistakes from a work item or session into fixes to the environment (checks, lint rules, standards, skill issues) so they are caught next time.
disable-model-invocation: true
argument-hint: "[work id | audit report path | session]"
---

# retro-it

Fix the environment, not the code. A mistake that happened once and will
happen again belongs in a check, a standard or a skill, not in a reminder.

## 1. Gather

Read whichever apply, newest first:

- **Audit reports:** `docs/planning/<id>/audit-report.md` or the plan's
  `## Audit` section; take the **Guardrail candidates** and every Must
  finding. A work item already shipped: its changelog entry and ADR
  execution notes.
- **Sweep reports:** `docs/reference-audit/*.md`.
- **The session:** failed checks, hook blocks, review findings, corrections
  the user made, steps that took several tries.

## 2. Classify each mistake

| Kind | Signal | Fix |
|------|--------|-----|
| Mechanical | A pattern a regex or linter could decide (a banned call, an import shape, a file location) | A `.compliance-rules/checks.json` rule (see the `guard-it` skill's format) or a rule in the repo's own lint config, whichever the repo already runs |
| Judgement | Needs reading the code around it (naming, layering, matching the surrounding style) | One line in the repo's standards doc (`CODING_STANDARDS.md`, `STANDARDS.md`, or the file `setup-it` named), which `prove-it` reviews against |
| Process | A do-it step misled the agent, asked needlessly, or missed a case | An issue against the do-it skills, filed with `log-it` |
| Navigation | The agent could not find something it needed | A pointer in `AGENTS.md` or a `docs/reference/` page (offer `/map-it <area>`) |

Prefer the mechanical fix whenever one exists. A mistake that needs no
change (a one-off, already covered) is dropped with one line of why.

Before proposing a check, look for one that already exists but is unwired
(a lint rule disabled, a script CI never runs): wiring it is the fix.

## 3. Propose

One numbered list, most costly mistake first. Each item:

- **What happened:** the mistake, with its file and line or command.
- **Fix:** the exact rule, line or issue text.
- **Would have caught:** the concrete case, shown failing against the rule.
- **Cost:** false positives it may raise, if any.

End the turn. Write only the items the user picks.

## 4. Apply

- Checks: write and prove the rule as [guard-it](../guard-it/SKILL.md)'s "Add
  a mechanical rule" says (format, fires on the case, does not flood), or
  add it to the repo's own lint config and run the linter the same two ways.
- Standards: append the line in the doc's existing format.
- Issues: call the Skill tool with "log-it" (`source: retro-it`).

> Retro on <scope>: <N> fixes applied (<checks>, <standards>, <issues>).
> Skipped / Not checked / Risk.
> **Next:** <commit them with the work, or on their own>.

## Rules

- Edits only environment files (`.compliance-rules/`, lint config,
  standards docs, `AGENTS.md`); never product code.
- `AGENTS.md` gets pointers, not rules: rules go where they are enforced.
