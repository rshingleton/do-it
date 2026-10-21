---
title: Prove or refute token savings of the terse-voice change with an A/B harness
type: feature
status: open
source: user
---

## Context

The terse-voice work (`docs/planning/apply-caveman-terse-contracts-to-internal-agent-communicatio/`,
audit report beside it) shipped with its token effect unproven.
`docs/research/caveman-baseline.md` has one run per side on three short
briefs: totals moved 4% to 20% down, but the movers track how many turns
each agent took, so the result is inconclusive.

## Problem

There is no way to compare the old and new agents side by side on realistic
work. Outputs were already about 70 tokens on the baseline briefs; the cost
that matters is injected context re-read each turn and report text landing
in the main context. Savings also mean nothing if findings are lost.

## Acceptance

- A throwaway harness (not shipped code) runs two arms from the same repo:
  `7ae5158` in a git worktree and the current tree, each driven headless
  (`claude -p --output-format json`), with hooks and agent files resolving
  per checkout. Check first how to make them resolve per checkout
  (`--plugin-dir` or a project-local install).
- Cases with long reports: `review-it` on a real 30-file diff, a `prove-it`
  audit, a `scope-it` builder check on a lane-M plan, a `sweep-it` group
  review, a `look-it-up` run.
- Five runs per case per arm, paired by case; report median and range;
  differences under about 10% count as noise.
- Metrics: subagent cache write, cache read and output tokens; report words;
  main-session input growth on the turns after a report lands; the API's
  `total_cost_usd`.
- Quality check: a fixture diff with about eight planted defects, some whose
  finding depends on a negation ("does not validate"); recall scored per arm.
  An arm that drops a planted finding is a loss whatever it saves.
- Results and the exact method go in `docs/research/`, replacing the
  inconclusive verdict in `caveman-baseline.md` with a linked one.

## Notes

- Rough cost: four cases, five runs, two arms is about 40 runs, near 1M
  tokens, plus about a day for the fixture repo and script.
- Follow-on: `per-step-usage-record-on-do-it-work-items` gives a continuous
  sample from real work items and replaces the transcript script.
- The voice block and contracts stay in the meantime: they add no measurable
  cost and guard against long reports.
