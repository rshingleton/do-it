# Terse voice: paired headless A/B

Third attempt at the question in [caveman-baseline.md](caveman-baseline.md) and
[terse-voice-ledger.md](terse-voice-ledger.md): did the voice block and report
contracts (`35df34e`) lower what `it-*` subagents cost? This one runs the same
five briefs on both trees, five times each, in isolated headless sessions on
the logged-in account, and scores whether findings survive. Run 2026-10-27.

## Verdict

**No evidence of a saving on these cases, and no dropped finding detected.** The voice change did not make runs cheaper here; whether it makes them costlier is not resolved.

- Total input per run is flat: -10% to +7% across the four `it-*` cases, and
  +2% on the control. The `after` tree adds about 700 to 860 input tokens to
  every run, the control (a general agent the voice hook skips) included, so
  that overhead is not the voice block's alone.
- Output tokens were higher in the `after` arm in three of four cases (prove
  +13%, scope +31%, sweep +27%) and lower in review (-6%); report words moved
  -17%, +20%, +6%, +5%. Every range overlaps its pair, and the control's
  spread is about 6%, so the direction is suggestive (not lower) but not
  resolved. Sweep cost is +16% (median 0.114 vs 0.098 USD).
- Keyword recall of eight planted defects (four of them negation findings),
  scored on review, prove and sweep, was 8 of 8 in every run of both arms
  except one `before` sweep run that missed one (7 of 8). Scoring matched a
  file name plus a keyword and was not read one by one, and the raw reports
  were not kept, so this shows no dropped finding was detected, not that every
  finding was described correctly. Scope and the control are not scored.

Kept, as decided before: the voice block and contracts guard against long
reports. This run does not show them saving tokens on reports that were
already short (a 300-word cap, about 250 words returned). The earlier "not
proven" verdicts are replaced by this one.

## Method

- Arms: `before` is a git worktree at `35df34e^` (`7ae5158`: the `it-*` agent
  files without a voice block, the old hook); `after` is a worktree at
  `9a28943`, the tree at the time of the run. The `it-*` agent files differ
  between the arms only by the voice change, but the hooks and the rest of the
  tree differ by 60-odd later commits, so the A/B measures the tree, not the
  voice block alone; the control (a general agent the voice hook skips) shows
  how much of a difference comes from outside it. Each run started in its own
  worktree.
- Isolation that keeps the login: `claude -p --setting-sources project
  --output-format json --model sonnet` from the worktree, with no `--bare`
  (that skips OAuth). Each worktree held a `.claude/settings.json` whose hooks
  were the checkout's own `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}`
  replaced by the worktree path, and `.claude/agents` linked to its `agents/`.
  `--setting-sources project` drops `~/.claude/settings.json` and so the
  global hooks, and the user-level agents did not load. Checked on a pilot per
  arm from the transcripts: the voice marker was absent from `before` and
  present in `after`, and neither transcript named `~/.local/share/do-it`.
- Permissions: `--allowedTools` for `Agent`, `Read`, `Grep`, `Glob` and a few
  read-only `Bash(git -C *)`, `ls`, `cat`, `wc`, `cd` patterns, plus
  `--add-dir` for the fixture. No bypass mode.
- Driver: the main session was told to start the named agent
  (`it-reviewer`, or `general-purpose` for the control) with the brief
  verbatim and return its report verbatim. The briefs mirror the spawn
  paragraphs and report shapes of `review-it`, `prove-it`, `scope-it`
  (builder check) and `sweep-it`; the skills themselves were not loaded, so
  both arms share skill text by construction. `look-it-up` starts a general
  agent that the voice hook does not touch, so the fifth case is a control
  (a general agent summarising the fixture) and doubles as the noise
  estimate.
- Fixture: a 30-file repo (`main`, then a `feature` commit, 557 diff lines)
  with eight planted defects: unvalidated input (negation), off-by-one paging,
  swallowed write error, un-awaited charge (negation), missing ownership check
  (negation), unbounded retry (negation), ISO strings compared as text, SQL by
  concatenation. The commit message claims the validation, the ownership check
  and the retry limit, so those findings depend on a negation. Recall counted
  a defect when the report named its file and one of its keywords; a hit was
  not read for correctness one by one.
