# Building the loop

Stage 1 of [debug-it](SKILL.md). Try these roughly in order; earlier ones are
cheaper and sharper.

| # | Loop | Fits when |
|---|------|-----------|
| 1 | A failing test at the nearest seam that reaches the bug | Almost always; start here |
| 2 | A scripted HTTP call against a local server | The symptom is a response |
| 3 | The CLI run on a fixture, output diffed against a known-good copy | The symptom is output |
| 4 | A headless browser script asserting on the page, console or network | The symptom is in the UI |
| 5 | A captured request, payload or event replayed through the code alone | The bug came from real traffic |
| 6 | A minimal harness: one service, faked neighbours, one call | The full system is too heavy to run |
| 7 | Many random inputs, checking a property | The output is only sometimes wrong |
| 8 | `git bisect run` over a check script | It worked at some earlier commit, version or dataset |
| 9 | The same input through two versions or configs, outputs diffed | Something changed and nobody knows what |
| 10 | `scripts/hitl-loop.template.sh` walking a person through the steps | Only a human can trigger it; last resort |

## Make it tighter

Once a loop exists, improve it like a product:

- **Faster:** cache setup, skip unrelated start-up, narrow the test scope.
- **Sharper:** assert on the exact symptom, never just "did not crash".
- **Steadier:** freeze the clock, seed randomness, isolate the file system,
  stub the network.

A two-second loop that always gives the same answer is worth far more than a
thirty-second loop that sometimes does.

## Intermittent bugs

Aim for a higher failure rate, not a perfect repro. Run the trigger hundreds
of times, in parallel, under load, with sleeps or yields inserted to widen
the timing window. Half the runs failing is workable; one in a hundred is
not yet, so keep raising it.

## When no loop is possible

Say so plainly and list what was tried. Then ask for one of: access to an
environment where it happens; a redacted artifact (HAR file, logs, core dump,
a timestamped screen recording); or permission to add temporary
instrumentation where it happens. Do not move on to hypotheses without a
loop.
