---
status: accepted
---

# The usage ledger records tokens, never cost

`usage-it` and the OpenCode usage path write one ledger row per run with input, output and cache token counts, and no price. A report that wants a cost applies a price table when it reads the rows. Prices change, differ by plan and by model, and are easy to get wrong, so a stored cost would go stale in every old row while the token counts stay true. Storing cost beside tokens and recording cost alone were both rejected: the first freezes a guess into the data, the second loses the figure that can be re-priced.

## Consequences

- The digest and the `usage-it` report state counted tokens and never an estimate of money or time saved.
- Changing a price needs no migration; a new table re-prices every row.
- A cost field in a row is a defect, not a feature to fill in.