- Runs: 5 per case per arm, 50 in all, ten at a time (five cases, two arms)
  per round. Metrics per run: the sum of subagent `usage` over distinct API
  messages in its transcript (turns, input, cache write, cache read, output),
  the words in the returned report, and `total_cost_usd`.
- A first full pass was discarded: in some `review` runs the subagent's `Bash`
  was denied and it reported that it could not read the diff. The briefs were
  changed to read the diff and commit message from files and all 50 runs were
  repeated. No run in the reported set failed or was dropped.

## Results

Medians, range in brackets. `Total in` is input plus cache write plus cache
read.

| Case | Arm | Turns | Total in | Out | Words | Cost USD (median, range) |
|------|-----|-------|----------|-----|-------|----------|
| review | before | 2 (2-2) | 24,992 (24,992-24,992) | 918 (896-949) | 282 (265-299) | 0.053 (0.052-0.115) |
| review | after | 2 (2-2) | 25,718 (25,718-25,718) | 864 (781-1,013) | 235 (225-315) | 0.052 (0.042-0.115) |
| prove | before | 2 (2-2) | 24,679 (24,679-24,679) | 662 (608-739) | 216 (203-259) | 0.054 (0.048-0.108) |
| prove | after | 2 (2-2) | 25,405 (25,405-25,405) | 748 (565-863) | 260 (183-293) | 0.053 (0.026-0.112) |
| scope | before | 4 (3-5) | 46,203 (33,161-60,973) | 1,388 (1,249-2,142) | 346 (328-403) | 0.067 (0.042-0.078) |
| scope | after | 4 (3-4) | 49,639 (34,319-53,323) | 1,823 (1,263-2,101) | 368 (325-404) | 0.056 (0.043-0.076) |
| sweep | before | 10 (5-10) | 147,375 (60,239-167,673) | 2,706 (1,694-4,548) | 291 (222-337) | 0.098 (0.083-0.131) |
| sweep | after | 9 (6-14) | 132,539 (73,350-265,982) | 3,444 (2,575-4,434) | 305 (254-353) | 0.114 (0.077-0.147) |
| control | before | 2 (2-2) | 50,128 (50,127-50,439) | 426 (367-451) | 129 (107-149) | 0.043 (0.023-0.062) |
| control | after | 2 (2-2) | 50,989 (50,987-52,024) | 425 (323-515) | 121 (83-148) | 0.045 (0.041-0.059) |

After vs before, medians: total in +3%, +3%, +7%, -10% (review, prove, scope,
sweep); output -6%, +13%, +31%, +27%; words -17%, +20%, +6%, +5%. The control
moves -6% on words and 0% on output with no voice involved, so the noise is
about that size.

Keyword recall of the eight planted defects (review, prove, sweep, five runs each):
`before` 8, 8, 8, 8, 8 / 8, 8, 8, 8, 8 / 8, 8, 7, 8, 8; `after` 8 in all 15.

## Limits

- Cache write is not comparable per run: runs in the same round share an
  identical prefix, so the first run of an arm pays the write and the others
  read it (median 0 on most cases). Cost has the same problem, which is why the
  verdict rests on total input, output and words.
- Reports were already short: the caps (300 to 500 words) bind, and the agents
  returned 200 to 350 words. A workload whose reports overrun the caps could
  still show a saving; this one cannot.
- The noise line is read off one control (about 6% on words, 0% on output),
  which does not bound the 27% and 31% output moves in sweep and scope; those
  are called unresolved, not noise.
- One fixture, one main-session model (Sonnet), five runs a side, so a
  difference near 10% is not resolved. The scope and sweep ranges are wide.
- Main-session input growth after a report lands was not measured
  separately; the `total_cost_usd` and the returned-report word counts stand
  in for it.

The harness (driver, fixture generator, analysis scripts) was throwaway and is
not kept; the method above is enough to rebuild it.
