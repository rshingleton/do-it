---
title: Should backlog 2026-10
approved: 2026-10-31
---

# Should backlog 2026-10

## Destination
The 17 `should` items on `docs/TODO.md` are cleared, so the run lane's gates,
records and digest behave on the states the audits named, and the skill text,
`STATE.md` and the tests say what the code does. No new feature.

- G1: The run gates and records behave in the states the walkthroughs and audits named: a settled sweep decision is never left open, closing docs do not make a verified slice stale, a verify on the wrong item state says so, a stop outlives no resume, and equal-text assumptions are told apart (T205, T206, T207, T184, T196).
- G2: The commit and verify path records only the slice's own paths and survives the edge-case names, modes, repeated paths and retries the audits listed (T159, T188, T189).
- G3: The run scripts carry one honest copy of each helper and name, and the digest prints no unsanitised text (T194, T195).
- G4: The finish-it loop, `STATE.md`, FINALIZE and roadmap-it text and their tests agree with the code and pin behaviour, not wording (T165, T186, T187, T198, T199).
- G5: A reviewer that errors reads as unverified in every skill that fans out, and usage-it windows state their limits and count runs once (T203, T204, T209).

## Milestones

Slices share files (`skills/do-it/scripts/gate.mjs`, `commit.mjs`, `run.mjs`,
`runs.mjs`, `tests/run-gate.test.mjs`), so build one slice at a time, in id
order within a milestone.

### M1: Run-lane defects
Exit: each defect from the R20 walkthroughs and the audits has a regression test that fails when the fix is removed, and a long `finish-it` run no longer stalls on a settled decision or a docs-only change.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R1 | build | The sweep moves a `weak-but-explicit` decision to Decisions so far with a dated line and its stop-if-wrong note, and `run next` lists `ask-when-reached` slices under `defects` (T205) | G1 | none | A fixture roadmap with a swept decision offers the slice it blocked; a slice blocked by an `ask-when-reached` decision appears in `run next` `defects` | high | shipped 2026-10-31 sb-r1-sweep-decisions |
| R2 | build | The change fingerprint leaves out the roadmap file, `docs/TODO.md` and ADRs, so ship-it's closing docs do not make `run gate` say STALE_VERIFY (T206) | G1 | none | A fixture edits the roadmap Status row and the to-do list after `run verify`; `run gate` still allows; an edit to code after verify still gives STALE_VERIFY | high | shipped 2026-10-31 sb-r2-fingerprint-docs |
| R3 | build | `run verify` on an item past `building` says the item must be `building` and that a replan reopens it, checked in `items.verifyPhase` before the check runs (T207) | G1 | none | `run verify` on a `shipping` item fails with that sentence and runs no check | low | |
| R4 | build | `verified_files` records only the slice's mapped paths, not every dirty file, and the commit check ignores unrelated dirty files (T159) | G2 | R2 (same fingerprint code) | A user's unrelated dirty file and another slice's file are absent from RUN.md and do not block the commit | high | shipped 2026-10-31 sb-r4-verified-paths |
| R5 | build | `verified_files` leftovers: `ls-files -z` split on NUL, mode recorded as 755 or 644, a dirty submodule not stamped as unchanged, `dirtyHashes` naming the missing record, `\r` names in `--stdin-paths`, and a 1 MB test with fewer, longer names (T188) | G2 | R4 (same files) | A newline name commits; `chmod g+w` reads clean; an edit inside a dirty submodule is seen; the 1 MB test runs in under 2 s | med | |
| R6 | build | `commitSlice` retry leftovers: the expected path set is deduped, a lane M phase retry with a different clean path set reads `already committed`, the lane M slice-mode retry is moved ahead of the verify compare or documented as unsupported, lane S has an outside-root check, and the submodule test pins one outcome (T189) | G2 | R5 (same function) | `--paths x.js,x.js` and `./x.js` retry; a symlinked root is refused in lane S | med | |
| R7 | build | Audit-cap leftovers: `audit_stop` cleared in `run slice <id> ready` when it names that slice, the record-level `audit_refused` and `final_audit_refused` clearing tests, a pre-change record with no `final_audit_cap`, and `gate()` no longer writing through `entry()` (T184) | G1 | R6 (same gate and run code) | Hit the run total, raise `audit_total_cap` and lower it again, `gate` allows; a resume clears the stop; a record without `final_audit_cap` gates | med | |
| R8 | build | Assumption bookkeeping: reject by `feat#N` id first, text only when unique, an ambiguous text refused with the ids, a re-add no longer renumbering `rejected`, the `sweep` id collision closed, the followup for a `done` or `closed` plan telling the user to file a new fix item, and the D1 to D3 lines pointing at their plan (T196) | G1 | R7 (same files) | Plan `[same]` with record `feat#1: same` and `feat#2: same`: rejecting `feat#1` leaves `feat#2` and a correct fix text; an ambiguous text names both ids | high | |

