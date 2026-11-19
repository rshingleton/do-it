# Licensing rules

Applied by `guard-it` to every change. Source record: `docs/SOURCES.md`.

- **HIGH** A new outside source (a repo, skill, doc or text that shaped a
  change, or a new README credit) has no row in `docs/SOURCES.md`.
- **HIGH** Text or code is copied from a source whose licence is `none`,
  GPL-family, non-commercial or unknown. Such a source is idea-only.
- **HIGH** Text or code is copied under a permissive licence without the
  attribution that licence asks for (an MIT or Apache-2.0 notice kept in
  `LICENSE` or `NOTICE`), or is copied from a source whose `SOURCES.md` row
  says `idea-only`.
- **MEDIUM** A `SOURCES.md` row has no licence, no checked date, or a licence
  that does not match the source's own licence file.
- **MEDIUM** The README says "no code is copied" or "own words" while a row is
  marked `copied`.
- **LOW** A new credit lists what was taken only in general terms.
