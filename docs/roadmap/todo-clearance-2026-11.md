---
title: To-do clearance 2026-11
approved: 2026-11-16
---

# To-do clearance 2026-11

## Destination
The repo has no open backlog. Every line on `docs/TODO.md` and every ticket in
`docs/issues/` is shipped, dropped with a dated reason, or moved to an ADR or a
durable doc, and a finished roadmap leaves no file behind. The pipeline checks
what the 2026-11 audits said it should: a plan's claims are verified before
approval, softened scope is refused, each audit finding has a stable id, the
builder stops on an unverified install, and a roadmap is removed once its
content is durable.

- G1: Every defect and audit leftover that names a file and line is fixed;
  a code fix has a test that fails on the old code, and a doc-only line has a
  grep or `npm run check` clause that fails while the old line stands.
- G2: Every one of the 36 items promoted out of `backlog-cleanup-2026-11` is
  shipped here or dropped with a dated reason, and `docs/reference/roadmap-history.md`
  records that roadmap as superseded.
- G3: Each named test pins behaviour, not wording: rewording a pinned sentence
  leaves `npm test` green and deleting the behaviour turns it red, with one
  fixture helper per class.
- G4: A finished roadmap leaves no file in `docs/roadmap/`; its decisions
  become ADRs where they pass name-it's test, its Fog is filed, and
  roadmap-history lists it, all before the commit.
- G5: `scope-it` refuses a plan whose paths or symbols are missing, whose
  verify command cannot run or cannot fail, whose scope is softened, or whose
  under-specified criterion is untagged; each new file names its closest
  analog; a clarify pass and per-phase interfaces exist.
- G6: Each audit finding carries a stable id and one disposition table, so a
  later round can check every finding, and prove-it runs the lenses and the
  round-3 fix pass the diff calls for.
- G7: The builder stops on an auth error, after five read-only calls with no
  write, and on a failed package install; worktree git prohibitions are stated
  and parallel phases run whenever the tree allows.
- G8: Stubs, skipped tests, unrun verifies and hollow or orphaned artifacts
  are reported at prove or ship, each filed through log-it or waived with a
  recorded reason.
- G9: A plan touching auth, data, secrets, CI or payments lists trust
  boundaries and threats, and an auditor reports each secured, open or
  escalate.
- G10: A `git commit` through the PowerShell tool is scanned like Bash or the
  gap is documented; `checks.json` covers dangerous Bash; a Stop hook warns on
  code with no test; `if:` filtering keeps the commit scan cheap.
- G11: `sweep-it` checks that paths, commands, names, endpoints and
  dependencies named in docs exist, and a provenance check flags skill text
  copied from a known repo.
- G12: The doctor, the install docs and the code agree: one path helper, one
  route per host, no README claim the doctor contradicts, and the OpenCode
  form is never guessed silently.
- G13: Every `idea` and `question` item ships, is spiked with an answer
  recorded, or is dropped with a dated reason; none is re-parked undated.
- G14: At close every item this roadmap named is resolved: no `- [ ]` line
  it named and no issue it named is still open, with `Next id` free; a finding
  filed during the run stays open and names the slice that filed it.
- G15: A complete run asks for three tracks by default, never one; an ask
  below three is raised, and only a commit mode that writes no branch holds
  one track and says why.

## Milestones

### M1: Roadmaps and runs close their own loops
Exit: a roadmap in a sibling checkout is refused, a finalized roadmap leaves
no file and its content is durable, and a slice whose last allowed audit round
passed ships.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R1 | build | `countAudit` stops parking a slice whose last allowed audit round passed; a failed last round still parks Items: issue: countaudit-parks-a-slice-whose-last-allowed-audit-round-pass | G1 | skills/do-it/scripts/gate.mjs, tests/tracks-record.test.mjs | none | A passing last round then a refused extra round leaves the slice shippable; a failing last round parks it; the new test fails on the old code | med | shipped 2026-11-16 r1-countaudit |
| R2 | build | `finish-it` resolves the roadmap inside the working tree's repo root before `run new`, naming path and root, and the run records and prints that root Items: issue: finish-it-must-run-a-roadmap-in-the-repo-that-holds-it | G1 | skills/finish-it/SKILL.md, skills/do-it/scripts/work.mjs, tests/finish-run.test.mjs | none | A roadmap in a sibling checkout is refused with both paths named; `run show` prints the repo root; moving the session on its own fails a test | high | shipped 2026-11-16 r2-finish-repo-root |
| R3 | build | Finalizing a finished roadmap moves its durable content (ADRs for decisions that pass name-it, Fog through log-it) and then removes the file, updating roadmap-history in the same turn; an in-flight roadmap is left in place and reported Items: issue: finished-roadmaps-are-removed-at-finalize-with-their-durable | G4 | skills/ship-it/FINALIZE.md, skills/do-it/scripts/work.mjs, docs/reference/roadmap-history.md, tests/work.test.mjs | none | A finalized fixture leaves no file under docs/roadmap; a roadmap with an unshipped slice is left and named; its Fog is filed; deleting the removal step fails a test | high | shipped 2026-11-16 r3-finalize-removal |
| R4 | build | Record `backlog-cleanup-2026-11` as superseded (R1 shipped, R2 to R16 carried here) and check all 36 promoted ids resolve to this roadmap, a shipped id or a drop Items: backlog-cleanup R1 shipped (T208, T211, T216, T223, T238); 31 unshipped ids carried here | G2 | docs/reference/roadmap-history.md, tests/roadmap-locality.test.mjs | none | roadmap-history names six removed roadmaps; a script finds each of the 36 ids here or recorded as shipped or dropped | low | shipped 2026-11-16 r4-roadmap-history |