### M2: One copy, and text that matches the code
Exit: `npm test && npm run check` pass, no helper has a second name, and the text tests pin structure.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R9 | build | finish-it loop text leftovers and `closesEarly` fixed: the placeholder and `--phase` rules, prove-it round counting against `run audit`, the loop test scanning only the numbered items and the missed "ends the turn" phrases, and the `item()` format comment (T165, T186) | G4 | R8 (same test file) | A fixture §2 that says "ends the turn" before §4 fails the call-site test; `rg '<id>' skills/finish-it` finds only the settled placeholder | med | |
| R10 | build | `STATE.md` run-row leftovers: `retries` moved into the `slice ... ready` text, the `audit_refused` clearing rule complete, the `run audit` header naming null `limit` and `detail` on allow, and "a closed item has no plan" extended to `building` (T187) | G4 | R9 (same docs and test) | Every `run` sub in `work.mjs` usage appears in `STATE.md`; the header names the null fields | low | |
| R11 | enabler | `run.mjs` and `ids.mjs` leftovers: unused exports removed, one `git` name imported unaliased, text helpers named by what they return, `createRun` going through `updateRun` or the header saying otherwise, and `git()` throwing handled or noted at its callers (T194) | G3 | R6, R7, R8 (they edit these files) | `rg` finds no unused export in `run.mjs`; `commit.mjs` has one git name; `npm test` passes | med | |
| R12 | build | Digest leftovers: `oneLine` applied in `bullets()` and the retro mapper, the shipped slice with a `--reason` pinned, the resumed-slice test asserting the first tag, and `DIGEST.md` stating what it prints (T195) | G3 | R11 (digest imports) | A newline in a limit, an assumption or a finding cannot render a heading | med | |
| R13 | build | Roadmap lifecycle text: FINALIZE Paths and offer e, roadmap-it §7 and FORMAT.md using one word and the keep-`completed:` rule, `STATE.md` line 25 documenting `reopened`, `reopened` widened to `completed && !finished`, and the unwrapped SKILL.md lines wrapped (T198, T199) | G4 | R10 (same STATE.md) | A finalized fixture with a decision opened later reports `reopened`; the Paths text names `docs/issues/*.md` | med | |

### M3: Unverified reviewers and usage windows
Exit: no fan-out skill reads an errored agent as clean, and the usage-it window limits are stated and tested.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R14 | build | doubt-it, look-it-up, guard-it and debug-it say what an errored agent means; a bare "No findings." reads as unverified; prove-it fires `block "<axis> unverified: <why>"`, keeps `audit-pass` and `audit-fail` un-fired and says the one retry is the same round (T203, T204) | G5 | R13 (same test file) | The prove-it test pins `/event <id> block/`; doubt-it no longer reads "None found: proceed" for an errored skeptic | med | |
| R15 | build | usage-it window leftovers: runs counted once across adjacent windows, the 7.5-minute edge and the start-day grouping stated, the fallback label limited to records with no timestamps, `--json` carrying the whole-run count, and the short-window limit recorded under a `// shortcut:` marker (T209) | G5 | none | Two adjacent windows over one run report one run; a record with timestamps never gets the "before time buckets" label | med | |

## Open decisions
- none

## Fog
- T149 and T150 (plain double verify failure parking; dirty-tree refusal at `run new`) are decisions, not fixes: they may become one slice after an owner call.
- The `nice-to-have` items on `docs/TODO.md` (T164, T167, T185, T190 to T193, T197, T200 to T202, T208, T210 to T213) may become one text-and-test sweep slice.

## Out of scope
- The `idea` and `question` items stay on `docs/TODO.md`.
- T214, T62, T78, T2 and any new skill.

## Decisions so far
- 2026-10-31 Decision: scope is the 17 `should` items; `nice-to-have` items, T149 and T150 stay on the to-do list.
- 2026-10-31 Decision: the change fingerprint leaves out the roadmap file, `docs/TODO.md` and ADRs (T206); a hand edit to them after audit goes unseen.
- 2026-10-31 Decision: assumptions are rejected by `feat#N` id first, by text only when unique (T196, the D3 revisit).
- 2026-10-31 Decision: `verified_files` records only the slice's mapped paths (T159).
- 2026-10-31 Decision: a swept decision moves to Decisions so far, and `ask-when-reached` slices show in `run next` `defects` (T205).
- 2026-10-31 Decision: `audit_stop` is cleared when `run slice <id> ready` names that slice (T184).
- 2026-10-31 Decision: one slice at a time in id order, no tracker publish.
