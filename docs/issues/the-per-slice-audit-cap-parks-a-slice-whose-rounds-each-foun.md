---
title: "The per-slice audit cap parks a slice whose rounds each found a new Must, with the last fix unreviewed"
type: bug
status: open
source: user
---

## Context
finish-it's per-slice audit cap (`audit_cap`, default 3) parked a slice that was converging: each round found a different real Must, and the last round's fix was never re-reviewed.

R17 of docs/roadmap/build-ini-to-yaml.md (a post-deploy check playbook), run in a downstream repo:

- Round 1: 2 Musts (an unreachable host aborted the play; a password comparison failed on every healthy host).
- Round 2: 1 Must (a report task read a field a failed result does not have).
- Round 3: the audit was refused with SLICE_AUDIT_CAP ("3 audit rounds, cap 3") and the slice was parked, with the round 2 fix unreviewed.

Each Must was new, real, and fixed with a test; none repeated. The cap treated "three rounds each finding something new" the same as "three rounds failing on the same thing".

The user's words: "the cap shit should be fixed, raise the fucking cap to complete this". The earlier slice-time cap had the same effect (a parked slice's wait counted against it; issue "the slice cap counts the time a slice is parked").

## Expected
- A slice whose consecutive audit rounds find *different* Musts, with the latest fix verified but not yet reviewed, is not parked by the cap; it gets the review of its last fix.
- The cap counts only rounds that repeat a Must an earlier round raised: a round that raises any new Must spends nothing, and a round that fixed everything it found does not spend the cap. At `audit_cap` 3, four consecutive rounds on the same Must spend the cap and the fifth parks.
- At minimum, the refusal reads "last fix unreviewed" and says so in the park reason.

## Done when
- A slice with N rounds that each found a new Must is allowed one more round after its last fix, so the last fix is reviewed: a round that raises only Musts not seen before spends nothing.
- The cap counts rounds that repeat an earlier Must: at `audit_cap` 3, four consecutive rounds on the same Must spend the cap and the fifth parks, and the refusal names the unreviewed fix.
