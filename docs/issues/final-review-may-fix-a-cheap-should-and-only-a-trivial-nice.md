---
title: "Final review may fix a cheap Should, and only a trivial Nice"
type: feature
status: open
source: user
---

## Context

User request while reviewing the audit policy of `prove-it`, 2026-11-17:

> The skill says Should and Nice findings from the final review are logged as to-dos and never fixed - I think we need to review this based on effort and severity. Shoulds may be fixed if simple, nice can still be logged unless really easy to fix

The rule today: `skills/prove-it/SKILL.md:95` ("Should and Nice findings never block or start a re-audit"), `skills/prove-it/ROUNDS.md:32-35` ("They never block and never start a re-audit. Fixing them is the user's call"), and `skills/prove-it/ROUNDS.md:42` ("Log every open Should and Nice as a to-do" when the re-audit cap is refused). `ship-it` then carries them into the changelog or ADR notes, or offers to log them. Nothing in the rule looks at the size of the fix.

## Problem

A blanket "log, never fix" rule throws away the reviewer's severity judgement at the one point where it could be used. A Should whose fix is one line in one file costs more to log, triage and re-plan later than to fix in the round, while a Nice finding that needs a design change should never hold the ship. Effort and severity should decide, not the group label alone.

## Acceptance

- The policy states an effort threshold for acting without asking: a Should whose fix is small and local (one file, no interface, no behaviour change) may be fixed in the same audit round, and the report records it as settled.
- A Should above that threshold is logged as a to-do and blocks nothing, as today.
- A Nice finding stays logged unless its fix is trivial, and the text says which bar it uses.
- Every restatement of the old rule agrees with the new one: `skills/prove-it/SKILL.md`, `skills/prove-it/ROUNDS.md` (including the re-audit cap's step 1), `skills/prove-it/REPORT.md` and `skills/finish-it/SKILL.md`.
- `npm test && npm run check` passes, and a test or routing eval covers the fixed-versus-logged decision if the threshold lives in code.

## Notes

- `skills/prove-it/ROUNDS.md:32-45`, `skills/prove-it/SKILL.md:95-99`, `skills/prove-it/REPORT.md:13`, `skills/prove-it/VALIDATE.md:5` (Should and Nice skip validation, so a fixed Should gets no validation pass).
- Open decision for planning: the threshold (lines, files, interface touched) and whether the user is asked first, which the it-core assume-or-ask test settles.
- Related: the audit cap counts repeats by Must only (`docs/planning/run-caps-count-work`), so a fixed Should never spends a round.
