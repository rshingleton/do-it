---
status: Accepted
---

# Check a source's licence before using it

Skills here are built from ideas found in other projects. Until now nothing recorded whether a source's licence allowed that use, and two credited sources (ballet, andrej-karpathy-skills) have no licence file at all. Every outside source now gets a row in [SOURCES.md](../SOURCES.md) before it shapes anything: its SPDX licence, whether the use is `idea-only` or `copied`, what was taken and when it was checked. A source with no licence, a GPL-family one or a non-commercial one is idea-only: the idea is taken and the text is written fresh. `copied` needs a permitting licence and the attribution it asks for. The rule is enforced by [`.compliance-rules/licensing.md`](../../.compliance-rules/licensing.md) through `guard-it`, by a Fit line in `review-it`, and by a licence step in `look-it-up`; [CONTRIBUTING.md](../../CONTRIBUTING.md) tells contributors.

## Options considered

- Rely on the README Credits table alone: rejected. It records credit, not licence or what use was permitted.
- Forbid every outside source without a licence, ideas included: rejected. Ideas are not covered by copyright, and this would block most of the repo's lineage.
- A scripted check that every credit has a manifest row: deferred. The rule and review catch it for now; add it if rows are missed.

## Consequences

- Adding a source costs one table row and a licence lookup.
- A licence read from the GitHub API can be missing or wrong (a licence file the API does not detect); `none` means "not detected", so confirm with the author before relying on more than the idea.
- Row accuracy depends on the person or agent adding it; the licence rule is a judgement check, not a mechanical one.
