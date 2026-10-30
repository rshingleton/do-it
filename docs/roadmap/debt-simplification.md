---
title: Debt and simplification
approved: 2026-10-27
---

# Debt and simplification

## Destination
The audit leftovers T89 to T130 that remain after backlog-hardening are
cleared as removals and tightenings, with no new feature (T64). Each rule,
helper and parser state has one copy, and each check names what failed.

- G1: `npm run check` compares every spawn cap shape and the routing eval's missing-entry failure, each with a failing-fixture test.
- G2: Tests share one env helper and one set of fakes, name the failing layer, and leave no temp dirs behind.
- G3: Hook and script code carries one copy of each helper and one state shape per parser.
- G4: Skills and docs state each rule once, and the pin tests survive a rewrap.
- G5: The OpenCode usage path is bounded, stops with its plugin, and fails safe.
- G6: What an unmet-Verify slice means for its dependents is decided and tested.

## Milestones

Slices share files (`tests/env.mjs`, `scripts/check.mjs`, `hooks/lib/checks.mjs`,
`skills/ship-it/`), and concurrent uncommitted work items invalidate each
other's audit (T49), so build one slice at a time, in id order within a
milestone.

### M1: Tests share one set of helpers
Exit: `npm test` passes and no suite builds its own env object, fake fetch or temp-dir cleanup.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R1 | enabler | One home-setup helper in `tests/env.mjs`, `cleanEnv` strips `DO_IT_*` at call time, and `scripts-regressions` uses it (T100, T101, T102) | G2 | none | `npm test` passes; no `{ ...process.env, HOME` remains in `tests/`; a test sets a `DO_IT_*` var in-process and its child does not see it | low | shipped 2026-10-27, Verify unmet: one deliberate hostile-env literal stays in `tests/env.test.mjs` |
| R2 | enabler | One exported fake fetch and gh runner, one temp-dir cleanup helper, and `config-precedence` split by layer (T104, T105, T111) | G2 | R1 (same helper file) | One fake-fetch definition under `tests/`; a run leaves no new `mkdtemp` dirs in tmp; a broken layer fails a test that names it | low | shipped 2026-10-27 |

### M2: The check rules are complete
Exit: `npm run check` and the routing eval each exit 1 on a fixture for every rule they claim.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R3 | build | The spawn-cap rule compares an "N in all" cap, reads every `>` paragraph of a brief, and computes `owner` once (T91, T92, T93) | G1 | none | Fixture skills with an "in all" cap and a cap in a second paragraph make `npm run check` exit 1 | low | shipped 2026-10-27 |
| R4 | build | A test runs `scripts/eval-routing.mjs` on a model-invoked skill with no routing entry and sees exit 1, plus a unit case for the failure (T94, T95) | G1 | R3 (same test file) | The new tests pass and fail when the missing-entry check is removed | low | shipped 2026-10-27 routing-missing-entry |

### M3: Hook and script code carries one copy
Exit: `unifiedFiles` holds one state object, and the script gaps the audit named are closed or shown already fixed.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R5 | build | `unifiedFiles` folds `also` and `embeddedDelete` into one state object, computes `oldPath` once, and scans the in-hunk pair's own `+++ /dev/null` line under the old path (T123, T124, T125, T126) | G3 | none | The R2 and R25 guard tests pass unchanged; a test scans the pair's own line under `<old>`; `unifiedFiles` is shorter | high | shipped 2026-10-28 unified-files-state |
| R6 | build | `work.mjs show`, `event` and `close` run the id check `new` does, `isMain` lives in one place, and a test pins `hooks.json` event names to `claude.mjs` (T89). Reproduce each first: drop any already fixed | G3 | none | A bad id is refused by each of the three commands in a test; one `isMain` definition; a renamed event in `hooks.json` fails a test | med | shipped 2026-10-28 |

### M4: Docs and skills state each rule once
Exit: `npm run check` reports 0 warnings, and a rewrap of ship-it or prove-it breaks no pin test.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R7 | build | ship-it DOCS "Surfaced defects" shares one paragraph with "Audit findings", do-it sections 3 and 4 link roadmap-it section 6 for the blocking ask, deepen-it links design-it for the deletion test, and the unasked DOCS.md context sentence is dropped (T97, T98, T106, T108, T121) | G4 | none | `npm run check` reports 0 warnings; ship-it is under 100 lines; a grep finds the deletion test and the blocking ask stated once each | low | shipped 2026-10-27 |
| R8 | build | The R22 and R24 pin tests check positions and counts, not phrasing regexes (T96) | G4 | R7 (it rewrites the text they pin) | A fixture rewrap of ship-it section 2 leaves the pin tests green; deleting the offer turns one red | low | shipped 2026-10-28 |
| R9 | build | `DESIGN.md` section 4 gains its phase-file list link and karpathy credit if missing, section 8 labels the 1,250-token figure an estimate or replaces it with a measured count, and the section 8 usage paragraph is rewrapped (T109, T112, T120) | G4 | none | The README credits the idea; section 8 carries no unlabelled bytes-over-4 figure; `npm run check` passes | low | shipped 2026-10-27 |

