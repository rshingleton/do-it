# Contributing

Read [AGENTS.md](AGENTS.md) first: it holds the repo layout, the rules for
writing a skill, and the commands to run before handing off.

## Borrowing from other projects

Ideas from other repos are welcome. Their text is not copied in unless the
licence allows it.

1. **Check the licence before you use the source.** Read the repo's licence
   file (the GitHub licence API shows it). No licence means all rights are
   reserved. GPL-family and non-commercial licences do not fit an MIT repo.
2. **Add a row to [docs/SOURCES.md](docs/SOURCES.md)** with the licence, whether
   the use is `idea-only` or `copied`, what was taken, and the date checked.
3. **Idea-only is the default.** Write the skill in this repo's own words.
   `copied` needs a licence that allows it, the attribution it asks for kept in
   `LICENSE` or `NOTICE`, and a reviewer's yes.
4. **Credit it in the README Credits table**, in one line of what was taken.
5. **A source with no licence, or one you cannot confirm, is idea-only.**
   Contact the author before relying on more than the idea.

`guard-it` reads [.compliance-rules/licensing.md](.compliance-rules/licensing.md)
and `review-it` checks the same row, so a missing one is caught at review.
The reasoning is in [ADR 0017](docs/adr/0017-source-licence-gate.md).
