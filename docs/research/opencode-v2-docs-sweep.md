# What do the full OpenCode v2 docs say that affects do-it: models and tiers, agents, and gaps in the OpenCode integration?

Answer: v2 has no model tiers and no `small_model` (it maps only to the `title` agent), so cheap/mid/top cannot be expressed portably in agent files; the portable choices are to omit `model` (agent inherits the parent) or to let the user or a plugin set `provider/model#variant`. Our five agents can be generated as `.opencode/agents/it-*.md` with `mode: subagent`, a `permissions` list instead of `tools`, and no pinned model. Newly found gaps: v2 does not read `CLAUDE.md`, does not read `.claude/agents`, a custom subagent does not inherit parent permissions, subagent depth defaults to 1, and per-step cost and tokens exist in the server API (not in a documented plugin hook). Confidence: medium (all from docs pages; no v2 binary was run, and hook blocking semantics are still undocumented).

Versions: OpenCode v2 docs as served at opencode.ai/v2/docs on 2026-10-21; pages carry no version stamp (the earlier note saw `ghcr.io/anomalyco/opencode:2.0.0` and tag v2.1.2). Checked: 2026-10-21.

## Findings

Sources say (URL, section):

### Models

- Selector format is `provider/model` with optional `#variant`; provider ends at first `/` and cannot contain `/` or `#`; model may contain `/`; IDs are case-sensitive and must be catalog IDs. https://opencode.ai/v2/docs/models/ (Model ID Format).
- Default model: root `model` key, provider and model only, no variant. If it is not enabled or its provider is missing, OpenCode falls back to the newest available supported model. A model chosen in the session overrides the default. Same page (Default Model, Selection Precedence).
- Agents and commands can set their own model; the models page defers to those pages. Root, agent and command `model` also accept an object `{providerID, model, variant}`. Same page (Object Form).
- Command precedence: command `model`, then the command's agent model, then the session model. https://opencode.ai/v2/docs/commands/ (Agent, model, and subagent fields).
- Agent model: a subagent uses its configured model, else inherits the parent session's model. https://opencode.ai/v2/docs/agents/ (Options, model).
- Variants are per-model named option sets (reasoning effort, budgets) from catalog metadata; `low`/`high`/`max` are not universal; an unknown variant is a model-resolution error. Custom variants live under `providers.<p>.models.<m>.variants[]`. Models page (Variants).
- The models page has no `small_model`, no tier, no cost or recommended-model content. https://opencode.ai/v2/docs/providers/ also lists no tier or small-model setting.
- `small_model` (v1) now only selects the built-in `title` agent's model; v2-native is `agents.title.model`. https://opencode.ai/v2/docs/migrate-v1/ (Provider filters, updates, and small_model).
- `modelID` aliases: the `models` map key is the ID OpenCode uses and `modelID` is what is sent upstream, so a user can define `openai/coding-default`. Models page (Aliases), providers page. Model `cost` is per-million-token USD pricing tiers by context size, not a quality tier. https://opencode.ai/v2/docs/api/ (Config.Model.CostEncoded).
- A plugin can read `ctx.model.list()`, `ctx.model.default()`, `ctx.provider.list()`, and `ctx.agent.list()/get()`; transform editors can update agents and models. https://opencode.ai/v2/docs/build/plugins/ (Agents and models).

### Agents