### M2: Text that tells the truth
Exit: `npm run check` fails an 81-column skill line, every `skills/*/SKILL.md`
is 100 lines or fewer, and each doc line an audit cited states what the code
does.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R5 | build | Finish-it, ship-it, prove-it, debug-it and name-it text: FINALIZE Paths names what it writes, the long lines wrap, finish-it says which notice is final and reports defects at close, prove-it's Route names `unblock`, debug-it names the log-it call, name-it says plan ADRs are rewritten accepted, RESUME stops repeating "always asks" Items: T197, T200, T201 | G1 | skills/ship-it/FINALIZE.md, skills/ship-it/RESUME.md, skills/finish-it/SKILL.md, skills/prove-it/SKILL.md, skills/debug-it/SKILL.md, skills/name-it/SKILL.md, skills/do-it/SKILL.md | none | `npm run check` passes and a grep for each cited phrase finds none | low | shipped 2026-11-16 r5-skill-text |
| R6 | build | Every `skills/*/SKILL.md` under 100 lines: usage-it 107, finish-it 116, ship-it 104, roadmap-it 103, build-it 101, do-it 103, with the roadmap-locality line pin updated off 103 Items: T215, T247, T262 | G1 | skills/usage-it/SKILL.md, skills/finish-it/SKILL.md, skills/ship-it/SKILL.md, skills/roadmap-it/SKILL.md, skills/build-it/SKILL.md, skills/do-it/SKILL.md, tests/roadmap-locality.test.mjs | none | A line count of every `skills/*/SKILL.md` reads 100 or fewer and `npm test` passes | low | shipped 2026-11-16 r6-line-budget |
| R7 | build | The plan-body `## Link` section link-it keeps its contract under is written into the plan format STATE.md names, and link-it points at it Items: T235 | G1 | skills/scope-it/PLAN-FORMAT.md, skills/link-it/SKILL.md | none | PLAN-FORMAT names `## Link` with its rule; a plan fixture holding `## Link` still holds it after a replan | low | shipped 2026-11-16 r7-plan-link |
| R8 | build | Plan text: PLAN-FORMAT's `## Files` union line stops contradicting `## Interfaces`, phase files are told to state `## Files`, CHECKS and GRILL stop saying "no block edge" where phases.mjs counts a path, roadmap-it says why the hint is not the contract Items: T266, T268, T269, T272 | G1 | skills/scope-it/PLAN-FORMAT.md, skills/scope-it/CHECKS.md, skills/scope-it/GRILL.md, skills/roadmap-it/SKILL.md | none | Each cited sentence states the rule the code follows and `npm run check` passes | low | shipped 2026-11-16 r8-plan-text |
| R9 | build | Install docs one truth: DESIGN's scripts tree names doctor.mjs and version-gate.mjs; install-routes drops the quoted home path and branch, names the sixth CLI host, states one route per host once, fixes the symlink-command line, and moves the macOS probe out of the Windows section Items: T281, T282, T289, T290, T291, T292, T293 | G12 | docs/DESIGN.md, docs/reference/install-routes.md | none | Every path and command the two docs name exists; no quoted home path; one route-per-host statement | low | |
| R10 | build | README install truth: `-a claude-code` sits inside the one-route rule or is dropped, the marketplace and version-bump claims state their scope, the Update facts are stated once, and the shell block uses a bash fence Items: T294, T295, T296, T297 | G12 | README.md | none | `npm run check` passes and each of the four claims matches the installer's behaviour | low | shipped 2026-11-16 r10-readme-truth |

