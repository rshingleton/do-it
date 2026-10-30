# Non-interactive scope-it (complete runs)

Used when a run record exists for the slice's roadmap
(`docs/planning/<roadmap-slug>.run/RUN.md`, `work.mjs run show <slug>`) and its
level is `full` or `ultra`. At `lite` follow the normal grill instead. The up-front
sweep ([SWEEP.md](../roadmap-it/SWEEP.md)) already settled the decisions, so this
plan asks no question and ends no turn for an answer.

## Steps

1. Skip the grill. Read the roadmap's `Decisions so far` and the run record's
   `assumptions`; treat each as an answer.
2. Scout the code and ADRs for the rest, as in the normal path.
3. A new unknown, sorted by it-core's assume-or-ask:
   - Reversible and low impact: decide it, add it to the plan's `assumptions:`
     and to the run record (`work.mjs run add-assumptions <slug> <id> '<json>'`), with a
     stop-if-wrong note.
   - Fails assume-or-ask (irreversible, scope, money, credentials, data loss),
     or is an `ask-when-reached` decision: do not ask. Park the slice with
     `work.mjs run slice <slug> <id> parked --needs decision --reason "<the question>"`
     and return `blocked`.
4. Write the plan and run [CHECKS.md](CHECKS.md). Builder-check questions that
   need the user park the slice the same way; the rest are fixed or assumed.
5. Approve the plan yourself: the roadmap approval covered it. Run
   `work.mjs event <id> approve --brief`, then return `done`.
