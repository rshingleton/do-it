---
name: test-it
description: Build behaviour test-first, one failing test at a time, at agreed test seams, with tests that survive refactoring. Use when building a feature or fixing a bug test-first, when the user mentions TDD or red-green, or when asked to add integration or regression tests.
---

# test-it

Red, then green, one thin slice at a time. The aim is not coverage: it is a
small set of tests that pin down what the code promises and keep passing
while its insides change.

Name tests and fixtures in the project's own domain words (the glossary in
session context), and stay inside the decisions its ADRs record.

## Where the tests sit

Tests go through a module's interface at a seam, in the sense
[design-it](../design-it/SKILL.md) defines (the place where an interface sits
and behaviour can be swapped), and nowhere deeper.

- **Seams already agreed** (`build-it` passes the plan's `## Seams`): test at
  exactly those. Do not ask the user to confirm them again.
- **No agreed seams** (a standalone run): propose them before the first test,
  each with one line on what a test there catches and what it lets through.
  Confirm once, then go. Agreeing seams first is what puts the effort on
  risky logic instead of on every trivial path.
- **The seam itself looks wrong** (too shallow, leaking internals, nowhere
  natural to put it): call the Skill tool with "design-it" for the module and
  interface vocabulary, and settle the shape before writing tests.

## The loop

1. Pick the next behaviour, the thinnest one that teaches you something.
2. Write one test at a seam that fails for the right reason. Run it; see the
   failure message you expected.
3. Write the least code that turns it green. Nothing for the test after next.
4. Run the whole relevant suite, then go back to 1.

Each slice cuts through every layer it needs (a tracer bullet), so the next
test is chosen with what the last one taught you. Writing every test up
front and then all the code locks in a guess about the design before the
code has had a say.

Cleaning up structure is not a step in this loop. Note it and leave it for
review (`review-it`) or a separate change.

## A keeper test

- Exercises behaviour a caller can observe, through the seam.
- Reads as a statement of fact about the system ("an expired coupon is
  refused at checkout"), not a description of the code path.
- Gets its expected value from somewhere independent of the code: a literal,
  a worked example, the spec. Never recompute the answer the way the code
  does.
- Breaks when behaviour breaks, and only then.

[tests.md](tests.md) shows keepers next to the usual failures.
[mocking.md](mocking.md) covers what to fake, and how to shape a boundary so
faking it is easy.

## Smells that mean start the test again

- It fails after a refactor that changed no behaviour.
- It mocks a module you own, asserts call order, or reaches a private member.
- It checks the result through a side door (reads the table directly) instead
  of through the interface that promised it.
- It cannot fail, because it asserts what the code computes by the same
  method.
