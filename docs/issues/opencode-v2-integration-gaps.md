---
title: OpenCode v2 integration gaps
type: feature
status: closed
source: look-it-up
---

## Context

One place for every known OpenCode gap, folded from TODO T9 and two issues
filed on 2026-10-21. Research (checked 2026-10-21, medium confidence, no v2
binary run):

- `docs/research/opencode-v2-integration.md`: plugins, skills, commands,
  agents, config, and the farmage/opencode-skills comparison.
- `docs/research/opencode-v2-docs-sweep.md`: models, agents, permissions,
  instructions, usage, and a page-by-page sweep of opencode.ai/v2/docs.

Involves `.opencode/plugins/do-it.mjs`, `scripts/install.sh`,
`scripts/gen-opencode.mjs`, generated `.opencode/command/`, `agents/`, and
`hooks/lib/decide.mjs`. The cross-host usage record stays in
`docs/issues/per-step-usage-record-on-do-it-work-items.md`.

## Problem

The plugin, installer and generator target OpenCode 1. OpenCode 2 ignores the
v1 hook object, does not read `.claude/agents` or `CLAUDE.md`, has no model
tiers, and prefers `commands/`. Several v2 facts are unverified, so work
starts with a spike (step 1) before building.

## Acceptance

Work in this order; each step is one plan phase.

1. **Verify on a real OpenCode 2 binary** (blocks 2, 4 and the usage issue):
   - how `ctx.tool.hook("execute.before")` blocks a tool (throw, or a field),
     and what the model sees;
   - whether `permission.hook("evaluate")` receives the whole shell command or
     scanner-split pieces, and honours `effect: "deny"` plus `message`;
   - the `SystemPart` shape (`context` hook) and `Tool.Result` shape
     (`execute.after`);
   - whether a server plugin can read session usage (`cost`, `tokens`) through
     an API client, and which v2 events carry it;
   - whether a v1 (1.18.29 or later) accepts a default export carrying both
     `Plugin.define` fields and `server()`;
   - whether `instructions` accepts a file with YAML frontmatter, and whether
     v2 accepts Claude-style `tools:` or `model: sonnet` in an agent file.
   Record results in the research files.
2. **Plugin, T9.** One default export spreading `Plugin.define({id: "do-it",
   setup})` and keeping v1 `server()`. `setup` registers
   `ctx.session.hook("context")`, `ctx.tool.hook("execute.before")` and
   `"execute.after"` over the shared `decide()`, with the blocking mechanism
   from step 1. Check that v2 auto-loading `.opencode/plugins/do-it.mjs` inside
   this repo fails open. Tests cover both shapes.
3. **Agents for OpenCode.** Generate `.opencode/agents/it-<role>.md` from
   `agents/` with `mode: subagent`, a deny-all-first `permissions` list in
   place of `tools` (a custom subagent does not inherit its parent's
   permissions), and no `model` (v2 has no tiers or `small_model`; keep the
   tier in a comment, and let the installer map `it-*` to user-supplied
   `provider/model` ids only on request). Install them to
   `~/.config/opencode/agents/`. `gen --check` covers drift.
4. **Installer and generator.**
   - Emit and install `commands/` for v2 and keep `command/` for v1.
   - Decide between linking skills into `~/.agents/skills` and a `skills`
     array in the merged `opencode.json` (confirm v1 reads the key first).
     Duplicate skill IDs are not a problem: v2 dedupes by ID.
   - Consider an `instructions` entry for the static core posture so it
     survives a plugin failure; keep the `context` hook for dynamic text.
5. **Docs.**
   - Tell consumer repos that OpenCode reads only `AGENTS.md`, not `CLAUDE.md`.
   - Note that v2 has no todos or LSP by default, and allows
     `external_directory` by default.
   - Update `docs/DESIGN.md` section 8 and the "Not yet" list.
6. **Usage on OpenCode.** Per the usage issue: record `{agent, model, tokens:
   {input, output, reasoning, cache.read, cache.write}, cost_usd}` if step 1
   finds a plugin path to it; otherwise document the gap.

## Notes

- Optional, low value: farmage/opencode-skills `make dev-link` renames a real
  skill directory to `<name>.bak` before linking and restores on unlink.
- Do not adopt from farmage: its copy-based `install.sh` (stale copies,
  uninstall leaves commands), the plugin-cache doc (a Claude Code layout) and
  `MODELAGENTS.md` (copied superpowers text; repo rule: no copied text).
- Orgs can disable plugins through v2 `policies`; fail open already covers it.
- A command with `subagent: true` that runs a do-it skill which launches its
  own agents breaks at the default subagent depth of 1.

## Log

- 2026-10-21: closed