### M3: Tests that pin behaviour
Exit: rewording a pinned sentence leaves `npm test` green, deleting the
behaviour turns a test red, and one fixture helper serves each class.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R11 | build | Test hygiene: the FINALIZE test pins the path reference and counts rules by content, the ship-it, finalize, finish-it and build-it tests pin headings and links not sentences, one file-level read helper replaces six copies, and the 1 MB status test finishes under 2 s Items: T202, T213 | G3 | tests/work.test.mjs, tests/run-gate.test.mjs, tests/run-commit.test.mjs, tests/audit-convergence.test.mjs | none | Rewording a pinned sentence leaves `npm test` green; deleting the Paths line fails it; the 1 MB test runs under 2 s | low | shipped 2026-11-16 r11-test-hygiene |
| R12 | build | Gate and export tests: the STOPS-code test calls `nextSlice`, the flaky fixture quotes its temp path, the audit-stop resume test gains an R1-vs-R10 prefix case, the unused-export check scans tests and hooks, and equal-text rejects tell a plan-side reject from a hand edit Items: T191, T222 | G3 | tests/run-gate.test.mjs, tests/digest.test.mjs, tests/work.test.mjs | none | Renaming MAX_SLICES fails a test; an export used only in tests is not flagged; the two equal-text tests fail for different reasons | low | shipped 2026-11-16 r12-gate-export-tests |
| R13 | build | Gate leftovers: the gate.mjs header names runs.mjs and work.mjs as callers, the structure test finds `commitSlice` at any indent and reads runs.mjs once, a reading `gate` adds no gates entry, `run audit` on an unknown slice spends no round, STOPS says resumed rounds stay in the run total Items: T185, T193 | G3 | skills/do-it/scripts/gate.mjs, skills/finish-it/STOPS.md, tests/run-gate.test.mjs | none | `run audit road R9` leaves no R9 gates entry; removing the read-path find fails a test; the header names both callers | med | shipped 2026-11-16 r13-gate-leftovers |
| R14 | build | Guard and undo tests: the guard subdirectory test splits into four assertions, the `git add` all-untracked branch is pinned, `rejectedCommit` sets core.hooksPath, the unborn-repo undo has a test, and a rethrown error keeps its stack Items: T190, T210 | G3 | tests/run-commit.test.mjs, tests/hooks.test.mjs | none | A developer's global core.hooksPath changes no new test; the unborn undo runs; removing the untracked branch changes an assertion | med | shipped 2026-11-16 r14-hook-undo-tests |
| R15 | build | The roadmap-locality tests name what failed: `fences[2]` is selected by heading, and `match(...)[0]` is asserted before use Items: T265, T271 | G3 | tests/roadmap-locality.test.mjs, tests/phases-contract.test.mjs | none | Renaming a heading fails naming the field, not with a throw; moving a fence does not assert the wrong block | low | shipped 2026-11-16 r15-locality-test-names |
| R16 | build | One fixture helper per class: tests/links.mjs imports `norm` and `sameTarget` from the install code, install-links stops rebuilding checkout, seed and clone, and doctor-routes uses the mini-root `quiet` Items: T274, T280, T284 | G3 | tests/links.mjs, tests/install-links.test.mjs, tests/doctor-routes.test.mjs, tests/mini-root.mjs | none | One `norm` and one `quiet` remain and a POSIX path case agrees across both callers | low | shipped 2026-11-16 r16-fixture-helpers |
| R17 | build | Behaviour evals: pressure scenarios for test-it, prove-it and ship-it's no-commit rule, paraphrased routing variants, and one eval that a grill reply adding scope re-presents its round Items: T23, T236 | G3 | evals/routing.json, tests/grill-acceptance.test.mjs, skills/skill-it/SKILL-MECHANICS.md | none | Each new eval fails when the rule it pins is removed from the skill text and `npm run eval` lists them | med | shipped 2026-11-16 r17-behaviour-evals |