- Files: `.opencode/agents/<name>.md` and `~/.config/opencode/agents/<name>.md`; nested path becomes the ID (`team/reviewer`). Markdown body is the system prompt; frontmatter takes the same fields as the JSONC `agents` entry. https://opencode.ai/v2/docs/agents/ (Locations, Formats).
- Frontmatter fields: `description` (the model uses it to pick a subagent), `mode` (`primary` default, `subagent`, `all`), `model`, `system` (JSONC only), `permissions`, `steps`, `hidden`, `color`, `disabled`, `request` (preserved but not yet sent in v2). Deprecated: `temperature`, `top_p`, `prompt`, `permission`, `tools`, `disable`, `maxSteps`. Same page (Options).
- Permissions: ordered list of `{action, resource, effect}`; wildcards; last match wins; effects `allow|ask|deny`; actions include `shell`, `edit`, `subagent`, `read`, `glob`, `grep`, `webfetch`, `websearch`, `skill`. Agents page (permissions); https://opencode.ai/v2/docs/permissions/ (Rule syntax, Actions). No match means `ask`.
- Agent rules are appended after global rules and do not replace them; "a custom subagent uses only its own permissions" and does not inherit a subset of its parent's. Base policy for every agent allows all except asking before `.env` reads. Permissions page (Per-agent rules, Defaults).
- Built-ins: `build`, `plan` (primary); `general`, `explore` (subagent); hidden `compaction`, `title`, `summary`. "V2 has no built-in `scout` agent." Defining an agent with a built-in ID overrides it. `general` cannot launch subagents. Agents page (Built-in Agents).
- Subagents: run in child sessions with fresh context, foreground or background, launched through the `subagent` tool (args: agent ID, `description`, `prompt`, optional `background`; returns a `sessionID` to continue the child). Only `mode: subagent` or `all` qualify. Default nesting depth is 1 (`experimental.subagent_depth`). The parent's `subagent` permission rules (resource = agent ID) gate which agents it may launch. https://opencode.ai/v2/docs/tools/ (subagent); agents page (Modes); https://opencode.ai/v2/docs/config/ (Experimental keys).
- Skills have no agent field: the skills page lists `name`, `description`, `license`, `compatibility`, `metadata.opencode/autoinvoke`, `disable-model-invocation` only, and says nothing about launching agents. The agents page documents no `@`-mention or task invocation. Commands can set `agent:` and `subagent: true` (runs in a background child session, result reported to the parent; if omitted, a child is used only when the chosen agent has `mode: subagent`). https://opencode.ai/v2/docs/skills/, https://opencode.ai/v2/docs/commands/.
- v2 reads legacy agent frontmatter and converts it (migration table), but the loading dirs listed are `.opencode/agents/` (also `agent/`, `mode/`, `modes/`). No `.claude/agents` path is listed for agents, unlike skills. https://opencode.ai/v2/docs/migrate-v1/ (Agents).

### Migration page (new; the earlier note said it was 404)

- https://opencode.ai/v2/docs/migrate-v1/ exists, and so does https://opencode.ai/v2/docs/build/plugins/migrate-v1/.
- Permission action renames: `bash` to `shell`, `task` to `subagent`, `write`/`patch` to `edit`. `external_directory` is now allowed by default. Todos are off by default. LSP is accepted but v2 runs no language servers.
- `instructions`, `model`, `default_agent`, `formatter` keys unchanged. Plugins: V1 plugin implementations do not run in V2; both `.opencode/plugin/` and `plugins/` are discovered.
- Skills: both `.opencode/skill/` and `skills/` discovered; `skills.paths` and `skills.urls` merged into one `skills` array.
- Hook map (plugin migrate page): `experimental.chat.system.transform` to `session.hook("context")` editing `event.system`; `tool.execute.before/after` to `tool.hook("execute.before/after")`; `permission.ask` to `permission.hook("evaluate")`; `shell.env` to `shell.hook("create.before")`; `event` to `ctx.event.subscribe()`; `command.execute.before` has no global equivalent. `prompt` fires before prompt admission, `context` immediately before each agent model request; a change that must hit every model request needs `context`, `compaction`, `generate` and `title` registered separately.
- Blocking: the page's guard example throws inside `execute.before` to reject `.env` reads, "the same pattern as the V1 guard", but says it does not explain what a throw does and tells readers to verify in their target release.

### Instructions and rules

- Only `AGENTS.md` is read; "It doesn't fall back to `CLAUDE.md`." Global file is `~/.config/opencode/AGENTS.md`; project files discovered upward to home (or project root outside home), nearest first. The `instructions` array (paths, globs, `~/`, absolute, http(s) URLs with a 5-second fetch timeout) loads after `AGENTS.md`. Nested `AGENTS.md` below the workspace load when the agent reads that area. https://opencode.ai/v2/docs/instructions/ (Loading and precedence, The instructions config array); migrate page (Instructions and AGENTS.md).
- Prompt order: agent/provider system prompt, tool/MCP/skill guidance, `AGENTS.md` and `instructions`, date and environment, session API entries. After compaction the system prompt is kept and instruction files' current versions become the baseline. instructions page; https://opencode.ai/v2/docs/compaction/.
- The server API has per-session instruction entries (`session.instructions.entry.list/put/remove`). https://opencode.ai/v2/docs/api/ (session). Per-agent instructions and plugin injection are not covered on the instructions page.
- `https://opencode.ai/v2/docs/rules/` is 404; the rules content is the instructions page.

### Permissions, policies, plugin blocking

