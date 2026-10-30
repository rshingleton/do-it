---
status: accepted
---

# A slice shipped with its Verify unmet does not block its dependents

A roadmap slice can ship with its Verify clause not met: the product defect it exposed is filed as an issue, and the slice is marked `shipped <date> <id>, Verify unmet: <clause>`. `work.mjs roadmap` counts such a slice as done, so a slice that depends on it is ready, and the unmet clause is listed beside that dependent. Holding every dependent until the clause is met was rejected: one filed defect would stall the whole run, and the defect has an issue that owns it. Hiding the unmet clause was rejected too: a reader must see what was not proven.

## Consequences

- Done means shipped or dropped; one predicate serves `next`, `blocked` and `blocking`.
- The unmet clause appears in the `roadmap` output next to each dependent and in the closing message, so the gap is visible at the point it matters.
- A dependent that truly cannot work without the unmet clause says so in its own Blocked-by, as a decision.