### M4: Scripts, run lane and install behave
Exit: each named edge has a test that fails on the old code, and a Windows
install and uninstall removes both hosts' hooks while `DO_IT_HOME` moves the
root.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R18 | build | `updateRun` takes a lock or a compare-and-write that reports the lost update, so two processes cannot undercount rounds; `run review-change` after a rebase reports the slice's change, not upstream commits Items: T164, T167 | G1 | skills/do-it/scripts/runs.mjs, skills/do-it/scripts/changeset.mjs, tests/changeset.test.mjs | none | Two `run audit` started together spend two rounds; a rebased branch's review-change names no upstream commit | high | |
| R19 | build | Digest and verify record: header fields and usage values pass through `oneLine`, `origin()` parses an `earlier <key>` prefix, and `run verify` without `--paths` does what STATE.md says with a test pinning it Items: T220, T221 | G1 | skills/do-it/scripts/digest.mjs, skills/do-it/scripts/runs.mjs, skills/do-it/STATE.md, tests/digest.test.mjs | none | A newline in `started` cannot open a heading; `earlier feat#1` renders `feat #1`; verify with then without `--paths` matches STATE | med | |
| R20 | build | Commit path: the tag-failure message says how to retry and a test deletes the blocker ref and retags; the outside-root filter refuses `..` and `..\x` but allows `..env`; `dirtyHashes` reads a worktree-side rename; changeset.mjs imports the shared git Items: T192, T217, T218 | G1 | skills/do-it/scripts/commit.mjs, skills/do-it/scripts/changeset.mjs | none | A repo file named `..env` commits; a worktree-side rename records both paths; a failed tag retries green | high | shipped 2026-11-17 r20-commit-path |
| R21 | build | `run tracks` errors: the contract plan path is relativised once, `trackWidth`'s resource term has a producer or is gone, a sixth ready slice appears in `waiting`, `items.get` errors follow one policy, a lane S brief is not called a lane M plan, and `max_slices` reads as a stop, not an empty frontier Items: T251, T252, T253, T254, T256, T261 | G1 | skills/do-it/scripts/runs.mjs, tests/tracks-loop.test.mjs | none | Each of the six cases has a test that fails on the old code; a sixth ready slice is in waiting | med | |
| R22 | build | Run checks and slots: a track's prove-it takes a check slot, the Contract check finds its script from the repo root and is not a lane S row, `runVerifyMerged` has the non-git guard and records waited_ms, `hintBatch` takes ids and the slice map, the hint rule is stated once, and the spawn-a-check block is shared Items: T245, T255, T257, T258, T259, T260, T263, T264 | G1 | skills/do-it/scripts/runs.mjs, skills/do-it/scripts/run.mjs, skills/do-it/scripts/work.mjs, skills/do-it/scripts/check-slot.mjs, skills/do-it/scripts/contract.mjs, skills/scope-it/CHECKS.md | none | A track's prove takes the slot; a non-git verify fails before the suite; the hint rule has one home; `npm test` passes | med | |
| R23 | build | A third failed verify round in a row parks the slice with its own gate stop code; the first two throw as now Items: T149 | G1 | skills/do-it/scripts/stops.mjs, skills/do-it/scripts/runs.mjs, skills/finish-it/STOPS.md, tests/tracks-verify.test.mjs | none | The third consecutive failure parks with the code named in STOPS; the second does not; a test fails on the old code | med | |
| R24 | build | `run new` keeps allowing a dirty tree: the record names its base and that uncommitted changes are part of it, and the docs say why Items: T150 | G1 | skills/do-it/scripts/changeset.mjs, skills/do-it/STATE.md, tests/changeset.test.mjs | none | `run new` on a dirty tree starts and the record names the base; a refusal added later fails a test | med | |
| R25 | build | Usage attribution: OpenCode v2 runs take agent and model from `session.step.started`, `--json` whole counts runs, the "before time buckets" label applies only to timestamp-free records, a message with no time is bucketed or marked partial, and the ledger's `shell: true` is fixed or carries its reason Items: T214, T219, T242 | G1 | skills/usage-it/SKILL.md, .opencode/do-it-plugin/do-it.mjs, .opencode/do-it-plugin/index.js, tests/usage.test.mjs, tests/opencode-usage.test.mjs | none | A v2 fixture with only step.started names its agent and model; a record with runs 2 adds two; a timestamped old record is not labelled | med | shipped 2026-11-17 r25-usage-attribution |
| R26 | build | setup-it default branch: a name with a comma is skipped, a dangling origin/HEAD is checked with `rev-parse --verify`, the SKILL bullet says what is skipped, default-branch.mjs states what it does when git cannot spawn, and the tests move beside it with a `feature/x` default Items: T212 | G1 | skills/setup-it/SKILL.md, skills/setup-it/scripts/default-branch.mjs, tests/default-branch.test.mjs | none | A `feature/x` default is added to `DO_IT_PROTECTED_BRANCHES`; a comma name leaves the value unchanged; a dangling origin/HEAD proposes nothing | med | |
| R27 | build | Install: install.mjs reads and defaults `DO_IT_HOME`, `uninstall()` is its own function, a failed Claude hook removal still runs the OpenCode removal, a failed hook step no longer skips the rest, one plural helper, and a BOM is not reported as comments Items: T237, T239, T244, T283, T285, T286 | G12 | scripts/install.mjs, scripts/install-hooks.mjs, scripts/doctor.mjs, tests/installer.test.mjs | none | `DO_IT_HOME` moves the root; a stubbed Claude failure still removes OpenCode hooks; a BOM file gets its own message | high | |
| R28 | build | Doctor edges: a fresh clone with no FETCH_HEAD is not "never fetched", a stray quote in PATH does not hide `claude`, a commented opencode.json is not a silent pass, the `it-` probe becomes a suffix probe, an empty untracked skill directory is not `ok`, and an absent plugin or CLI route carries its install command Items: T273, T275, T276, T277, T278, T279, T288 | G12 | scripts/doctor.mjs, tests/doctor-links.test.mjs, tests/doctor-routes.test.mjs | none | Each named case has a test that fails on the old code; an absent route prints a fix | low | |
| R29 | build | One path helper and parser: the path.sep-to-slash idiom has one home, check-shell.mjs covers every `shell:` caller, a roadmap `Files: none` cell is no hint, and `parseFileList` accepts the lines its callers hold Items: T240, T241, T243, T267, T270 | G12 | scripts/install.mjs, tests/links.mjs, hooks/lib/shell.mjs, skills/do-it/scripts/check-shell.mjs, skills/do-it/scripts/roadmap.mjs, skills/do-it/scripts/fileset.mjs | none | One `split(path.sep)` helper remains; the shell check fails on a new unlisted spawner; two `Files: none` slices do not collide | low | |
| R30 | build | The change fingerprint and the auditors' diff are scoped to the item's own paths, so fixing one concurrent item no longer invalidates another's audit Items: T49 | G1 | skills/do-it/scripts/changeset.mjs, skills/do-it/scripts/work.mjs, skills/do-it/STATE.md | none | Fixing one of two concurrent items leaves the other's fingerprint unchanged; a test fails on the old code | high | |
| R67 | build | `run new` asks for three tracks by default, an explicit ask below three is raised, and only a commit mode that writes no branch holds one with a note; STATE, TRACKS, CONFIG and the tracks tests say three Items: T298 | G15 | skills/do-it/scripts/run.mjs, skills/do-it/STATE.md, skills/finish-it/TRACKS.md, skills/track-it/CONFIG.md, tests/tracks-loop.test.mjs | none | `run new` with no flags records `tracks: 3`; an ask of 1 records 3; a `--commit none` run records 1 and says why; `npm test` passes | med | |

