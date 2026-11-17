# Plan checks before approval

Two passes run between writing the plan and showing it. Neither adds a user
turn: anything only the user can answer joins the approval turn (§5).

## 1. Analyze (read-only consistency)

Run it yourself, right after the plan is written. Lane S does the first four
checks; lane M does all of them.

| Check | Fails when |
|-------|------------|
| Coverage, forward | A done-when line, a source's acceptance item or a roadmap `Covers` id has no step or phase that delivers it |
| Coverage, back | A step or phase serves nothing in done-when, the sources or `Covers` (scope creep; move it to Non-goals or justify it) |
| Verifiable | A step has no `→ verify:` check, or the check is not observable ("works", "looks right") |
| Contract | The plan has no `## Files` or `## Interfaces` section, or `## Files` lists no file, so no track can pair the slice; in lane M the README's `## Files` is the union of its phases' files, and `## Interfaces` stays at the README |
| Names | A term differs from the area's `CONTEXT.md`, or the same thing is named two ways across phases |
| Blocks | `blocked_by` has a cycle, or a block only restates order |
| Rules | The plan contradicts it-core, an accepted ADR, or a guard-it rule (secrets, env files, `.compliance-rules/`) |
| Locality | Lane M only: a phase file has no `## Files` or an empty one, the README's list is not the union of its phases' files, or two phases with no dependency path between them, direct or through other phases and in either direction, share a file |

The Contract check is a command, not a read: `node
skills/do-it/scripts/contract.mjs <plan file>` prints the two lists and exits 1
naming each missing section. For lane M it runs on the README, where `## Files`
is the union of the phases' files and `## Interfaces` stays at the README
([PLAN-FORMAT.md](PLAN-FORMAT.md)).

The Locality check is a command too: `phases.mjs` means `node <this skill's
directory>/scripts/phases.mjs`, and `phases.mjs <plan dir>` reads the README
and every `phase-*.md` beside it, and exits 1 naming each phase file with no
`## Files` or an empty one, each phase file and state phase that do not pair,
each path only on one side of the union, and each file two phases share with no
dependency path between them, direct or through other phases and in either
direction. A lane S plan has one list: give the command its plan file and it
says so.

A **Rules** failure is CRITICAL: change the plan, or raise it with the user
as a decision. Fix every other failure in the plan before going on. Record
nothing about the pass in the plan; the fixed plan is the record.

## 2. Builder check (fresh eyes)

Start one `it-reviewer` agent (mid-tier model) with only the plan file(s) and
its `sources:`, never the grill conversation. Brief:

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

## 3. Roadmap check (complete runs)

Once per roadmap, in the up-front sweep ([SWEEP.md](../roadmap-it/SWEEP.md)),
before the approval turn. Start one `it-reviewer` agent (mid-tier model) with
only the roadmap file and its decision log (`Decisions so far`, Open
decisions), never the grill conversation. Brief:

> You will build every slice of this roadmap in order and cannot ask anyone.
> List the questions that would come up across slices (a decision two slices
> read differently, a hidden order dependency, an unnamed shared interface),
> most blocking first, each with the slices it touches and your best guess.
> Under 300 words.

Sort each question with the three-way table in section 2. Cross-slice
questions a per-plan builder check cannot see are the point; a question about
one slice's internals waits for that slice's own check.