- `permission.hook("evaluate")` payload: `sessionID, agent?, action, resources, metadata?, source?, effect, message?`; it runs for `allow` and `ask` but not for an explicit configured `deny`. A deny rule or rejection from `ctx.permission.assert` rejects with a `Tool.Error` the model sees. https://opencode.ai/v2/docs/build/plugins/ (Permissions, Blocking a tool).
- The permissions page itself says nothing about plugin hooks. Shell resources are raw command text from a tree-sitter scanner (compound commands give several resources; any `deny` wins); a pattern ending ` *` also matches the bare command. The docs warn a narrow allowlist beats trying to block every dangerous command. Permissions page (Shell patterns).
- Policies (top-level `policies`, actions `provider.use`, `tool.use`, `integration.use`) run after permissions, can only deny, can block `subagent:<name>`, skills, MCP servers and `plugin:<pkg or path>`; managed and Console policies outrank project config. https://opencode.ai/v2/docs/policies/. A user org policy can disable our plugin; fail open already covers that.

### Usage, cost, tokens

- `ctx.session.hook` and `ctx.tool.hook` payloads show no usage fields; only compaction `result` may carry `tokens`. https://opencode.ai/v2/docs/build/plugins/ (Tokens, usage, and cost). Event types are not listed; schema name `V2EventEncoded`.
- The server API does expose them: `Session.Info` has `agent`, `model`, `parentID`, `cost` (USD), `tokens` (`TokenUsage.Info`: `input`, `output`, `reasoning`, `cache.read`, `cache.write`); assistant, compaction and similar messages also carry `cost`, `tokens`, `agent`, `model`. `GET /api/session/{id}/message` lists messages; `GET /api/experimental/session/stats` aggregates usage by model with `steps`, `tokens`, `cost`; `GET /api/experimental/session/{id}/log` streams durable events; sessions filter by `parentID`. https://opencode.ai/v2/docs/api/ (Session, SessionStats). The API page text is truncated in my fetch tool; I read the raw HTML text for the schema fields.
- The SDK and client pages show `opencode.sessions.prompt`, `events.subscribe()`, and `client.session` but no usage fields. https://opencode.ai/v2/docs/build/sdk/, https://opencode.ai/v2/docs/build/client/.
- `warming` sends real, token-spending keep-alive calls (off by default). https://opencode.ai/v2/docs/warming/.

### Other

- Skills: dedupe is by ID, later registration wins. Order lowest to highest: built-ins, `.claude/skills`, `.agents/skills`, global `~/.config/opencode/skills`, project `.opencode/skills`, explicit `skills` config. Users load a skill with `@skill-id`; model loads via `skill` tool by ID. https://opencode.ai/v2/docs/skills/ (Precedence, Invocation).
- Plugin config and discovery as in the earlier note; `opencode.config.policy` and `opencode.provider.opencode` cannot be removed; `opencode plugin add|list|check|update|remove` for global package plugins. https://opencode.ai/v2/docs/plugins/.
- `--model` for `opencode run` is shown on the models page; the CLI page lists `run`, `mini`, `service`, `debug paths` but not `--agent` or `--format`. https://opencode.ai/v2/docs/cli/.
- Logs: `~/.local/share/opencode/log/opencode.log`; `opencode service status`, `opencode api get /api/info`. https://opencode.ai/v2/docs/troubleshooting/.
- Command markdown supports `` !`cmd` `` shell injection that runs outside permission flow. https://opencode.ai/v2/docs/commands/.

Inference (mine, not stated by sources):