### M5: A plan checked before approval
Exit: a plan naming a missing file, a vacuous verify command and softened
scope is refused with each finding named, and an under-specified criterion is
reported unverified by prove-it rather than passed.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R31 | build | A script classifies each path and symbol a plan names as verified, missing, ambiguous or uncheckable, excluding files the plan creates, and scope-it shows the result before approval Items: issue: check-that-a-plan-s-paths-and-symbols-exist | G5 | skills/scope-it/scripts/plan-paths.mjs, skills/scope-it/SKILL.md, tests/plan-paths.test.mjs | none | A plan naming a missing path and a missing symbol is refused with both named; a file the plan creates is not missing; a crash blocks nothing | high | |
| R32 | build | Each runnable verify command states its failure output and is probed: the npm script is in package.json and the path exists; failures show before plan approval Items: issue: check-verify-commands-are-real-and-can-fail | G5 | skills/scope-it/CHECKS.md, skills/do-it/scripts/contract.mjs | none | A verify naming an absent npm script is refused before approval; a real one passes; a vacuous command is flagged | med | |
| R33 | build | A scan flags softening language in plan steps, compares each hit with the item it claims to cover, and blocks a shrunken delivery; the same scan runs on the diff in review-it's Spec axis Items: issue: scan-plans-for-softened-scope | G5 | skills/scope-it/CHECKS.md, skills/scope-it/scripts/plan-scope.mjs, skills/review-it/SKILL.md | none | A step saying "v1" or "wired later" for a full acceptance item is refused; the same diff fails the Spec axis | med | |
| R34 | build | scope-it tags a criterion as under-specified at planning time, prove-it reports it "unverified, held-out test needed" without a passing test, untagged criteria grade as today, and an unattended run closes "complete with N unverified checks" Items: issue: abstain-on-criteria-the-spec-cannot-settle | G5 | skills/scope-it/PLAN-FORMAT.md, skills/prove-it/REPORT.md, skills/finish-it/SKILL.md, evals/routing.json | none | A tagged criterion without a test reads unverified; an untagged one grades as before; finish-it's close names the count | med | |
| R35 | build | Each file a plan creates names the closest existing file and the pattern to copy, or says "no analog found", with shared cross-cutting patterns noted Items: issue: name-the-closest-analog-for-each-new-file | G5 | skills/scope-it/PLAN-FORMAT.md, skills/do-it/SCOUT.md | none | A plan creating a file without an analog name is refused by the format check | low | |
| R36 | build | Plans gain per-phase Interfaces (consumes and produces) and plan-level Global constraints, so parallel phases state what crosses between them Items: T13 | G5 | skills/scope-it/PLAN-FORMAT.md, skills/scope-it/CHECKS.md | none | A two-phase plan declares each interface; a missing producer fails the check | med | |
| R37 | build | scope-it runs a fixed gap checklist, asks high-impact questions one at a time, and keeps answers in a dated Clarifications section Items: T14 | G5 | skills/scope-it/GRILL.md, skills/scope-it/PLAN-FORMAT.md | none | A plan from a grill carries dated clarifications; the checklist names every gap it asks about | med | |
| R38 | build | A bugfix plan lists the behaviour that must not change, and those entries feed the regression seams Items: T31 | G5 | skills/scope-it/PLAN-FORMAT.md, skills/test-it/SKILL.md | none | A bugfix plan without a must-not-change list is refused; each entry becomes a test seam | low | |
| R39 | build | A plan touching auth, data, secrets, CI or payments lists trust boundaries and threats, each mitigate or accept, and an auditor reports each secured, open or escalate Items: issue: threat-register-for-risk-area-plans | G9 | skills/scope-it/PLAN-FORMAT.md, skills/prove-it/ARCHITECTURE.md, skills/guard-it/SKILL.md | none | A risk-area plan without the register is refused; a mitigate entry the code skips is reported open | med | |

### M6: Build and prove discipline
Exit: an unhandled audit finding fails its next round, a builder hitting an
auth error stops, and a stub in the diff appears in the ship report.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R40 | build | Each audit finding gets a stable id that survives a rewritten report, the plan carries one disposition table (addressed where, deferred or rejected why), and a later round is checked against it Items: issue: stable-ids-and-disposition-table-for-audit-findings | G6 | skills/prove-it/REPORT.md, skills/build-it/SKILL.md, skills/do-it/STATE.md | none | A finding left out of the table fails the next round; a rewritten report keeps the id | med | |
| R41 | build | prove-it chooses extra lenses from what the diff contains (tests, silent failures, new types), gains a never-a-finding list, and resolves its "cannot verify from the diff" bucket before the verdict Items: T17 | G6 | skills/prove-it/REPORT.md, skills/prove-it/SKILL.md | none | A diff adding tests selects the tests lens; an unresolved cannot-verify item blocks the verdict | med | |
| R42 | build | prove-it runs one fresh fix pass on a higher-tier model with earlier attempts' notes before it asks the user Items: T19 | G6 | skills/prove-it/ROUNDS.md, skills/do-it/scripts/gate.mjs | none | A second failed round gets the fix pass and its notes; the cap still stops a third | med | |
| R43 | build | The builder stops on an auth error with exact steps, after five read-only calls with no write, and in a worktree no `git clean`, no `git stash`, no blanket restore, halting if HEAD is a protected branch Items: issue: builder-stop-rules-and-worktree-git-prohibitions | G7 | agents/it-builder.md, skills/build-it/PARALLEL.md | none | An injected 401 stops with the steps; a sixth read-only call writes or reports blocked; the prohibitions are in both files | med | |
| R44 | build | A failed package install is never retried under a similar name; the builder stops and asks the user to confirm the package is real, and an unverified researched package is tagged assumed Items: issue: stop-and-ask-when-a-package-install-fails | G7 | agents/it-builder.md, skills/guard-it/SKILL.md, skills/look-it-up/SKILL.md | none | A failed install stops the build and names the package; a retry under a close name is refused | low | |
| R45 | build | build-it PARALLEL gains a pre-flight table of phase pairs sharing a file or interface, plus DONE_WITH_CONCERNS and NEEDS_CONTEXT statuses Items: T20 | G7 | skills/build-it/PARALLEL.md | none | A plan whose phases share a file shows the pair and does not fan out; both statuses are handled | med | |
| R46 | build | Phases run in parallel worktrees whenever it costs no extra tokens: an in-place frontier phase is carried onto the scratch integration branch as a temporary commit so the rest fan out Items: T152 | G7 | skills/build-it/PARALLEL.md, skills/do-it/scripts/run.mjs | none | The planning-locality shape (one in-place phase, two disjoint phases) runs two phases in worktrees and squashes to one uncommitted change | high | |
| R47 | build | Each new artifact is judged exists, substantive, wired and data-flowing (verified, hollow, orphaned, stub, missing), and a cross-slice report lists exports with no importer Items: issue: hollow-and-orphan-check-for-new-artifacts | G8 | skills/prove-it/ARCHITECTURE.md, skills/finish-it/DIGEST.md | none | A wired stub and an unimported export are each reported with their status | med | |
| R48 | build | Ship and prove detect new stubs, TODOs, skipped tests and unrun verifies in the diff; each is filed through log-it or waived with a reason, blocking only in an opt-in mode, and finish-it's digest lists the open ones Items: issue: register-of-stubs-skipped-tests-and-unrun-verifies | G8 | skills/ship-it/SKILL.md, skills/prove-it/SKILL.md, skills/log-it/SKILL.md, skills/finish-it/DIGEST.md, hooks/lib/checks.mjs | none | A new skipped test appears in the ship report; a waiver records its reason; finish-it's digest lists it | med | |

