# Audit: run-caps-count-work (round 1)

Change: `208c5e4`..working tree, 50 files. Date: 2026-11-17.

| Check | Result |
|-------|--------|
| Mechanical | not run in round 1: a Must stands (see Order in ROUNDS.md) |
| Spec | NOTES: 1 Should, requirement coverage holds |
| Standards | NOTES: 1 Should, the confirmed Must re-raised from another angle |
| Compliance | PASS: scanner clean over 11 built-in rules; no rules directory or security policy in this repo |
| Architecture | NOTES: 1 Must rejected on validation, 3 Should |

## Findings

1. Must | `skills/do-it/scripts/runs.mjs:241,264` (also `:280,289`) | `last_seen` is written from a clock taken before the check slot, so the queue wait sits outside the span and is subtracted again as `waited_ms` | phase-1.md:61-62 requires the stamp after the check returns "so its queue wait is not both charged and subtracted". Validator probe: 58 min span, 15 min queue, 43 min work; `gate` reads 25 and allows at cap 30. Fix: read `opts.at ?? new Date().toISOString()` inside the slot callback, after the check returns, in both `runVerify` and `runVerifyMerged`.
2. Should | `skills/do-it/scripts/run.mjs:160` | A record with only `started` and a later `last_seen` closes charging `started` to `last_seen`, banking its old wall clock, though phase-1.md:22-25 says a pre-span record gates as today until its next start, park or resume | started 20 h back, then `run verify`, then park: `active_ms` 20 h and `ready` leaves it; `gate` returns `SLICE_CAP 1200 min, cap 30`. Fix: when there is no `active_since`, drop the `started` fallback instead of closing from it.
3. Should | `skills/do-it/scripts/run.mjs:272` | Only `parked` closes the span, so a shipped slice keeps a clock running and its cap can fire on wall clock | `run start` 2 h back, `run slice R1 shipped`, `gate` 3 h later returns `SLICE_CAP 120 min, cap 30`. Fix: close on `shipped` too.
4. Should | `skills/do-it/scripts/gate.mjs:167` | `audit_spent` is `spent(mine)` whichever limit fired, so `run audit --final` reports `final_audit_rounds` under the name the README gives the per-slice cap counter | two clean `--final` calls return `audit_rounds 2, audit_spent 2` with no repeat. Fix: null `audit_spent` when `final`.
5. Should | `docs/adr/` | No ADR for the run record's span fields (`active_ms`, `active_since`, `last_seen`) and for `audit_spent` redefining what `audit_cap` counts, which AGENTS.md:63 asks for | `git ls-files --others` has none; ADR 0014 is the precedent for a gate-semantics decision. `ship-it` writes it.
6. Nice | `tests/run-gate.test.mjs:51` | `auditFailed` is added twice, same body, differing only in where the id comes from | twin at `tests/tracks-record.test.mjs:64`; one helper in `tests/fakes.mjs` serves both.
7. Nice | `tests/run-gate.test.mjs:171` | `fresh(dir, flags)` reads as a boolean or a record but returns `Date.now()` | `const now = fresh(dir, ['--slice-cap-min', '30'])`; `resetRun` or `newRunAt` says what it does.

## Not confirmed

- The audit cap's auto-park banks the whole gap since the span opened. Rejected by validation: the mechanic is real (`last_seen = at` before `closeSpan` makes the clamp inert; probe gives 2885 min), but the plan records the rule, spans close at "the last command that showed the slice alive" and a commandless gap counts (README `## Decisions`, `tests/run-gate.test.mjs:264`). Overrule by saying so.
- A park with no command since the start banks 0 (`run.mjs:172`), so start, park in the evening, resume, charges nothing. The same recorded rule closes a span at `last_seen`, and phase-1 Step 2 says a closed span ends at the last evidence of work. Overrule by saying so.

## Guardrail candidates

- None: the two Must-level defects are logic, not patterns a rule can catch.

## Spec

Find (a) requirements missing, (b) behaviour added unasked, (c) requirements that look done but behave wrongly: one Should, the same `runs.mjs:241` clock, graded against phase-1.md:61-62; plus a second Should on the pre-span record (`run.mjs:160`) against phase-1.md:22-25. Goal, Interfaces, both issues' acceptance and the null-cap path hold.

## Standards

