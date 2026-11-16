---
title: Threat register for risk-area plans
type: feature
status: open
source: user
---

## Context

Source: survey of open-gsd/gsd-core agent prompts (planner threat_model, security-auditor, executor Rule 2), 2026-11-15. Touches `scope-it/PLAN-FORMAT.md`, `prove-it`, `guard-it`.

## Problem

do-it has no threat model; `guard-it` is rule-based only. Plans touching risky areas list no trust boundaries or threats.

## Acceptance

- Plans touching auth, data, secrets, CI or payments list trust boundaries and threats, each mitigate or accept
- The builder treats a mitigate entry as a correctness requirement
- A fresh auditor reports each as secured, open or escalate
- Gated to risk-area plans, not every lane

## Notes

Medium. Keep within the scaled-lanes rule.