### M7: Hooks, provenance and docs drift
Exit: a `git commit` through the PowerShell tool is scanned or documented, and
`sweep-it` reports a doc line naming a missing path.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R49 | build | A `git commit` through the PowerShell tool is scanned like Bash, or the README states the gap and how to avoid it; the matcher and shell parser gain PowerShell shapes (`;` and `-and` chains, backticks, here-strings, `git -C`), failing open with a note Items: issue: powershell-aware-commit-and-secret-guard | G10 | hooks/hooks.json, hooks/lib/shell.mjs, tests/shell.test.mjs, README.md | none | A PowerShell `git commit` with a secret is blocked or the README says plainly it is not scanned; each named shape has a test | high | |
| R50 | build | `checks.json` gains rules for Bash commands (force push, `rm -rf`) via an event field, and MEDIUM dangerous patterns (eval, shell=True, innerHTML, TLS verify off) warn once per session per file Items: T26 | G10 | hooks/lib/checks.mjs, hooks/lib/decide.mjs, tests/hooks.test.mjs | none | A `git push --force` matches its rule; each MEDIUM pattern warns once and not twice | med | |
| R51 | build | A Stop hook warns when a building item edited code and no test command ran Items: T27 | G10 | hooks/hooks.json, hooks/lib/checks.mjs | none | A session editing code with no test run gets one warning; a session that ran one does not | low | |
| R52 | build | The commit scan runs only for commands that can commit, through the hook `if:` filter Items: T28 | G10 | hooks/hooks.json, hooks/claude.mjs | none | A `ls` call starts no node commit scan; a `git commit` does | low | |
| R53 | spike | Answer whether a pre-edit guard against whole-file rewrites (over 300 lines or 25 KB) and trimming passing-test noise are feasible on each host, before either is built Items: T82 | G10 | docs/research/hook-guards.md | none | The answer is recorded with each host's capability, the sketch is removed, and either a slice is cut or the idea is dropped | med | |
| R54 | build | A provenance check flags skill text copied from a known source repo, failing open Items: T4 | G11 | scripts/check.mjs, scripts/provenance.mjs | none | The check reports a planted copied paragraph and passes the tree; a crash blocks nothing | low | |
| R55 | build | The Claude Code half of the code map: the per-session map is cached keyed by HEAD and index mtime so subagent starts reuse it, falling back to tracked files when the 1.5 s timeout hits Items: T46 | G13 | hooks/lib/codemap.mjs, tests/codemap-routing.test.mjs | none | A second subagent start reuses the map; a bumped HEAD rebuilds it; the timeout path reads tracked files only | med | |
| R56 | build | `sweep-it`'s drift lens checks that paths, commands, names, endpoints and dependencies named in docs exist, by existence only, failing open Items: issue: verify-claims-in-docs-exist-paths-commands-names | G11 | skills/sweep-it/LENSES.md, skills/sweep-it/scripts/doc-claims.mjs | none | A doc naming a missing path, command and function is reported by the drift lens; a real one passes; nothing executes | med | |
| R57 | build | A tracker check (gh auth or Jira /myself) and an install doctor (Node 18, host, symlink health, hook registration, checks.json validity) run under setup-it Items: T78 | G12 | skills/setup-it/SKILL.md, scripts/doctor.mjs | none | A signed-out gh fails the tracker check; a broken hook registration is named with its fix | med | |
| R68 | build | The mechanical compliance scan runs wherever guard-it is installed, reports `Unverified` when it cannot resolve `hooks/lib/checks.mjs`, names the rules, policy and manifests it could not read, and puts the gap in a run's limits Items: issue: compliance-scanner-cannot-run-from-a-skills-only-install | G10, G12 | skills/guard-it/scripts/scan.mjs, skills/guard-it/SKILL.md, tests/guard-scan.test.mjs | none | A copy of the skill without hooks/lib reports `Unverified` and exits 2, never a clean list; the checkout finds it; absent rules, policy and manifests are named; a run records the gap in limits | med | shipped 2026-11-16 r68-guard-scan |