- Tiers. Because there is no tier concept and a hardcoded id breaks the "no hardcoded provider ids" rule, three portable options, in order of preference: (a) generated agents omit `model`, so all five run on the parent's model (correct and portable, but no cost saving); (b) generated agents carry an optional tier comment and the installer writes, only on request, an `agents` block into the user's `opencode.json` mapping `it-scout`, `it-reviewer`, `it-builder`, `it-planner`, `it-skeptic` to `provider/model` values the user supplies (env or flags, no ids in the repo); (c) a plugin that reads `ctx.model.list()` and sets agent models through an agent transform, picking cheap/mid/top by `cost` ordering. (c) is the only auto-tiering and is heavy and unverified (transform editor API not read, `cost` is context-tier pricing and may be missing for local models). Variants (`#low`, `#high`) could vary effort on one model but are not universal and error when unknown, so do not emit them.
- Generated mapping, per agent. Output `.opencode/agents/it-<role>.md` (and a `~/.config/opencode/agents/` install), body copied from `agents/it-<role>.md`:
  - `name` dropped (ID is the file name); `description` kept; add `mode: subagent`; `model:` omitted (see above); `hidden: false`.
  - `tools: Read, Grep, Glob, Bash` (scout, reviewer, skeptic) becomes `permissions: [{action:"*",resource:"*",effect:"deny"},{action:"read",resource:"*",effect:"allow"},{action:"glob",...allow},{action:"grep",...allow},{action:"shell",...allow}]`; since a custom subagent starts from the base allow-all policy plus only its own rules, the leading deny-all is required. Tools gone: `edit`, `subagent`, `webfetch`, `websearch`, `skill`; note Claude `Bash` allows writes, same as `shell`.
  - planner (`Read, Grep, Glob, Bash, Write, Edit`) adds `edit` allow; a path glob for the planning dir cannot be fixed at generation time, so keep the brief-level restriction as today.
  - builder (no `tools`, all tools) gets no `permissions` block beyond the base; keep `subagent` denied to stay within depth 1.
  - Claude `model: haiku|sonnet|opus` has no OpenCode form; emit nothing, and record the tier in a comment so a user can map it.
  - Reuse the existing voice block unchanged; the agent bodies mention `work.mjs` and brief paths, which are host-neutral.
- Skills naming an agent. v2 has no declarative link, so a skill must say, in prose, "launch the `it-scout` agent with the subagent tool". That already matches how our skills name agents for Claude (the Agent tool). The wording "subagent tool" differs from "Agent tool"; a short host-neutral phrase ("launch the it-scout agent") works for both. Depth 1 means a subagent cannot launch further agents; do-it skills run in the main session, so this holds, but a command with `subagent: true` running a do-it skill that itself spawns agents would break.
- Gaps newly found:
  - `CLAUDE.md` is not read in v2. do-it's own `CLAUDE.md` is only `@AGENTS.md`, so this repo is fine, but a consumer repo with only `CLAUDE.md` gets no project rules in OpenCode; our docs should say to add `AGENTS.md`.
  - `.claude/agents` is not an OpenCode agent path, so the current install (only `~/.claude/agents`) leaves OpenCode with no it-* agents; skills that name them will fail on OpenCode today.
  - Installer should write `~/.config/opencode/agents/` and, for commands, `commands/` (still `command/` works).
  - Instruction injection alternatives to the `context` hook: (1) `instructions: ["<clone>/skills/it-core/SKILL.md"]` in `opencode.json`, loaded after AGENTS.md and kept across compaction (SKILL.md has frontmatter and would be injected as is; a stripped copy under a generated path avoids that); (2) the `context` hook, which also reaches subagents because it fires on each agent model call and carries `agent`. (1) needs no plugin and works if the plugin fails; (2) can inject session context (project docs, state) that is dynamic. Keep the hook for dynamic text, consider (1) for the static posture.
  - Blocking: `permission.hook("evaluate")` is the only documented way to turn an action into a deny with a user-visible message (set `effect: "deny"`, `message`). It does not run for a configured `deny`, which is fine. Our `decide()` could back both `execute.before` (throw, undocumented) and `evaluate` (documented); using `evaluate` for shell and edit actions looks safer, but `resources` for `shell` are scanner-split commands, which may not preserve the whole command line our commit scan needs. Static `permissions` rules cannot replace our guards (no secret scan, no diff content), only coarse cases such as `git push *` ask.
  - Subagent hooks: still none. Child sessions have `parentID`, and tool and context hooks carry `agent` and `sessionID`, so per-agent behaviour is possible.
  - Usage issue (docs/issues/per-step-usage-record-on-do-it-work-items.md): the data exists server-side, not in plugin hooks. A plugin could read it through an in-process client or `GET /api/session/{id}/message` and `session/stats` after a step (inference: plugin context may expose an API client; the TUI plugin docs mention one, the server plugin docs read did not show it). Child sessions give per-subagent cost via `parentID` and `agent`. Claude Code has its own mechanism, so the work item record needs a host-neutral shape: `{agent, model, tokens:{input,output,reasoning,cache.read,cache.write}, cost_usd}`.
  - Policies and `opencode.config.policy` mean an org may block our plugin; keep fail-open.
  - Todos off by default and no LSP: skills that assume a todo tool or LSP diagnostics should not on OpenCode. `external_directory` is allowed by default, so our worktree-based `build-it` parallel path works without prompts, but any secret path guard relying on a prompt does not.
  - Skill dedupe answered: same ID from `.claude/skills` and `.agents/skills` resolves to one (the later source), so linking into both is harmless for resolution.

