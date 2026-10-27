# Terse voice: before and after in the usage ledger

Second attempt at the question in
[caveman-baseline.md](caveman-baseline.md): did the terse voice block and
report contracts (`35df34e`) lower what `it-*` subagents cost? The headless
A/B in `docs/issues/prove-or-refute-token-savings-of-the-terse-voice-change-with.md`
could not run: a headless `claude -p` in an isolated config dir is not logged
in and no API key was set, and the real config dir would load the global
`~/.claude` agents into both arms. This note uses real runs from the usage
ledger instead.

## Method

- Source: `~/.claude/do-it/usage/*.jsonl` (`skills/usage-it`), snapshot taken
  2026-10-26. One row per agent run: turns, output (`out`), cache write
  (`cc`), cache read (`cr`).
- Rows: every `it-*` agent run, 418 in all.
- Cut: the commit time of `35df34e`, 2026-10-21 10:59:24Z. Before: 25 runs.
  After: 393 runs. A control keeps only after-side runs from 2026-10-21, so
  the same day's work shows apart from later work.
- Per agent and side: n, median and range. A difference under about 10% is
  noise, the bar the A/B issue set.
- The script was throwaway and is not kept; the numbers recompute from the
  ledger with the filter above.

## Results

Medians, range in brackets.

| Agent | Side | n | Turns | Out | Cache write | Cache read |
|-------|------|---|-------|-----|-------------|------------|
| it-reviewer | before | 19 | 4 (2-7) | 60 (24-381) | 22,651 (8,234-66,889) | 47,546 (12,119-139,313) |
| it-reviewer | after, same day | 59 | 4 (2-16) | 61 (19-2,008) | 19,929 (8,512-65,466) | 43,556 (6,622-747,343) |
| it-reviewer | after, all | 320 | 4 (2-18) | 2,188 (19-14,708) | 24,673 (8,512-91,631) | 58,025 (6,622-971,951) |
| it-scout | before | 3 | 3 (1-4) | 65 (3-377) | 12,569 (7,211-12,638) | 17,883 (0-28,382) |
| it-scout | after, all | 5 | 12 (6-18) | 9,222 (6,090-10,272) | 36,521 (28,079-64,215) | 272,694 (99,796-580,673) |
| it-skeptic | before | 2 | 5 (4-6) | 137 (52-222) | 13,433 (11,213-15,653) | 41,744 (27,399-56,089) |
| it-skeptic | after, all | 0 | - | - | - | - |
| it-planner | before | 1 | 3 | 2,687 | 18,764 | 25,732 |
| it-planner | after, same day | 2 | 12.5 (5-20) | 3,319 (37-6,601) | 37,192 (24,712-49,671) | 371,663 (70,054-673,272) |
| it-planner | after, all | 5 | 12 (5-20) | 6,601 (37-14,146) | 49,671 (24,712-68,789) | 307,530 (70,054-673,272) |
| it-builder | after, all | 63 | 20 (7-77) | 21,017 (5,202-63,119) | 95,636 (36,026-657,402) | 1,669,274 (321,677-13,418,267) |

`it-builder` has no before side: the `it-*` agents were created the same
morning as the voice change. The same-day control has runs only for
`it-reviewer` and `it-planner`; `it-scout`, `it-builder` and `it-skeptic` have
none that day.

## Verdict

Not proven, and the ledger cannot prove it. Not refuted either.

- The one comparison with real counts is `it-reviewer` on the same day: turns
  4 vs 4, output 60 vs 61, cache write 22.7k vs 19.9k (12% lower, n 19 vs 59),
  cache read 47.5k vs 43.6k (8% lower). Output and turns are flat; cache write is
  just outside the 10% noise line and cache read inside it. That agrees with
  [caveman-baseline.md](caveman-baseline.md): the reports were already short,
  so the voice block has little to trim, and it does not show up as a cost.
- Every other row is confounded. The after side is dominated by later work
  (full audits, builds) whose reports are far longer than the before runs:
  the `it-reviewer` median output moves from 60 to 2,188 across the same
  agent, which the voice change does not explain; the work mix is the likely cause,
  not checked. `it-scout`, `it-skeptic` and `it-planner` have 0 to 5 runs a side.
- The before side is 25 runs from one morning, and it likely includes the
  baseline runs made with the change in the working tree before it was
  committed, so the cut may leak in both directions.

Kept, as before: the voice block and contracts add no measurable cost and
guard against long reports. A real answer needs paired runs of the same work
on both trees.

Superseded 2026-10-27: [terse-voice-ab.md](terse-voice-ab.md) ran those paired
runs and replaces this verdict: no evidence of a saving, no
dropped finding detected.
