---
title: OpenCode 2 foreground subagents hang the main agent until backgrounded
type: bug
status: open
source: user
---

## Context

User report (2026-10-27), OpenCode 2.x: "When spawning agents, the main agent seems to hang until forcing the agents into the background, and then they will complete, sometimes right away."

Known from `docs/research/opencode-v2-docs-sweep.md`: v2 subagents run in child sessions, foreground or background, through the `subagent` tool (args: agent id, `description`, `prompt`, optional `background`). There is no subagent hook. Our skills say "start the `it-reviewer` agent" and never say foreground or background; `skills/build-it/PARALLEL.md` assumes background subagents are available.

## Problem

A foreground subagent call appears to block the parent indefinitely, and backgrounding it lets the child finish, sometimes at once. Not diagnosed. Hypotheses, none checked:

- The child is waiting on a permission `ask` the user cannot see while the parent is blocked (custom subagents use only their own permissions; `it-*` agent files carry a `permissions` block, and the base policy may still ask for `shell` or `external_directory`).
- A foreground child that itself calls the `subagent` tool, or a skill that nests agents, deadlocks the parent.
- The usage and context hooks in `.opencode/plugins/do-it.mjs` (the `context` hook runs per request; the subscribe loop is never aborted, T117) stall the child session.

## Acceptance

- A repro on OpenCode 2.x: one `it-*` agent started from a do-it step, foreground, with what the session shows while it hangs (a pending permission, a stuck tool call, or nothing)
- The cause named, and either a fix in the agent files or plugin, or the skill text telling the parent how to start agents on OpenCode (for example `background: true`, then wait for the result)
- A test or documented check pins the fix; `npm test && npm run check` pass

## Notes

Related: T115 (OpenCode 2 event shapes unchecked on a live run), T117 (`ctx.event.subscribe` signal never aborted), `docs/research/opencode-v2-docs-sweep.md` lines 28 to 31 and 79, `skills/setup-it` opencode check (R20). Ask the user which agent, which step and whether a permission prompt was showing.

## Findings (2026-10-27, OpenCode 2.1.2)

- No repro. Headless `opencode run --standalone -m ollama/gpt-oss:20b`, do-it plugin loaded from the global config, asked to start `it-scout` with `background: false`: two foreground `subagent` calls completed and the parent replied (about 90 s total, mostly model time).
- `opencode debug agents` shows v2 converts the generated `permission` map for `it-scout` into a rules list (`bash` becomes `shell`, deny-all then the grants), so the hypothesis of a leftover `ask` for `shell` or `external_directory` does not hold for the scout. Not checked for the other `it-*` agents or for a read of `.env` (base policy asks, later allow wins).
- The default model's key (`opencode-go`) has expired, so a run on the user's usual model was not possible. A local model may not hit the same path.
- Still needed from the user: which agent and step hung, which model, TUI or `run`, and whether a permission prompt was showing.
- Update, after the key was renewed: foreground `subagent` calls (`background: false`) completed on `opencode-go/claude-haiku-5-5`, `opencode/big-pickle`, `opencode/beam-free` and `opencode-go/mimo-v2.6-flash`, one `it-scout` call each and parallel `it-reviewer` + `it-builder` or `it-skeptic` pairs, 7 to 27 s per run. The default model is refused by a workspace privacy setting ("trains on request data"), so it was not run. Still no repro; the hang needs the user's session details above.
- Cause (user report plus runs): a foreground `subagent` call blocks the parent until the child ends, by design, and our skills never said to background. `background: true` returns at once with "You will be notified automatically when it finishes. DO NOT sleep, poll" (verified on 2.1.2, `opencode/beam-free`). Two `opencode run` attempts stalled before creating any session; that was a startup stall, not the subagent path, and was not diagnosed.
- Fix: `skills/skill-it/SKILL-MECHANICS.md` (Subagents) now tells OpenCode to pass `background: true` for background-marked and parallel agents and not to poll; pinned by a test in `tests/opencode-gen.test.mjs`. `npm test && npm run check` pass. The TUI itself was not driven, so the user should confirm a build-it parallel batch no longer blocks.
- Enforcement (verified on 2.1.2): `execute.before` for `subagent` can set `event.input.background`, and the host honours it. A message's calls fire their before hooks in the same tick, so `.opencode/plugins/do-it.mjs` registers each call under its `messageID`, yields one tick, and backgrounds a call that has a sibling. A lone call stays foreground. Pinned by a test in `tests/hook-trust.test.mjs`. Live: two parallel calls made with `background: false` both returned "working in the background".
- The installed copy at `~/.local/share/do-it` is older and has the same plugin id, so it loads first and shadows the repo copy; update it to get the rule.
- Headless `opencode run` sometimes sat silent until killed, mostly when children ran in the background, and finished when run with `--print-logs`. Not diagnosed; the disabled `intellij` MCP was not the cause.