### Pages swept

All under https://opencode.ai/v2/docs/. Read in depth: agents, models, build/plugins, build/plugins/migrate-v1, migrate-v1, instructions, permissions, tools, skills, commands, config, plugins.

- `/` : product intro, install, links to config, plugins, MCP, commands. Nav list taken from page HTML.
- `agents/`: agent files, modes, permissions, built-ins.
- `models/`: model ids, variants, defaults, providers, aliases.
- `providers/`: models.dev catalog, custom providers, aliasing.
- `cli/`: run, mini, service, debug paths, uninstall.
- `cli/config`: `cli.json` TUI settings, separate from `opencode.json`.
- `cli/providers`: `/connect`, `auth login`, creds in server SQLite.
- `config/`: all top-level keys, precedence, substitution, experimental flags.
- `commands/`: command frontmatter, `subagent`, templates, shell injection.
- `skills/`: locations, IDs, precedence, `skill` permission.
- `instructions/`: AGENTS.md only, `instructions` array, no CLAUDE.md.
- `permissions/`: ordered rules, actions, defaults, approvals.
- `policies/`: deny-only org policies incl. plugins and subagents.
- `tools/`: built-in tool catalog, `subagent` and `skill` tools.
- `plugins/`: user-level plugin config, discovery, disabling.
- `mcp-servers/`: `mcp.servers`, Code Mode, permission matching.
- `compaction/`: auto compaction, system prompt survives.
- `references/`: named external dirs and repos for agents.
- `troubleshooting/`: service status, log path, API probe.
- `snapshots/`: undo and redo snapshots.
- `warming/`: opt-in keep-alive that spends tokens.
- `formatters/`: optional auto-format after write and edit.
- `network/`: proxy and CA settings.
- `attachments/`: file and image limits.
- `websearch/`: five search providers, `websearch` permission.
- `themes/`: TUI themes.
- `console/go`: OpenCode Go subscription, `opencode-go/<id>` models, dollar caps.
- `migrate-v1/`: v1 to v2 config, agent, command, permission, instruction changes.
- `build/`: index for plugins, client, SDK.
- `build/plugins/`: v2 plugin API, hook list, agents and models readers.
- `build/plugins/migrate-v1/`: v1 hook to v2 hook map.
- `build/plugins/cli/`: TUI plugins (`@opencode/plugin/tui`).
- `build/sdk/`: embedded host, sessions, events.
- `build/client/`: `@opencode/client`, streaming, plugin RPC.
- `api/`: 144 operations, session usage and stats schemas (read via raw HTML).
- `console/`, `build/plugins/rpc/`, `build/plugins/effect/`, `build/plugins/effect/rpc/`, `build/client/effect/`, `build/sdk/effect/`, `build/sdk/cloudflare/`: HTTP 200, listed in nav, not read (console, Effect and RPC variants and Cloudflare embed; low relevance).
- 404: `/v2/docs/rules/`, `/v2/docs/build/server/`. `/v2/docs/api` (no slash) returns 307 to `api/`.

## Open

- Whether `execute.before` throwing blocks the call and what the model sees; use a v2 binary. Docs say verify in your release.
- Whether `evaluate` receives the full shell command or scanner-split pieces, and whether setting `effect: "deny"` plus `message` works for plugin-defined decisions; needed before moving guards off `execute.before`.
- Whether a server plugin context exposes an API client or session read access for usage; the TUI plugin docs do, the server plugin docs read did not show it. Also the `V2EventEncoded` event type list (whether a step or message-completed event carries `cost` and `tokens`).
- Agent transform editor API (`ctx.agent.transform`) and whether a plugin can set an agent's model at load, for option (c) tiers.
- Whether v2 honours a Claude-style `tools:` comma string or `model: sonnet` in an agent file or rejects the file; test before claiming reuse of `agents/*.md` without generation.
- Whether `opencode.json` `instructions` accepts a file with YAML frontmatter cleanly.
- Whether the `subagent` tool call accepts our agent IDs when two files share one name in global and project dirs (merge by ID is described for config order only).
- Pages not read: console, RPC, Effect and Cloudflare variants.
