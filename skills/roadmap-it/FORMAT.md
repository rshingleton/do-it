# Roadmap format

One Markdown file per effort. Requirement ids (`G<n>`), slice ids (`R<n>`)
and decision ids (`D<n>`) are stable for the life of the roadmap and never
reused; `/do-it <file>#R4` refers to one slice.

```markdown
---
title: Self-service billing
approved: 2026-10-19
tracker: { kind: jira, milestones: { M1: CDS-200 } }
---

# Self-service billing

## Destination
Account owners change plan, payment method and billing contact without
contacting support.

- G1: An owner can upgrade or downgrade the plan from the account page.
- G2: An owner can replace the payment method.
- G3: Billing-change support tickets drop below 5 a month.

## Milestones

### M1: Change plan end to end
Exit: an owner upgrades on staging and the next invoice is prorated.

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status | Ref |
|-------|------|----------|--------|------------|--------|------|--------|-----|
| R1 | spike | Can the provider prorate mid-cycle? | G1 | none | Answer recorded in ADR-0014 | high | shipped 2026-10-22 proration-spike | CDS-201 |
| R2 | build | Plan picker, upgrades only | G1 | R1 (proration answer) | Upgrade applies; invoice shows proration | med | | CDS-202 |
| R3 | build | Downgrades at end of cycle | G1 | R2 (plan picker) | Downgrade scheduled; owner sees the date | low | | CDS-203 |
| R5 | build | Change payment method | G2 | R4 (payment module), D1 | New card charged on next invoice | med | refine | |

## Open decisions
- D1: Who may change billing: owner only, or admins too? Answer by: grill with product. Blocks R5.

## Fog
- Tax handling for non-US accounts (may become slices under G2).

## Out of scope
- Invoicing redesign.

## Decisions so far
- 2026-10-22 Decision: proration handled by the provider (ADR-0014). Unblocked R2.

## Changes
- 2026-10-22: R1 answered; R2 ready.
```

## Fields

- **Covers:** the `G` ids the slice moves forward. Every `G` is covered by a
  slice, waits in Fog, or is moved to Out of scope.
- **Blocked by:** slices or decisions this slice truly cannot start without,
  each with a few words on what it needs. Order alone is not a block.
- **Verify:** the observable check that says the slice is done, in the same
  spirit as a plan's `→ verify:`.
- **Risk:** low, med or high; high slices go early.
- **Status:** written by hand only for `refine` (scope agreed, detail not yet:
  `/do-it` runs a short refine before planning) and `dropped <date>: <why>`.
  ship-it writes `shipped <date> <work id>`; the same is written by hand
  for a slice `work.mjs roadmap` reports stale (shipped outside ship-it).
  Everything else is derived by `work.mjs roadmap` (see [SKILL.md](SKILL.md) §6).
- **Ref:** the slice's tracker issue, when the roadmap was published; empty
  otherwise. ship-it closes it with the slice. The column may be left out of
  an unpublished roadmap.

The Decisions so far section is an index of dated one-liners pointing at the
ADR or plan that holds the reasoning.
