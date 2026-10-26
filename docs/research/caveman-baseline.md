# Caveman terse contracts: token baseline

Measures whether the voice block and report contracts (work item
`apply-caveman-terse-contracts-to-internal-agent-communicatio`) save tokens.
Single workload, one run per side, so the numbers catch a regression or a
large win, not a small one.

## Workload

Three read-only agents started from the main session, briefs verbatim. The
lane-S dry run in the plan is dropped: it writes files and is hard to repeat.

| Agent | Brief |
|-------|-------|
| `it-scout` | Where does the hook decide which subagent types skip the coding posture, and what does each branch inject? Give paths and line numbers. Under 150 words. |
| `it-reviewer` | Review commit 7ae5158 (git show 7ae5158) against its own message: does the change do what the message says? One finding per line. Under 200 words. |
| `it-skeptic` | Claim: in hooks/claude.mjs, read-only subagent types never receive any voice or style rules from the hook. Try to prove it false. Under 150 words. |

Repeat on the same commit's tree (checkout `7ae5158` content for the review
brief; the briefs name it). Each brief starts with a marker word
(`BASELINE-...`; use `AFTER-...` the second time) so the transcripts can be
found with `grep -l`.

## Method

`usage-snapshot` (below) sums the `usage` fields of a subagent transcript
under `~/.claude/projects/<repo>/<session>/subagents/agent-*.jsonl`, once per
distinct API message. Columns: input, cache write, cache read, output.
Cost-relevant: output and cache write; cache read is cheap and grows with
turns.

## Before

Date 2026-10-21, repo at `7ae5158` plus the uncommitted plan files; no
agent, hook or skill change yet.

| Agent | Turns | Input | Cache write | Cache read | Output |
|-------|-------|-------|-------------|------------|--------|
| it-scout | 4 | 8 | 12569 | 28382 | 65 |
| it-reviewer | 4 | 8 | 17728 | 39002 | 69 |
| it-skeptic | 6 | 12 | 15653 | 56089 | 70 |

Read: outputs are about 70 tokens each (the transcript counts only what the
API reported at each turn, and the final answers are 100 to 150 words), so
reports are already short. Almost all the cost is the injected context
(about 12k to 18k cache write per agent) and re-reading it each turn. That
predicts: voice rules alone will save almost nothing, and the injected block
adds to the cache write. The saving, if any, must come from fewer turns and
less reading.

## After

Date 2026-10-21, same briefs with `AFTER-` markers, after phases 1 to 3
(voice block in each agent file, report contracts and caps).

| Agent | Turns | Input | Cache write | Cache read | Output |
|-------|-------|-------|-------------|------------|--------|
| it-scout | 3 | 6 | 12638 | 17883 | 51 |
| it-reviewer | 5 | 10 | 20374 | 53628 | 75 |
| it-skeptic | 4 | 8 | 11213 | 27399 | 52 |

| Total | Turns | Cache write | Cache read | Output |
|-------|-------|-------------|------------|--------|
| Before | 14 | 45950 | 123473 | 204 |
| After | 12 | 44225 | 98910 | 178 |
| Change | -14% | -4% | -20% | -13% |

## Verdict

Not proven (still the verdict; see the follow-up at the end of this section). The totals moved the right way, but one run per side cannot
separate the change from variance: the biggest movers (cache read, 37% down
for scout, 51% down for skeptic, 37% up for reviewer) track how many turns
each agent happened to take, not the text. Cache write, the cost of the
injected context, is flat to slightly down: the voice block (about 200
tokens) did not show up as a cost, because it went into the agent file in
place of the reviewer's own two rules and the hook skips `it-*`. Outputs
were already about 70 tokens, so the shape and caps had little to trim on
these briefs.

Kept: the contracts and caps cost nothing measurable and guard against the
long reports (prove-it, review-it, builder) this workload does not exercise.
To settle it, repeat on a workload with longer reports, several runs per
side, or land `per-step-usage-record-on-do-it-work-items` and compare real
work items.

Follow-up 2026-10-26: [terse-voice-ledger.md](terse-voice-ledger.md) compares
418 real `it-*` runs in the usage ledger before and after the change. Still
not proven: the only clean comparison (`it-reviewer`, same day) is flat on
turns and output and within about 10% on cache, and the rest is confounded by
the work mix.

## Appendix: usage-snapshot

```js
// usage: node usage-snapshot.mjs <session.jsonl> ; sums usage per main transcript and each sibling subagents/agent-*.jsonl
import fs from 'node:fs'; import path from 'node:path';
const main = process.argv[2];
function sum(file) {
  const t = { turns: 0, input: 0, cache_write: 0, cache_read: 0, output: 0 };
  const seen = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    const u = j.message?.usage; if (!u) continue;
    const id = j.message.id ?? j.uuid; if (seen.has(id)) continue; seen.add(id); // one API message can span lines
    t.turns++; t.input += u.input_tokens ?? 0; t.cache_write += u.cache_creation_input_tokens ?? 0;
    t.cache_read += u.cache_read_input_tokens ?? 0; t.output += u.output_tokens ?? 0;
  }
  return t;
}
const rows = [['main', sum(main)]];
const dir = path.join(path.dirname(main), path.basename(main, '.jsonl'), 'subagents');
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
  let type = f; try { type = JSON.parse(fs.readFileSync(path.join(dir, f.replace('.jsonl', '.meta.json')), 'utf8')).agentType ?? f; } catch {}
  rows.push([type, sum(path.join(dir, f))]);
}
console.log('who\tturns\tinput\tcache_write\tcache_read\toutput');
for (const [w, t] of rows) console.log([w, t.turns, t.input, t.cache_write, t.cache_read, t.output].join('\t'));
```
