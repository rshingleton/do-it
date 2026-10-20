# Plan checks before approval

Two passes run between writing the plan and showing it. Neither adds a user
turn: anything only the user can answer joins the approval turn (§5).

## 1. Analyze (read-only consistency)

Run it yourself, right after the plan is written. Lane S does the first three
checks; lane M does all of them.

| Check | Fails when |
|-------|------------|
| Coverage, forward | A done-when line, a source's acceptance item or a roadmap `Covers` id has no step or phase that delivers it |
| Coverage, back | A step or phase serves nothing in done-when, the sources or `Covers` (scope creep; move it to Non-goals or justify it) |
| Verifiable | A step has no `→ verify:` check, or the check is not observable ("works", "looks right") |
| Names | A term differs from the area's `CONTEXT.md`, or the same thing is named two ways across phases |
| Blocks | `blocked_by` has a cycle, or a block only restates order |
| Rules | The plan contradicts it-core, an accepted ADR, or a guard-it rule (secrets, env files, `.compliance-rules/`) |

A **Rules** failure is CRITICAL: change the plan, or raise it with the user
as a decision. Fix every other failure in the plan before going on. Record
nothing about the pass in the plan; the fixed plan is the record.

## 2. Builder check (fresh eyes)

Start one subagent with only the plan file(s) and its `sources:`, never the
grill conversation. Brief:

> You will build this plan alone and cannot ask anyone. Read it and the code
> it points at. List the questions you would need answered before or during
> the build, most blocking first, each with where it arises (step or phase)
> and your best guess. Under 300 words.

Sort each question it returns:

| The answer | Do |
|------------|----|
| Is in the code, docs, ADRs or sources | Fix the plan so the next reader does not ask |
| Is a reversible default (it-core's assume-or-ask) | Decide it and add it to `assumptions:` (`work.mjs set`) |
| Needs the user (intent, scope, money, credentials, irreversible) | Put it, with your recommended answer, in the approval turn |

Lane S runs the builder check only when the plan has more than three steps or
touches a risk area ([LANES.md](../do-it/LANES.md)). A host without
subagents: re-read the plan once as the builder yourself, and say the check
was done in the same context.