### M8: The last ideas
Exit: every remaining `idea` and `question` line is shipped, spiked with a
recorded answer, or dropped with a reason.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R58 | build | Short red-flag tables for test-it, debug-it, build-it and ship-it, built from failures actually observed Items: T22 | G13 | skills/test-it/SKILL.md, skills/debug-it/SKILL.md, skills/build-it/SKILL.md, skills/ship-it/SKILL.md | none | Each table cites the observed failure that produced its row and `npm run check` passes | low | |
| R59 | build | retro-it mines a session transcript for explicit user corrections and turns each into a candidate rule; with no transcript source it is dropped with a dated reason, never parked Items: T29 | G13 | skills/retro-it/SKILL.md, tests/retro-mining.test.mjs | none | A transcript with two corrections yields two candidates; a clean one yields none | med | |
| R60 | build | Incoming PR review feedback is handled: each item verified against the code, unclear ones clarified before any change, untrusted comment text never run; with no GitHub PR source it is dropped with a dated reason, never parked Items: T24 | G13 | skills/prove-it/SKILL.md, skills/review-it/SKILL.md | none | A stamped comment is verified or declined with a reason; a prompt-injection line changes nothing | med | |
| R61 | build | Path-scoped standards files load only when matching files change, and review-it applies a standards file only to the changed files under its directory Items: T32 | G13 | skills/build-it/STANDARDS.md, skills/review-it/SKILL.md | none | A change outside a standards file's directory does not load it; a matching one does | med | |
| R62 | build | Shared config and doc resolution moves out of skills/track-it/scripts into scripts/lib/ with no behaviour change Items: T44 | G13 | skills/track-it/scripts/tracker.mjs, scripts/lib/config.mjs, tests/tracker.test.mjs | none | `npm test` passes unchanged; one resolver remains | high | |
| R63 | spike | Run link-it across a named repo pair through a compaction between adjacent file operations and record whether an agreed but unwritten Interface edit, or the compaction, actually bites Items: T234 | G13 | skills/link-it/CONTRACT.md | none | The answer is recorded in CONTRACT.md or an ADR, the test repos are removed, and R64 is cut or dropped | med | |
| R64 | build | An agreed but unwritten Interface edit is applied, or the contract says why it stays unapplied, per R63 Items: T233 | G13 | skills/link-it/CONTRACT.md | R63 (the answer) | The chosen rule is in CONTRACT.md and a two-session hand test follows it | low | |
| R65 | build | ship-it owns the release per ADR 0014 in a new RELEASE.md: push, PR body, protected-branch check, changelog heading and the rollback note, each opt-in per run, and finish-it calls them but never pushes Items: T62 | G13 | skills/ship-it/RELEASE.md, skills/ship-it/SKILL.md, skills/finish-it/SKILL.md, docs/adr/0014-ship-it-owns-the-release.md | none | A dry run performs each step from ship-it and names its opt-in; finish-it points at it and refuses to push; ADR 0014 is accepted at ship | med | |

### M9: The stores are empty
Exit: `docs/TODO.md` has no open line, no issue has `status: open`, and
`Next id` is the next free id.

| Slice | Kind | Delivers | Covers | Files | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|-------|------------|--------|------|--------|
| R66 | build | Close the 16 tickets and every to-do line this roadmap named, leave findings filed during the run open with their source slice, set `Next id`, and record the closing state Items: the whole store; no single item | G14 | docs/TODO.md, docs/issues/ | R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R43, R44, R45, R46, R47, R48, R49, R50, R51, R52, R53, R54, R55, R56, R57, R58, R59, R60, R61, R62, R63, R64, R65, R67, R68 (nothing left to close) | No item this roadmap named is open; every finding filed during the run names its source slice; `Next id` is free; `npm test` passes | low | |

## Open decisions
- none

## Fog
- T2 running `/setup-it` on another repo: a user-run check that needs a second
  repo; a mismatch becomes a slice.
- T47 self-improving mechanisms: revisit after R17, R54 and R59 ship, then
  decide what fits.
- T175 a `work.mjs` per-step usage field: deferred until the ledger's window
  attribution proves too coarse.
- T115 confirming the OpenCode v2 `session.step` field names on a live
  OpenCode 2: a user-run check.

## Out of scope
- A tracker publish: slices stay local, as in the previous five roadmaps.
- A third findings store: log-it and `docs/issues/` stay the only two.
- A new skill for the release steps: they live in ship-it (ADR 0014).

## Decisions so far
- 2026-11-16 Decision (D1, settled): a failed verify does not park the slice
  on its own; three failed rounds in a row park it with a new gate stop code,
  and the first two throw. R23 is unblocked.
- 2026-11-16 Decision (D2, settled): `run new` keeps allowing a dirty tree,
  and its record names the base and that uncommitted changes are part of it;
  no refusal is added. R24 is unblocked.
