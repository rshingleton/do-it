---
name: deepen-it
description: Find places where the code's structure makes change hard, show them as a visual report, then work through the one you pick.
argument-hint: "[area, module or pain point]"
disable-model-invocation: true
---

# deepen-it

Looks for **deepening opportunities**: spots where a shallow module, a leaky
seam or a pile of pass-throughs makes every change cost more than it should,
and where pulling the behaviour behind one smaller interface would fix it.
Read-only for code until the user picks a candidate and chooses to build it.

Call the Skill tool with "design-it" first and speak only its vocabulary:
module, interface, implementation, depth, seam, adapter, leverage, locality.
Domain names come from the project's glossary; accepted ADRs are settled
unless the friction is strong enough to argue for reopening one.

## 1. Choose where to look

Structure pays back where code keeps changing, so look there first.

- The user named an area or a pain: start there.
- Otherwise find the hot spots: the files that change most often
  (`git log --format= --name-only -n 300 | sort | uniq -c | sort -rn | head -30`)
  and the areas `sweep-it` or `prove-it` flagged under architecture notes.
- `docs/reference/` (from `map-it`) is the fastest way into an unfamiliar
  area; confirm what it says in the code.

## 2. Explore

Send an exploring subagent through the chosen area with the `design-it`
vocabulary and these prompts. It reports friction, not fixes:

- understanding one idea means hopping across many small modules;
- an interface is nearly as large as what sits behind it;
- logic was split into pure helpers for testing, but the bugs live in how
  they are wired together;
- callers reach past a seam into internals;
- the behaviour that matters most cannot be tested through any interface.

Run the **deletion test** on each suspect: delete it in your head. If its
complexity reappears in every caller, it was earning its place. If the
complexity simply moves, it is a pass-through and a candidate.

## 3. Report

Build one self-contained HTML page per [HTML-REPORT.md](HTML-REPORT.md),
written to the OS temp directory (never the repo), opened for the user, with
its absolute path in the reply. One card per candidate:

- the modules and files involved;
- the friction, in one sentence;
- the deepened shape, in one sentence (the shape, not the interface: that
  comes in step 4);
- the gains, as leverage, locality and test-surface wins;
- a before and after diagram side by side;
- a strength badge: `Strong`, `Worth exploring` or `Speculative`;
- an ADR callout when it argues against an accepted decision.

Close the page with a **top pick** and one sentence of why. Then ask which
candidate to work through, and end the turn.

## 4. Work through the pick

Call the Skill tool with "grill-it" for the chosen candidate: constraints,
what moves behind the seam, the adapters on each side, which tests survive
and which change. When two plausible interfaces compete, call the Skill tool
with "design-it" and use its design-it-twice comparison.

Keep the domain model current as it settles: call the Skill tool with
"name-it" when the deepened module needs a name the glossary lacks, a term
gets sharper, or the user rejects the candidate for a reason the next review
should not have to rediscover (offer an ADR then, and only then).

## 5. Hand off

Ask once how to carry the settled candidate:

- **Build it now:** read [do-it](../do-it/SKILL.md) and follow it, with the
  settled shape as the request and a note that the grill already happened, so
  `scope-it` records those answers as decisions and asks only what is open.
  `do-it` is user-invoked, so it is followed by path.
- **Later:** call the Skill tool with "log-it" (`source: deepen-it`), with the
  files, the friction, the settled shape and the strength in the body.
- **Neither:** stop; glossary and ADR changes already made stand.
