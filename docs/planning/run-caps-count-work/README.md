---
id: run-caps-count-work
title: "Run caps count work, not attempts"
lane: m
status: shipping
tracker: null
sources:
  - docs/issues/the-slice-cap-counts-the-time-a-slice-is-parked-waiting-for.md
  - docs/issues/the-per-slice-audit-cap-parks-a-slice-whose-rounds-each-foun.md
roadmap: null
todo: []
base_ref: 208c5e4afed55379728aaff35903b5a4bd4e02be
approvals:
  plan: 2026-11-17
phases:
  - n: 1
    title: The slice cap counts in-flight minutes
    blocked_by: []
    status: done
    verified: "npm test && npm run check: pass"
  - n: 2
    title: The audit cap counts repeated Musts
    blocked_by: [1]
    status: done
    verified: "npm test && npm run check: pass"
  - n: 3
    title: Acceptance from both issues
    blocked_by: [2]
    status: done
    verified: "npm test && npm run check: pass"
assumptions:
  - "audit_cap keeps 3: a round that repeats an earlier Must spends one, so four consecutive same-Must rounds park (reversible: run set audit_cap)"
  - "A round is classified by the Musts raised so far, read from the plan's audit.must, not a new run audit flag"
  - "Only parked time is excluded, not blocked time"
  - The final review and the run total keep counting every round; only the per-slice counter changes
  - "The patch version bump (0.2.2) is a version-gate dependency of any skills change, so it rides with the phase rather than the plan"
fix: []
defects:
  - "changeset and hook-trust budget tests flake under parallel load: they pass alone and on a rerun, and one aborted a verify-phase run (phase 3)"
audit:
  verdict: PASS
  round: 0
  must: []
  fingerprint: 67e7cda37bf56be19d4f6f4eee391b1476ed6296
  at: 2026-11-17
  clean_passes: 1
ship:
  prepared: null
  fingerprint: null
blocker: null
---

# Run caps count work, not attempts

## Goal

A complete run's caps fire on the thing they exist to stop, not on a proxy that
misfires: the slice cap refuses only a slice that spent too long working, and
the audit cap refuses only a slice whose rounds keep repeating a Must already
raised. Neither fire is escapable only by raising a guard.

## Phases

| Phase | Delivers | Blocked by |
|-------|----------|------------|
| [1](phase-1.md) | The slice cap counts in-flight minutes | none |
| [2](phase-2.md) | The audit cap counts repeated Musts | 1 |
| [3](phase-3.md) | Acceptance from both issues | 2 |

## Files

skills/do-it/scripts/gate.mjs
skills/do-it/scripts/run.mjs
skills/do-it/scripts/runs.mjs
skills/do-it/scripts/work.mjs
skills/do-it/scripts/stops.mjs
skills/do-it/STATE.md
skills/finish-it/SKILL.md
skills/finish-it/STOPS.md
skills/track-it/CONFIG.md
docs/issues/the-slice-cap-counts-the-time-a-slice-is-parked-waiting-for.md
docs/issues/the-per-slice-audit-cap-parks-a-slice-whose-rounds-each-foun.md
tests/run-gate.test.mjs
tests/work.test.mjs
tests/tracks-check-slot.test.mjs
tests/tracks-record.test.mjs

## Interfaces

`gate(record, id, {current, merged, now}) -> {allow, reason, detail}` stays the shape; `SLICE_CAP` fires only when `active_ms + (now - active_since) - waited_ms` exceeds a non-null `slice_cap_min`
`countAudit(planningDir, slug, {id, final, musts}) -> {audit_rounds, audit_spent, allow, reason, limit, detail}` adds `audit_spent`, the per-slice cap counter
run record `gates[].active_ms -> ms of closed in-flight spans`; `gates[].active_since -> start of the open span`; `gates[].last_seen -> the last command that showed the slice alive`; `gates[].audit_spent -> rounds that repeated any Must an earlier round raised`; `gates[].last_musts -> the Musts the round before raised`; `gates[].seen_musts -> every Must raised so far, the set the repeat test reads`; `slice_cap_min: null -> no cap`
`run start` on a slice already in flight closes its span at `last_seen` and opens a new one; `run slice <id> parked` closes it and `ready` opens one, so a park or an interrupted session does not spend the cap
`DO_IT_SLICE_CAP_MIN` / `--slice-cap-min` empty -> no cap, the same shape as `DO_IT_MAX_SLICES`

## Decisions

- The audit cap's number stays 3. A repeat of an earlier Must spends one, so a
  slice parked on a loop has repeated the same finding four times. The
  audit-cap issue's "fails twice on the same Must is still parked" was written
  against the old counter and is amended when this ships.
- The Musts come from the plan's `audit.must`, which build-it already records,
  kept across rounds in the record's `seen_musts`, not from a new `run audit`
  flag. A plan with no Musts or no work id classifies as new, so nothing is
  spent.
- `audit_rounds` stays the honest count of rounds started, which the digest
  reports; `audit_spent` is the counter the per-slice cap reads. The final
  review and the run total keep counting every round.
- The time cap counts in-flight spans, each closed at the last command that
  showed the slice alive, and `run start` on a running slice opens a new one.
  That is the interruption seam: a machine that slept or a session that lost its
  host resumes into a fresh span, not a day of wall clock. The trade-off is
  that only recorded activity is charged, so a caller that called `run start`
  twice around a gap would zero it. Accepted: the cap is a tripwire for a
  human, `run start` is a visible record write, and the audit cap still bounds
  rounds.
- A gap inside one live process, where no command runs on return, still counts.
  No command can see it; re-start is the seam.
- Mid-build the user asked for a test-suite consolidation outside this plan's
  scope: 721 tests to 550, the fixture copy fix and the fast inner-loop note.
  The audit is `docs/research/test-suite-audit.md`. It rides in this change by
  the user's direction, not as plan scope.

## Non-goals

- The final review's own cap and the run total's counting rule.
- Blocked time.
- Detecting a sleep or host gap with no command on return.
- Raising or removing the 120-minute default; empty is the off switch.
- Refunding a round already spent: a classification is a one-way fact.

