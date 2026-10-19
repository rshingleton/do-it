---
name: audit-it
description: Independently audit a built do-it work item (or any change since a ref) with fresh-context reviewers for spec, standards, compliance and architecture, and give a numbered verdict that routes failures back to build-it.
disable-model-invocation: true
argument-hint: "<work id> | --since <ref>"
---

# audit-it

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

## 2. Mechanical (main context)

Re-run the project's test, lint, format and type-check commands. Do not trust
the build's `verified:` lines. A failure is a **Must** with the command and
failing test as its case.

## 3. Reviewers (fresh context, in parallel)

Start these together as subagents and merge their reports here. Give each
pointers (the diff command, the untracked file list, the plan path), never
the build transcript.

| Reviewer | Lane S | Lane M | Brief |
|----------|--------|--------|-------|
| Spec and Standards | yes | yes | Call the Skill tool with "code-review", fixed point `base_ref`, spec = the plan and its `sources:`, standards = repo docs plus [REVIEW-STANDARDS.md](REVIEW-STANDARDS.md) |
| Compliance | yes | yes | Call the Skill tool with "compliance" on the change |
| Architecture | no | yes | [ARCHITECTURE.md](ARCHITECTURE.md) on every touched module |

Lane XS is not audited here; `ship-it` does its self-review.

## 4. Verdict

Write findings per the contract in [REPORT.md](REPORT.md): concrete case or no
finding, recorded decisions are not findings, numbered Must / Should / Nice.

- Any **Must**: `FAIL`.
- Otherwise `PASS`.

Lane S: findings go in chat and a short `## Audit` section appended to the
plan file. Lane M: `docs/planning/<id>/audit-report.md`.

Update the state block:

```yaml
audit: { verdict: PASS, round: 1, fingerprint: <fingerprint.sh output>, at: 2026-10-19 }
status: shipping      # FAIL sets status: building
```

Compute the fingerprint with `bash ../do-it/scripts/fingerprint.sh <base_ref>`
(path relative to this skill's directory).

## 5. Route

- `PASS`: return `done`. **Next:** `/ship-it <id>`.
- `FAIL`, round 1 or 2: return `failed` with the Must numbers. `do-it` sends
  them to `build-it`, which fixes only those and hands back for a full
  re-audit (every check, every time).
- `FAIL`, round 3: return `blocked`. Show the Musts and ask the user whether
  to fix, accept with a recorded decision, or re-plan.

Should and Nice findings never block. `ship-it` carries them into the
changelog or ADR notes. Mechanical rules that keep failing are listed as
**Guardrail candidates**: rules for `.compliance-rules/checks.json` or the
lint config, so the hooks catch them next time.
