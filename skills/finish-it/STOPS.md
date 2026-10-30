# Stops

Every reason a run parks a slice or stops. Codes match
`skills/do-it/scripts/stops.mjs`; a test compares the two. A parked slice
waits with its dependents and the run goes on. A stop ends the loop and
closes per [SKILL.md](SKILL.md) §4.

## Gates (the script decides)

Before chaining a slice to ship, `work.mjs run gate <slug> <slice>` prints
`{allow, reason, detail}`. `allow` false: act on `reason`.

- `STALE_VERIFY` (park): code changed since the last passing verify. Rerun `work.mjs run verify`.
- `UNVERIFIED` (park): no passing verify recorded. Run `work.mjs run verify`.
- `FLAKY` (park): `run verify` reran a failing check once and it passed. Never rerun again.
- `SLICE_CAP` (park): the slice ran past `slice_cap_min`.
- `MAX_SLICES` (stop): shipped slices reached `max_slices`.
- `AUDIT_CAP` (stop): audit rounds reached `audit_cap`.

Calls: `run start <slug> <slice> --work <id>` when a slice begins,
`run verify <slug> <slice> -- <checks>` instead of `verify-phase`,
`run audit <slug>` after each audit round.

## Judgment (no script sees these)

- `OUTCOME_CONFLICT` (park): the slice contradicts the roadmap outcome or a non-goal.
- `IRREVERSIBLE` (park): the next step cannot be undone (data loss, push, publish).
- `AUDIT_FAILED_3` (park): third failed audit in a row; state.mjs blocks the item.
- `DEFERRED_DECISION` (park): the slice needs a decision marked ask-when-reached.
- `USER_INTERRUPT` (stop): the user spoke; close the run.

Park with `--needs decision` for `DEFERRED_DECISION`, else `--needs user`, and
put the code first in `--reason`.
