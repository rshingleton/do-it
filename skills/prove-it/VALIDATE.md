# Validating Must findings

A reviewer that found a problem is the worst judge of whether it is real. Before
a **Must** counts, a fresh `it-reviewer` agent (mid-tier model) tries to
confirm it from the code alone. Should and Nice findings skip this step: they never block.

## Who gets what

One validator (an `it-reviewer` agent, mid-tier model) per batch of up to
five Musts. For each finding it gets only:

- the claim, in one sentence ("`settle()` charges twice when the gateway times
  out");
- the concrete case the finding named (file and line, input, or scenario);
- pointers: the diff command, the files involved, the plan path when the
  finding is about the spec.

Never the reviewer's reasoning, the other findings' text, or the build
conversation. The validator starts cold on purpose.

## The brief

> For each claim, check the code yourself. Confirm it only if you can show it:
> the lines that cause it, the input or state that triggers it, and what goes
> wrong. Reject it if the code does not do what the claim says, if the case
> cannot happen (a guard, a type, a caller that never passes it), if a
> recorded decision in the plan or an ADR covers it, or if a linter already
> catches it. One line per claim: `confirmed | file:line | evidence` or
> `rejected | reason`. Under 40 words a line.

## Using the answers

- `confirmed`: the finding stays a Must, with the validator's evidence added to
  its case.
- `rejected`: the finding is dropped from the Must group and listed under
  **Not confirmed** in the report with the validator's reason, so the user can
  overrule it. It does not block.
- A failed mechanical check (a test, lint or type-check command that exited
  non-zero) needs no validator: the command output is the evidence.

Every audit round validates its Musts afresh; a confirmation from an earlier
round does not carry over.