One Should on `runs.mjs:241` (the same defect, graded as a Should here because the reviewer read it as a numeric undercount rather than the seam it breaks). One Should on the missing ADR. Two Nice: the duplicated `auditFailed` helper and the `fresh()` name. Documented rules otherwise hold; the test consolidation's removed assertions were checked against their surviving twins.

## Architecture

One Must proposed at `gate.mjs:131-145` (auto-park banking), rejected on validation as a recorded decision. Three Should: the `runs.mjs` clock (same as finding 1), a shipped slice never closing its span, and `audit_spent` under `--final`. Deletion test passes for `closeSpan`, `recordSeen` and `planMusts`; no new layer or module.

Verdict: PASS, round 4. Round 1 failed on the queue-wait clock, round 2 on the one-round repeat test, round 3 on the doc wording; all three fixed, each with a test or a wording pass. Three findings were rejected as recorded decisions. The remaining Should and Nice items are logged at ship.
Not checked: Windows-only paths in the touched tests.

### Settled

#### Round 1
1. Must | `runs.mjs:241,264` and `:280,289` | `last_seen` is now read after the check returns, so the queue wait is inside the span and `waited_ms` takes it off once. Test: `tests/tracks-check-slot.test.mjs` asserts the span is at least `waited_ms` long.
2. Should | `run.mjs:160` | `closeSpan` drops a pre-span record's `started` fallback instead of banking its wall clock. Test: a 20-hour `started` record, verify then park, banks 0.
3. Should | `run.mjs:272` | `shipped` closes the span as `parked` does. Test: a shipped slice keeps its five worked minutes, not the two days since.
4. Should | `gate.mjs:167` | `audit_spent` is null on `--final`, which has no per-slice counter. Test: the final review reports `null`.
5. Should | `docs/adr/` | left to `ship-it`: AGENTS.md puts the ADR in the closing docs, not in a build fix.

#### Round 2
6. Should | `gate.mjs:200`, `run.mjs:158` | A close that banks no span dropped the queue credit with it, so `waited_ms` cannot outlive the span it was recorded with and a resumed slice is never charged less than it worked. `clampWaited` runs on both close paths. Test: a park stamped before the span opened leaves no `waited_ms`.
7. Should | `run.mjs:190` | `openSpan` names the close-then-open pair that `startSlice` and `resumeSlice` each spelled out; one copy of the three-line policy.
8. Nice | `tests/tracks-check-slot.test.mjs:132` | renamed to "the gate counts the open span less the wait", and its fixture now carries `active_since` instead of the `started` fallback, so it tests the span arithmetic it names.
9. Must | `runs.mjs:247,264,289` | a failing `run verify` (and `--merged`) now stamps `last_seen` before the throw, so the next start banks the minutes before the failure instead of closing at the previous stamp. Test: a 45-minute span with a failed verify 40 minutes in banks 40 minutes.
10. Must | `gate.mjs:156,158` | the repeat test now reads `seen_musts`, every Must raised so far, so A, B, A spends where A, A does; `last_musts` stays the previous round's list for a record written before it, and `resumeSlice` clears both. Test: A, B, A, B spends 0, 0, 1, 2.
11. Nice | `gate.mjs:27` | `started` is set after `openSpan`, so a first start keeps its time instead of the open deleting it in the same write.

#### Round 3
12. Must | `skills/finish-it/SKILL.md:64`, `skills/finish-it/STOPS.md`, the audit-cap issue | the loop text and the issue still said a repeat meant the round before's Must, while the code now spends on a Must any earlier round raised. Wording follows the code in all three, and `phase-2.md` Step 1 names `seen_musts`.
13. Should | `runs.mjs:151` | the dispatch comment said "counts every round"; the dispatch reads `audit_spent`, so it now says "decides every round".

### Touched

#### Round 1
skills/do-it/scripts/runs.mjs
skills/do-it/scripts/run.mjs
skills/do-it/scripts/gate.mjs
tests/run-gate.test.mjs
tests/tracks-check-slot.test.mjs

#### Round 2
skills/do-it/scripts/run.mjs
skills/do-it/scripts/gate.mjs
tests/tracks-check-slot.test.mjs

#### Round 3
skills/do-it/scripts/runs.mjs
skills/do-it/scripts/gate.mjs
skills/do-it/scripts/run.mjs
skills/do-it/STATE.md
tests/run-gate.test.mjs
skills/finish-it/SKILL.md
skills/finish-it/STOPS.md
docs/issues/the-per-slice-audit-cap-parks-a-slice-whose-rounds-each-foun.md