- 2026-11-16 Decision (D3, settled): ship-it owns the release steps in a new
  `RELEASE.md`, opt-in per run, and finish-it calls them but never pushes
  ([0014](../adr/0014-ship-it-owns-the-release.md)). R65 is unblocked.
- 2026-11-16 Decision: the destination is an empty backlog; every open item
  ships, is dropped with a reason, or moves to an ADR or durable doc.
- 2026-11-16 Decision: the 31 unshipped items promoted out of
  backlog-cleanup-2026-11 (R2 to R16) are absorbed here, and that roadmap is
  recorded as superseded, not completed (R4).
- 2026-11-16 Decision: new behaviour is in scope; the 16 tickets and the
  `idea` items are built where the win is clear, spiked where unproven, and
  dropped with a reason otherwise.
- 2026-11-16 Decision: one roadmap, themed milestones, newest audit leftovers
  first; `idea` items do not wait behind another debt sweep.
- 2026-11-16 Decision: T45 dropped; deepen-it said not recommended now, so
  merging map-it and sweep-it returns only as a new roadmap if asked.
- 2026-11-16 Decision: a complete run asks for three tracks by default and
  never defaults to one; below three is raised, except a commit mode that
  writes no branch, which holds one and says why (R67, T298).

## Changes
- 2026-11-17: R25 shipped (r25-usage-attribution): a v2 step's agent and model
  are read, `--json` counts runs not records, the time-bucket label applies
  only to an untimed record, and the ledger spawns without a shell.
- 2026-11-17: R20 shipped (r20-commit-path): one `insideRoot` filter keeps a
  `..env` file, a worktree rename records both paths, and a blocked tag retries
  green on the same command.
- 2026-11-16: R12 shipped (r12-gate-export-tests): the stop code comes from
  `nextSlice`, the flaky fixture quotes a spaced path, an `R10` stop survives
  resuming `R1`, and the reject cases name their own outcomes.
- 2026-11-16: R16 shipped (r16-fixture-helpers): one `norm`, one `quiet`, one
  `seed` and one `clone` serve the link, install and doctor tests, and the
  POSIX case records the installer's answer.
- 2026-11-16: R17 shipped (r17-behaviour-evals): three paraphrased routing
  prompts, three pressure assertions that fail when their sentence goes, a
  grill scope case, and the two eval kinds documented.
- 2026-11-16: R11 shipped (r11-test-hygiene): the FINALIZE test pins the whole
  Paths set and counts the never-list by content, the docs tests pin headings
  and links, six reads share one helper, and the 1 MB test runs in under a
  second.
- 2026-11-16: R15 shipped (r15-locality-test-names): the locality tests pick
  their fence by heading and assert a match before use, so a rename names the
  field.
- 2026-11-16: R14 shipped (r14-hook-undo-tests): an unborn repo's rejected
  commit restores HEAD instead of keeping the scratch branch, a rethrow keeps
  its stack, and the guard and undo cases each carry their own assertion.
- 2026-11-16: R8 shipped (r8-plan-text): the plan format says why `## Files` is
  the union and `## Interfaces` stays at the README, its phase list is named,
  and CHECKS and GRILL count a dependency path.
- 2026-11-16: R13 shipped (r13-gate-leftovers): the gate header names both
  callers, an audit of an unstarted slice spends no round, a reading gate
  writes nothing, and STOPS states the resumed-rounds rule.
- 2026-11-16: R10 shipped (r10-readme-truth): the one-route rule covers a CLI
  install, each marketplace claim names its install, the CLI refresh facts are
  stated once, and the command blocks are bash fences.
- 2026-11-16: R5 shipped (r5-skill-text): finish-it names the `defects` it
  reports, name-it's ADRs move proposed to accepted at ship, RESUME drops its
  repeated ask rule, and the seven files' long lines wrap within the budget.
- 2026-11-16: R7 shipped (r7-plan-link): PLAN-FORMAT owns `## Link` and its
  rule, link-it points at it, and a test pins that a replan keeps the section.
- 2026-11-16: R1 shipped (r1-countaudit): a refused audit round no longer
  parks a slice whose last allowed round passed, and a failing last round
  still parks it.
- 2026-11-16: R6 shipped (r6-line-budget): every skills SKILL.md is 100
  lines or fewer, and the pin is a budget over all of them.
- 2026-11-16: R3 shipped (r3-finalize-removal): finalize appends the
  history row and removes a finished roadmap; an unfinished one is left and
  named.
- 2026-11-16: R68 shipped (r68-guard-scan): the compliance scan resolves
  its shared code or reports Unverified; absent inputs and the limits entry
  are named.
- 2026-11-16: G14 and R66 now resolve only the items this roadmap named;
  findings filed during the run stay open with their source slice. R68 added
  for the compliance-scan issue filed from R1's audit.
- 2026-11-16: R2 shipped (r2-finish-repo-root): a run records its repo
  root, prints it, refuses another checkout, and finish-it refuses a sibling
  roadmap.
- 2026-11-16: R4 shipped (r4-roadmap-history): backlog-cleanup-2026-11
  recorded as superseded, and all 36 promoted ids resolve.
- 2026-11-16: Sweep settled (full, three tracks, phase commits, no run-wide
  slice cap). The six refine slices took their defaults. R67 added for the
  three-track default.
