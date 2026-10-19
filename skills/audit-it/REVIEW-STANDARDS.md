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

- **Module depth.** Imagine deleting each new module: if its behaviour
  vanishes with it, it is a pass-through.
- **Seams.** An interface with one adapter is a hypothetical seam; two
  (production and test) make it real.
- **Test surface.** Tests go through the public interface. A test that must
  know internals says the interface is wrong.
- **Shortcuts.** A `shortcut: <limit>, <when to upgrade>` marker is a recorded
  decision. Flag it only when the stated load already crosses the limit.

## Hygiene

UTF-8, LF line endings unless `.gitattributes` says otherwise, `.sh` files
executable, copyright headers where sibling files carry them.
