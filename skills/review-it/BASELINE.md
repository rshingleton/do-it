# Fit and hygiene baseline

Checked by the Standards reviewer alongside [SMELLS.md](SMELLS.md), in a repo
that documents nothing as much as in one that documents everything. A
documented repo rule overrides any line here. Skip what tooling enforces.

Not here on purpose, because each has one home elsewhere: minimal surface and
surgical changes (the it-core posture), dependency policy (guard-it),
`shortcut:` markers as recorded decisions (prove-it's report contract),
module depth and seams (design-it).

## Fit

- **Match the surroundings.** Names, imports, layout, error handling and
  comment density look like the code next to them.
- **Comments say why.** A comment earns its place by explaining a non-obvious
  reason; one that repeats what the code says is noise.

## Hygiene

- UTF-8 text, LF line endings unless `.gitattributes` says otherwise.
- Shell scripts executable; other files not.
- A copyright or licence header on new files where their siblings carry one.
