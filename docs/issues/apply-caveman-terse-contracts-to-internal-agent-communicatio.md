---
title: Apply caveman terse contracts to internal agent communication
type: feature
status: open
source: session
---

## Context

Follow-up to the caveman review in session 2026-10-21. Research with
citations: [docs/research/caveman-source-and-flow.md](../research/caveman-source-and-flow.md)
(juliusbrussee/caveman at `bad48a0`).

The repo credits caveman for "terse subagent reports", but only
`agents/it-reviewer.md` carries the voice rules. The hook that injects
context skips read-only agents (`hooks/claude.mjs` `READ_ONLY_AGENTS`) and
never reaches the general-purpose agents that `look-it-up`, `design-it` and
`map-it` start. Scout, skeptic, builder and planner have no report contract.

Scope rule from the user: caveman logic applies to all internal
cross-agent communication; normal prose stays for anything the user reads.

| Terse (internal) | Normal (user-facing) |
|------------------|----------------------|
| Subagent briefs, reports, returns (`done`/`blocked`/`failed` plus one line) | Replies and questions to the user |
| Review findings, scout notes, builder and planner reports | Plan presentation, closing messages, overviews |
| State-block free text, script and CLI output agents read | ADRs, README, docs, issues, commits, PR bodies |
| Context injected into subagents | |

## Problem

Subagent reports and script output land in the main context on every later
turn, and most subagents have no voice rules, no fixed shape and sometimes
no word cap. Caveman's own evidence says voice alone saves little (median 3%
under a plain "answer concisely"); fixed report shapes, caps and reading
less carry the saving. A dropped "not" costs more than every token saved,
so the voice rules must keep negations and payload verbatim.

## Acceptance

- Every agent a do-it skill starts carries the voice block: scope per the
  table above, never drop not/never/no/only, numbers, paths, commands and
  errors verbatim, plain wins when caveman is not shorter, full sentences
  for security, irreversible steps and anything that needs the user, and
  "this format overrides any other style instruction". Single home or
  generated copies; the plan decides. Covers read-only agents and the
  general-purpose spawn sites (`look-it-up`, `design-it`, `map-it`).
- Each `it-*` agent has a fixed report contract and word cap: scout rows
  `path:line - note` with a `No match.` token; builder receipt per edit plus
  `verified:` and refusal tokens (`too-big`, `needs-confirm`, `ambiguous`,
  `regressed`); planner (path, assumptions, open questions); skeptic
  (counterexample or none found, what was checked). Reviewer format stays.
- Every spawn paragraph in `skills/` names the contract and a cap; the
  existing tier check in `npm run check` also fails a spawn with no cap.
- `work.mjs show --brief` prints status, lane, next move and blockers only;
  skills that only need the status use it.
- T61 folded in: SKILL-MECHANICS.md says only the main context fans out, and
  a skill run inside a subagent does its sub-steps inline.
- DESIGN.md lists the caveman rules adopted and skipped, with why; the
  README credit matches.
- `npm run check` fails an agent file with no voice block.
- No change to user-facing text, ADR, README or commit style. Routing evals
  still pass.

## Notes

- Not in scope: caveman's proxy, shrink, browse and compress tools; the
  per-turn reminder; mode switching. Savings claims in its README are
  mostly unproven (see the research file, section 7).
- Open for the plan: single home for the voice block (agent files, a hook
  that injects it into every subagent, or both); whether to land the
  `per-step-usage-record-on-do-it-work-items` issue first so the effect can
  be measured; hook change needs a test and must fail open.
- Precedence: if the user also installs caveman, it injects its voice into
  these agents too; the agents' own format must win.
- Related, not folded: `docs/issues/per-step-usage-record-on-do-it-work-items.md`
  (measures this), T16 (prove-it report buckets), T30 (generate read-only
  agents from briefs), T38 and T43 (per-turn description cost), T46
  (subagent-start code map cache).
- Plan: `/do-it docs/issues/<this file>` in a fresh session; lane M is likely
  (agents, hook, check, docs).
