# Phase 2: The audit cap counts repeated Musts

Plan: run-caps-count-work. Blocked by: 1.

## Goal

A slice whose rounds keep finding new, real Musts is not parked by the audit
cap. The cap counts rounds that repeat a Must already raised, and a refusal
says the last fix was never reviewed.

## Scope

`countAudit` classifies the round the slice just finished against every
round already raised: it advances the per-slice counter `audit_spent` only when
every Must the plan now lists was already raised, and its refusal names that. The honest
round count stays in `audit_rounds`, which the digest and the run total keep
reading. `resumeSlice` starts both counters again. The final review and the run
total are untouched.

## Files

skills/do-it/scripts/gate.mjs
skills/do-it/scripts/run.mjs
skills/do-it/scripts/work.mjs
skills/do-it/scripts/stops.mjs
skills/do-it/STATE.md
skills/finish-it/SKILL.md
skills/finish-it/STOPS.md
tests/run-gate.test.mjs
tests/tracks-record.test.mjs

## Seams

- `countAudit({musts})`: catches the new-versus-repeat classification and that a
  refused call spends nothing. It misses a hand-edited `audit.must`, because
  the record keeps the round before's list in `last_musts`.
- `atCap`, `exhausted` and `gate` on the slice limit: catches a counter left
  reading the total's `audit_rounds`. It misses the total's own cap, which is
  deliberately unchanged.
- `resumeSlice`: catches a repeat laundered across a park. It misses a slice
  parked before `last_musts` existed, which classifies as new once.

## Steps

1. Give each limit its counter: the slice limit reads `audit_spent` and the
   total keeps `audit_rounds`. A counted call increments the gate entry's
   `audit_rounds` itself and `audit_spent` only when every Must in `musts`
   appears in the gate entry's `seen_musts`, comparing `String(x).trim()`;
   it then stores `musts` as `last_musts` and adds them to `seen_musts`. A
   refused call increments neither.
   `describe` reads `<n> rounds repeated an earlier Must`. The existing
   audit-cap tests drive rounds with no plan Musts, so they gain one helper
   that records `audit-fail` between calls; a plan that never records one
   spends nothing → verify: with new Musts on two rounds the returned
   `audit_spent` is 0 and `audit_rounds` is 2; a third call whose Musts repeat
   returns `audit_spent` 1; the rewritten cap tests pass.
2. Feed it the plan's Musts: `work.mjs` passes the current `audit.must` of the
   slice's latest work id into `countAudit`, and passes nothing when there is
   no gate entry, no work id or no plan → verify: a plan at `audit-fail` with
   one Must classifies the next `run audit` call, a slice with no plan spends
   nothing, and the tracks dispatch test, whose slice records Musts, still
   refuses at the cap.
3. Name the unreviewed fix: the refusal's `detail` and the auto-park's `reason`
   end `; last fix unreviewed`, while `gate`'s and `auditRoom`'s detail keep
   their counter line; `resumeSlice` clears `audit_spent` and `last_musts` →
   verify: a refused slice's park reason carries the phrase; a resume allows
   one round and a repeat after it spends 1.
4. Reword the code's notes: `stops.mjs`, `STATE.md`, `STOPS.md` and finish-it's
   step (d), which still says `run audit` counts every round started, describe
   the counter and what a resume does → verify: the test comparing `STOPS.md`
   to `STOPS` keys passes, and no file still says every round is counted.

## Done when

- A slice goes two rounds each finding a new Must, is allowed the round after
  its last fix, and is not parked.
- A slice failing on the same Must repeatedly spends one per repeat and is
  parked at the cap.
- `npm test` passes, and the existing audit-cap tests that read the refusal
  text name the new counter.

## Starting points

skills/do-it/scripts/gate.mjs (`auditLimits`, `countAudit`, `auditRoom`, `gate`)
skills/do-it/scripts/run.mjs (`resumeSlice`, `clearRefusals`)
skills/do-it/scripts/work.mjs (`run audit` dispatch)
tests/run-gate.test.mjs (the audit-cap tests)
tests/tracks-record.test.mjs (the per-track round counts)
