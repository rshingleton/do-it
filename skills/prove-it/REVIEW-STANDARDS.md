# Review standards

Baseline for the Standards axis, on top of the repo's documented standards and
`.compliance-rules/coding-standards*.md`. A documented repo standard
overrides this file. Skip anything tooling already enforces.

## Fit

- **Match the repo.** Naming, imports, layout, error handling and comment
  density match the surrounding code.
- **Minimal surface.** The smallest change that passes the plan's checks. No
  speculative options, no "while I'm here" cleanup.
- **Comments** explain a non-obvious why, not an obvious what.
- **Dependencies.** No `*` or unbounded `>=` ranges, no unofficial registries,
  no new dependency for a few lines.

## Design

- **Depth, seams, test surface.** Judge new modules with design-it's rules
  (the deletion test, one adapter is a hypothetical seam, tests go through
  the interface) and review-it's smell baseline; they are not restated here.
- **Shortcuts.** A `shortcut: <limit>, <when to upgrade>` marker is a recorded
  decision. Flag it only when the stated load already crosses the limit.

## Hygiene

UTF-8, LF line endings unless `.gitattributes` says otherwise, `.sh` files
executable, copyright headers where sibling files carry them.
