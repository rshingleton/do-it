# Build one phase in an agent

Keeps a phase's reads, edits and test output out of the main context. Main
sends one `it-builder` agent per phase and keeps only its short report.

## 1. The brief

Pointers, not pasted content:

- The absolute paths of the phase file, the plan README, `STANDARDS.md` and
  `skills/test-it/SKILL.md` (the agent cannot call a skill, so it reads it).
- The plan's `assumptions:`, and the cap: report under 150 words, naming any
  defect surfaced but not fixed.
- A worktree path when called from [PARALLEL.md](PARALLEL.md); none means
  in place at the checkout root, no commits.

## 2. What main does with the report

- `done`: `work.mjs verify-phase <id> <n> --brief -- "<commands>"`. Main owns
  every state-block write.
- `failed`: main may call the Skill tool with "debug-it" itself, then send
  the phase once more; a second `failed` is `blocked`.
- Anything else (`blocked`, `too-big`, `needs-confirm`, `ambiguous`,
  `regressed`): `work.mjs event <id> block "<why>" --phase <n>` and stop.
  Other phases that do not depend on it keep going.

## 3. When main builds instead

Lane S, fix mode, a host without subagents, or the user said to build in
main. Then follow §3 of [SKILL.md](SKILL.md) in the main context.

## 4. One at a time

Never start an agent beside other in-place work: two in the same checkout
would edit the same tree. Parallel phases get worktrees per PARALLEL.md.
