---
name: sketch-it
description: Build a throwaway sketch that settles one design question, either a clickable model of some logic or several competing layouts of a screen, then record the answer and remove the sketch. Use when a state model, rule set or data shape needs to be felt before it is built, when the user wants to compare what a page could look like, or when scope-it hits a decision nobody can settle on paper.
---

# sketch-it

A sketch is code written to be thrown away. It exists to answer one question,
and its only lasting output is the answer.

## 1. Name the question

Write the question as one sentence before any code: "Can an order be
refunded after a partial shipment without double-counting stock?" A sketch
without a written question drifts into a prototype of everything.

Then pick the branch:

| The question is about | Branch |
|-----------------------|--------|
| Behaviour: states, transitions, rules, data shape, an API's feel | [LOGIC.md](LOGIC.md): one HTML file that drives a pure model with buttons |
| Appearance: layout, hierarchy, what a screen should show | [UI.md](UI.md): two to five structurally different variants on one route |

Unsure which: the area decides. A service or domain module points to logic; a
page or component points to UI. Record the choice as an assumption in the
sketch's header and carry on.

## 2. Ground rules

- **Labelled as a sketch.** Place it beside the code it informs and put
  `sketch` in its file or route name, so nobody mistakes it for product code.
- **One command or one double-click to run.** Nothing to configure.
- **Memory only.** No real database, queue or external call unless the
  question is about that very thing; then use a scratch store named so it is
  obviously disposable.
- **No polish.** No tests, no error handling beyond what keeps it running, no
  abstractions. Speed of learning is the point.
- **State on screen.** After every action or variant switch, show the state
  that matters, so the person driving it sees cause and effect.
- **Uncommitted.** Per `it-core`, the sketch stays in the working tree; it is
  never part of a do-it commit.

## 3. Hand it over

Give the user the file path or URL and the variant keys. The useful moments
are surprises: "that should not be allowed", "I want the header from B with
the list from C". Adjust the sketch when they ask; it is cheap.

## 4. Record the answer, then remove the sketch

The answer outlives the sketch; the sketch does not.

1. Write the verdict: the question, what was tried, what was decided and why.
   - Inside a do-it work item: add it to the plan's `## Decisions` (it is an
     approved decision for `scope-it`).
   - A domain term or a hard-to-reverse choice came out of it: call the Skill
     tool with "name-it" for the glossary entry or an ADR.
   - Neither: put the verdict in the closing message.
2. Keep what proved itself, rewritten properly: a pure logic module can move
   into the real code with tests; a winning layout is rebuilt in the real
   page, not promoted from the sketch.
3. Delete the sketch files and any sketch route, and say so. If the user
   wants it kept for reference, move it to a clearly named scratch location
   outside the shipped code and name that path.
