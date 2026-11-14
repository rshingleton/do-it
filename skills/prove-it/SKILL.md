---
name: prove-it
description: Independently audit a built do-it work item (or any change since a ref) with fresh-context reviewers for spec, standards, compliance and architecture, and give a numbered verdict that routes failures back to build-it.
disable-model-invocation: true
argument-hint: "<work id> | --since <ref>"
---

# prove-it

Read-only for code. Different eyes: the reviewers never see the build
conversation, only the plan, the change and the build report in the state
block.

## 1. Pin the change

- Work id: read the state block ([STATE.md](../do-it/STATE.md)). The change is
  `git diff <base_ref>` plus untracked files
  (`git ls-files --others --exclude-standard`), excluding `docs/planning/`.
  Any phase not `done`: stop, `blocked`.
- `--since <ref>`: the same, from that ref, with no plan. The Spec axis then
  uses whatever spec the user names, or is skipped.

Empty change: stop and say so.

## 2. Mechanical (main context, last)

After §3, once, and only when no Must stands: re-run the project's test, lint,
format and type-check commands; do not trust `verified:` lines. A failure is a
**Must** with the command and failing test as its case ([ROUNDS.md](ROUNDS.md)).

## 3. Reviewers (fresh context, in parallel)

An agent cannot call a skill, so run two of these here and start the third:

- **Spec and Standards:** call the Skill tool with "review-it", fixed point
  `base_ref`, spec = the plan and its `sources:`. It starts its own two
  `it-reviewer` agents and brings the repo's standards and its baselines.
- **Compliance:** call the Skill tool with "guard-it" on the change.
- **Architecture (lane M only):** start one `it-reviewer` agent (mid-tier
  model, `## Report` shape, under 400 words) on [ARCHITECTURE.md](ARCHITECTURE.md) for every touched module.

Give each reviewer pointers (diff command, untracked files, plan path), never the
build transcript, plus, after round 1, the scope and Settled list ([ROUNDS.md](ROUNDS.md)).

Lane XS is not audited here; `ship-it` does its self-review.

## 4. Verdict

Write findings per the contract in [REPORT.md](REPORT.md): concrete case or no
finding, recorded decisions are not findings, numbered Must / Should / Nice.
Then validate every Must except failed mechanical checks per
[VALIDATE.md](VALIDATE.md): a fresh `it-reviewer` agent confirms or rejects each one from
the code alone; rejected ones move to **Not confirmed** and stop blocking.

- Any confirmed **Must**: `FAIL`.
- A review axis that is **unverified** (a reviewer that errored, timed out or
  returned nothing or malformed output: review-it's `Unverified:`, guard-it,
  the Architecture reviewer, or a bare "No findings." that says nothing of what
  it read) is no pass. Run that reviewer once more (the same round: `run audit`
  is not called again); still unverified: fire
  `work.mjs event <id> block "<axis> unverified: <why>"`, return `blocked` and
  name the axis. `audit-pass` and `audit-fail` stay un-fired.
- Otherwise `PASS`.

Lane S: findings go in chat and a short `## Audit` section in the plan file;
lane M: `audit-report.md`. Round 1 adds `### Settled` and `### Touched` there.

Record the verdict with the work-item script ([STATE.md](../do-it/STATE.md)):

- `PASS`: `work.mjs event <id> audit-pass`. It hashes the change since
  `base_ref` and records it as `audit.fingerprint`, sets `round` back to 0
  and `status: shipping`.
- `FAIL`: `work.mjs event <id> audit-fail <must numbers>`, e.g.
  `audit-fail 1 3`. It adds one to `round` (consecutive failed audits) and
  sets `status: building`.

A refused event (the script exits 1) is `blocked`.

## 5. Route

- `PASS`: return `done`. Called by `do-it`, let it continue; run alone, say
  **Next:** `/ship-it <id>`.
- `FAIL`, round 1 or 2: return `failed` with the Must numbers. `do-it` sends
  them to `build-it`, which fixes only those (its fix mode) and hands back
  for a re-audit scoped and ordered per [ROUNDS.md](ROUNDS.md).
- `FAIL`, round 3 or later (the script sets `status: blocked`): return `blocked`.
  Show the Musts and ask the user whether to fix (`unblock`; the round
  count continues), accept with a recorded decision (add it to the plan's
  `## Decisions`, creating the section in a lane S plan, then `unblock` and
  `build-done` to re-audit), or re-plan (`replan`, then scope-it).
- An axis still unverified after its retry: return `blocked` (the `block` event
  above set `status: blocked` and the blocker). Once the cause is fixed,
  `unblock` then `build-done` re-audits.

Should and Nice findings never block or start a re-audit. `ship-it` carries them into the
changelog or ADR notes, and with no changelog offers to log them as
to-dos. Mechanical rules that keep failing are listed as
**Guardrail candidates**: rules for `.compliance-rules/checks.json` or the
lint config, so the hooks catch them next time. `/retro-it` turns them into
those rules.
