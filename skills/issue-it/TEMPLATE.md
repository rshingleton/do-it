## Context

Where this came from: a user report, review finding, pasted email or ticket
(verbatim), or the step that filed it. Name the modules and domain terms
involved.

## Problem

What is wrong or wanted, specifically. Error messages, scenarios, numbers.

Good: "`POST /api/orders` returns 504 when the cart holds more than 100 items."
Bad: "Performance issue."

## Acceptance

Testable statements of done.

- Orders with more than 100 items respond within 2 s
- Rate-limited requests get 429 with `Retry-After`

## Notes

Links, logs (secrets redacted), related ADRs, `file:line` references.