### M5: The OpenCode usage path fails safe
Exit: a long OpenCode session keeps bounded memory, a disposed plugin stops its event loop, and no late message leaves a stale row.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R10 | build | `opencode.mjs` evicts finished runs, keeps a run's `day` when a late message has an earlier stamp, sets `prunedDay` only after `prune` succeeds, renames `hooked`, and drops or cites the `ev.data` shape (T116, T118, T119, T128, T129) | G5 | none | A 1,000-session stream leaves a bounded `runs` map; a late early-stamped message leaves one row per id; a throwing prune is retried on the next step | med | shipped 2026-10-27 |
| R11 | build | The v2 `ctx.event.subscribe` loop gets an abort signal that the plugin aborts on dispose (T117) | G5 | none | A fake ctx test shows dispose aborts the signal and the loop ends | low | shipped 2026-10-28 |

### M6: Unmet Verify means something
Exit: `work.mjs roadmap` reports the unmet clause beside a dependent of a `shipped, Verify unmet` slice and does not block it, with one shared done predicate.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R12 | build | `roadmap.mjs` lists the unmet Verify clause beside a dependent of an unmet-Verify slice without blocking it, and `blocking` reuses the `done` predicate (T99, T122) | G6 | none | A test with an unmet-Verify slice and a dependent shows the dependent ready with the unmet clause listed; one shipped-or-dropped predicate remains | low | shipped 2026-10-27 |

## Open decisions
None.

## Fog
- Scoping each work item's fingerprint and audit diff to its own paths (T49): may become a slice once concurrent items are routine.
- Trimming passing-test output and guarding whole-file rewrites (T81, T82): unproven; R27's A/B found no token evidence to act on.
- Usage windows that straddle a reset (T76): label them run-based or split by message time.
- A tracker doctor and an install doctor (T3, T78): may become one `/setup-it` check slice.
- Running `/setup-it` on another repo (T2) and confirming the OpenCode v2 `session.step.ended` field names on a live OpenCode 2 (T115): user-run checks; a mismatch becomes a slice.
- The inline-or-link question for the deletion test in the prove-it Architecture brief and sweep-it LENSES (T107): judgement, settle when an agent is seen to skip the link.
- Whether the public `createOpenCodeUsage` signature should hide its test seams (T130): judgement.
- A `work.mjs` per-step usage field (closed per-step usage issue, state field only): deferred until the ledger's window attribution proves too coarse.

## Out of scope
- New features and the research-derived ideas T13 to T32, T44, T45, T47, T62: still parked until an audit or retro cites one.
- Snapshotting the usage ledger rows behind the retired terse-voice ledger verdict (T110): R27's A/B superseded it.
- Moving the env import into the `npm test` script (T103): couples the helper to the test command for no gain.

## Decisions so far
- 2026-10-27 Decision: the next destination is removals and tightenings of the audit leftovers, no features (T64).
- 2026-10-27 Decision: D1 settled: a dependent of a slice shipped with Verify unmet does not wait; `roadmap` lists the unmet clause beside it. R12 is unblocked.
- 2026-10-27 Decision: T110 and T103 dropped; T107, T130 and T115 sit in Fog.

## Changes
- 2026-10-27: charted from T89 to T130 after backlog-hardening shipped.
- 2026-10-27: R1 shipped as T100 (one home helper, `cleanEnv` strips at call time; T100, T101, T102 closed). Verify unmet: `tests/env.test.mjs` keeps one `{ ...process.env, HOME` on purpose, to feed a hostile environment to its probe.
- 2026-10-27: R3 shipped as T91 (spawn-cap check reads "N in all" caps and every `>` paragraph, owner computed once; T91 to T93 closed).
- 2026-10-27: R7 shipped as T97 (ship-it DOCS, do-it and deepen-it point at one home for each repeated rule; T97, T98, T106, T108, T121 closed). "Surfaced defects" now references the "Audit findings" wording instead of merging into one paragraph, because the R22 pin test slices on both headings; R8 can revisit.
- 2026-10-27: R9 shipped as T109 (DESIGN.md section 8 labels the 1,250-token figure an estimate and the usage paragraph is rewrapped; T109 was already fixed; T109, T112, T120 closed).
- 2026-10-27: R10 shipped as T116 (OpenCode usage `runs` map capped at 256 with LRU eviction, a run's `day` fixed at its first write, `prunedDay` set after a successful prune, `hooked` renamed, `ev.data` dropped; T116, T118, T119, T128, T129 closed). Eviction is a recorded shortcut: an evicted session that speaks again restarts its totals.
- 2026-10-27: R12 shipped as T99 (`roadmap.mjs` gives each slice an `unmet` list and `blocking` reuses `done`; T99, T122 closed).
- 2026-10-27: R4 shipped as routing-missing-entry (a dedicated `evaluate()` case and an `eval-routing.mjs` CLI test for a skill with no routing entry; T94, T95 closed; T131, T132 logged).
- 2026-10-28: R5 shipped as unified-files-state (`unifiedFiles` keeps one `embed` state object, computes the old path once, folds the `''` scan into `addLine` and scans an in-hunk dev-null pair's own line under the old path; T123 to T126 closed; T133, T134 logged).
- 2026-10-27: R2 shipped as T100 (shared `tests/fakes.mjs`, self-cleaning `tmpDir`, `config-precedence` split by layer; T104, T105, T111 closed).
- 2026-10-28: R8 shipped as T96 (the R22 and R24 pin tests flatten whitespace before matching, so a rewrap of ship-it section 2 keeps them green and deleting the offer turns one red; T96 closed).
- 2026-10-28: R11 shipped as R11 (`setup` returns a cleanup that aborts the `ctx.event.subscribe` signal; T117 closed). Run on OpenCode 2.1.2 through a probe plugin wrapping the real one: the host called the cleanup on plugin reload and the signal aborted, so no Verify is left unmet.
