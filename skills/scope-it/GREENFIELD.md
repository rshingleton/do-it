# Greenfield agenda (new project)

A new project has no code to read, so its first plan decides what the code
will look like. Add these branches to the grill; for lane S, ask only the ones
the request leaves open.

## Decide

- **Purpose and first user.** The one job the first release must do, and for
  whom. Everything else is a non-goal for now.
- **Stack and runtime.** Language, framework, package manager, where it runs.
  Check org standards first: `AGENTS.md`, `.compliance-rules/`, a sibling
  repo the user names. Facts about a library or platform go to the `look-it-up`
  skill, not guesses.
- **Shape.** The first few modules and their seams, in the `design-it`
  vocabulary. Prefer one deep module over several shallow ones until a second
  adapter is real.
- **Data and integrations.** What is stored, what is called, what is secret.
- **Quality bar.** Test runner and levels, lint, format, type-check, CI.

## Record

Foundation choices usually pass all three ADR tests (hard to reverse,
surprising without context, a real trade-off): stack, persistence, deployment
shape. Write those as ADRs. Do not ADR defaults nobody would question.

## Phases

1. **Walking skeleton.** The thinnest end-to-end path: one entry point, one
   test, the build, lint and test commands working, CI running them. Ends with
   `AGENTS.md` naming those commands and the layout, `.do-it/config.env` for
   the tracker and lint command, and `.gitignore`.
2. **First vertical slice** of the purpose above, test-first at its seams.
3. Further slices as the grill found them.

The skeleton phase blocks every other phase. Its `→ verify:` is the commands
running green from a clean checkout.
