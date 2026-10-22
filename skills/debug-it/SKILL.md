---
name: debug-it
description: Find and fix the cause of a hard bug or performance regression by first building a command that reproduces it on demand, then testing ranked hypotheses against it. Use when something is broken, throwing, failing, flaky, or got slow since a change and the cause is not obvious, when the user says debug or diagnose.
---

# debug-it

Hard bugs are not found by reading code harder. They are found by getting a
signal that turns red on this bug and green when it is gone, then letting
that signal decide between explanations. Skip a stage only when you can say
why it does not apply.

Read the area's context (it-core) and its ADRs first, so the modules and words
you reason with are the project's own.

## Keep secrets out of the evidence

Everything here gets shown: commands, outputs, captured requests. Replace any
secret with `<REDACTED>` before it appears. Pass credentials through
environment variables so the loop itself never contains them, and quote only
the lines of a captured artifact that carry the signal. If the redacted
evidence is too thin to diagnose from, say so and ask.

## 1. A loop that goes red

This stage is the job; the rest is bookkeeping once it exists. Put most of
the effort here and keep going until there is one.

[LOOPS.md](LOOPS.md) lists ways to build one, cheapest first, and what to do
when the bug is intermittent or no loop seems possible.

The stage is finished only when you can name one command, already run with
its (redacted) output shown, that is:

- [ ] **on target**: it drives the real code path and checks the symptom the
      user reported, so it can fail on this bug and pass once fixed;
- [ ] **repeatable**: same verdict each run, or, for a flaky bug, a pinned and
      high failure rate;
- [ ] **quick**: seconds;
- [ ] **unattended**: you can run it yourself; a person in the loop only
      through `scripts/hitl-loop.template.sh`.

Catching yourself building a theory from the code before that command exists
is the signal to stop and go back to the loop.

## 2. Reproduce, then shrink

Run it and watch it fail. Check that it fails the way the user described, not
in some nearby way, that it fails on more than one run, and record the exact
symptom (message, wrong value, timing) to compare against later.

Then cut the scenario down: remove inputs, callers, config, data and steps one
at a time, rerunning after each cut, and keep only what the failure needs.
A small repro leaves fewer suspects and becomes the regression test later.
Shrinking is done when removing anything left makes the loop pass.

## 3. Ranked hypotheses

Write three to five explanations before testing any, most likely first. One
idea alone tends to become the only idea. Each must predict something
checkable:

> If <cause>, then <change A> makes the bug vanish and <change B> makes it worse.

An explanation with no prediction gets sharpened or dropped. Show the list to
the user before testing; they often know what changed recently or what has
been ruled out. If they are away, go with your ranking.

## 4. Probe

Each probe tests one prediction and changes one thing. How to probe without
leaving a mess, and the different approach for slowness:
[INSTRUMENT.md](INSTRUMENT.md).

## 5. Fix behind a test

Before fixing, look for a seam where a test reproduces the real failure
pattern as it happens in use. A seam too shallow to show it (one caller when
the bug needs two, a unit when the bug lives in the chain) gives false
comfort. No honest seam is itself a finding: report it as an architecture
problem rather than writing a hollow test.

With an honest seam: turn the shrunken repro into a failing test there, watch
it fail (if you forced the failure by editing code or data, diff against a
clean copy to prove the edit took), apply the fix, watch it pass, then rerun
the stage 1 loop on the original, unshrunk scenario.

## 6. Leave it clean

- [ ] The stage 1 loop now passes on the original scenario.
- [ ] The regression test passes, or the missing seam is written down.
- [ ] No probe left behind: grep the debug tag and remove every hit.
- [ ] Throwaway harnesses deleted or parked somewhere clearly marked.
- [ ] The explanation that proved right goes in the closing message (and the
      commit or PR text when there is one), so the next person learns it.
