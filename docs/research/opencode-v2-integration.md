# What is current in OpenCode v2 for plugins, skills, commands, agents, config and rules, and which farmage/opencode-skills examples should do-it adopt?

Answer: OpenCode v2 loads plugins from a `plugins` array (or `.opencode/plugins/`) and expects a `Plugin.define({id, setup})` default export; it ignores the v1 `server()`/hook-object shape, so T9 needs a second export, not a config edit. v2 reads `.claude/skills` and `.agents/skills`, uses `commands/` (plural, `command/` still found), and agents carry `model` plus `permissions` (no `tools`). Of farmage, only the dev-link idea and validation targets are worth adopting; its install copies and its plugin-cache doc are not. Confidence: medium (hook payloads read from source types, blocking semantics and the v2 `context` system shape not verified by running).

Versions: OpenCode stable release feed shows v1.19.3 (2026-10-16) as latest on anomalyco/opencode; v2 tags exist (v2.1.2) and v2 docs list `ghcr.io/anomalyco/opencode:2.0.0`. v1 object exports need 1.18.29 or later. farmage/opencode-skills at main.  Checked: 2026-10-21.

## Findings

Sources say:

- Plugin loading, v2. Config key is `plugins` (array of package names, local paths, or `{package, options}` objects) in `opencode.json(c)`; relative paths resolve from the config file; arrays from all config files are layered lowest to highest precedence. `.ts`/`.js` files and package directories directly in `.opencode/plugins/` or `~/.config/opencode/plugins/` are auto-discovered; a root `plugins/` is not. Entries prefixed `-` disable an id or wildcard. https://opencode.ai/v2/docs/plugins/ (Loading).
- Plugin loading, v1. Key is singular `"plugin"`; dirs `.opencode/plugins/` and `~/.config/opencode/plugins/`. https://opencode.ai/docs/plugins/ (Config key, Plugin directories).
- v2 export shape. `export default Plugin.define({ id, setup(ctx) })` from `@opencode/plugin`; `setup` may return cleanup; options in `ctx.options`; Effect variant uses `effect()`. For dual support, default-export one object that spreads `Plugin.define({...})` and also carries a v1 `server()` function. V2 reads `id` and `setup()` and ignores `server()`; v1 hooks are not translated. https://opencode.ai/v2/docs/build/plugins/ (Plugin definition, Differences from V1). Also packages/plugin/src/README.md at https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/README.md (raw via gh api contents).
- v2 hook registration is per domain: `ctx.<domain>.hook(name, cb, {providerID?})`, returning a registration with `dispose()`. Plugins run in order. https://opencode.ai/v2/docs/build/plugins/ (Hook registration).
- v2 hooks that map to ours:
  - `ctx.session.hook("context", ...)`: runs each agent-loop model call incl. tool continuations; edits `system`, `messages`, `tools`, `options`; reads `agent`, `model`, `sessionID`. Replaces v1 `experimental.chat.system.transform`. Source types: `SessionContext` has `system: Array<SystemPart>` (not a string array), https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/promise/session.ts.
  - `ctx.tool.hook("execute.before", ...)`: `{tool, sessionID, agent, messageID, id, input}` where `input` is mutable. `execute.after`: same fields plus `status: "completed"` with mutable `result: Tool.Result`, or `status: "error"` with `error`. Source: packages/plugin/src/promise/tool.ts.
  - Also `session.hook` names: `prompt`, `compaction`, `generate`, `title`, `model.request`, `http.request`, `http.response`, `retry`; `permission.hook("evaluate")`; `shell.hook("create.before")`; `ctx.event.subscribe({signal})` async iterable. https://opencode.ai/v2/docs/build/plugins/ (Hooks, Events).
- Subagent hook: none documented in v2. Child sessions exist and inherit permission rules; `context` and tool hooks carry `agent` and `sessionID`, so a plugin can tell agents apart per call. https://opencode.ai/v2/docs/build/plugins/ (Subagents and child sessions).
- Usage data to plugins: no usage or cost hook documented. Only `tokens?: TokenUsage.Info` as an output of the `compaction` result, and model `cost` tiers in model transforms. Event payloads may carry usage but the event type list is not given in v2 docs. https://opencode.ai/v2/docs/build/plugins/ (Tokens, usage, and cost). v1 docs also list no usage data; v1 `message.updated` event exists (https://opencode.ai/docs/plugins/ Events) but its payload fields were not shown.
- v1 hooks documented: `event`, `tool.execute.before/after`, `shell.env`, `experimental.session.compacting`, custom `tool` map; v1 event list includes `session.created`, `session.idle`, `message.updated`, `command.executed`. https://opencode.ai/docs/plugins/.
- Skills, v2. Global: `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills`. Project: `.opencode/skills`, `.claude/skills`, `.agents/skills`, searched from cwd up to project root. Extra `skills` array in config (paths, `~/`, URLs). Skill ID comes from the path, not frontmatter `name` (display label only); `description` required or the skill is not advertised; `disable-model-invocation: true` or `metadata.opencode/autoinvoke: false` hides it from the model; `license`, `compatibility` accepted but ignored; kebab-case 1-64 chars recommended but not enforced. Permissions use action `skill`, last matching rule wins. https://opencode.ai/v2/docs/skills/.
- Commands, v2. `commands/` plural under `.opencode/` and `~/.config/opencode/`; singular `command/` still discovered, "use `commands/` for new files". Frontmatter: `description`, `agent`, `model` (`provider/model#variant`), `subagent` (bool; `subtask` deprecated alias). Do not put `template` in Markdown frontmatter; body is the template. `$ARGUMENTS`, `$1`, `$2`. Config form: `commands` object with `template`. https://opencode.ai/v2/docs/commands/.
- Agents, v2. `.opencode/agents/<name>.md`, `~/.config/opencode/agents/`; nested path becomes id. Frontmatter: `model` (`provider/model#variant`, inherits parent if omitted), `permissions` (ordered list of `{action, resource, effect}`, last match wins), `mode` (`primary|subagent|all`, default `primary`), `description`, `steps`, `hidden`, `color`, `disabled`. No `tools` field; legacy `tools`/`permission` not for new v2 config. Built-in subagents `general`, `explore`. https://opencode.ai/v2/docs/agents/.
- Config, v2. Locations: managed/system dirs, `~/.config/opencode/opencode.json(c)`, project `opencode.json(c)`, `.opencode/opencode.json(c)`; `.opencode` configs override direct ones. Keys `plugins`, `instructions` (files, globs, URLs, loaded alongside discovered `AGENTS.md`), `skills`, `commands`. https://opencode.ai/v2/docs/config/.
- Rules: https://opencode.ai/v2/docs/rules/ returned 404; no v2 migration page found (https://opencode.ai/v2/docs/migrate/ is 404). The v2 config page names `instructions` and `AGENTS.md` only.
- farmage/opencode-skills (raw.githubusercontent.com/farmage/opencode-skills/main/...):
  - `install.sh`: copies (not links) `skills/*` and `.opencode/commands/*` to `~/.config/opencode` or `.opencode` (`--local`); `--uninstall` removes skills only, not commands; clones to a temp dir when piped.
  - `Makefile`: `dev-link` symlinks each skill dir, renames a real dir to `<name>.bak` first, `dev-unlink` restores; also `validate`, `validate-md`, `check` (docs sync), `test`.
  - `opencode.json`: `instructions` for AGENTS.md and docs, a skill permission wildcard allow, a `common-ground` command, a `skills` path.
  - `AGENTS.md`: skill authoring rules: description says what and when never process; frontmatter `name` matches directory, description 1-1024 chars; tier 1 SKILL.md about 80-100 lines, references 100-600 lines.
  - `MODELAGENTS.md`: a pasted behavioural rules template (skill-activation at 1 percent chance, verify before claiming done, three failed fixes means question architecture), credited to obra/superpowers.
  - `docs/local_skill_development.md`: symlink the plugin cache (`installed_plugins.json`, `cache/<plugin>/<name>/<version>`). That is a Claude Code marketplace layout, not an OpenCode one.
  - `.opencode/` holds `commands/` and `skills/` only.

Inference (mine, not stated by sources):

- T9: do-it's `.opencode/plugins/do-it.mjs` exports only `DoItPlugin` returning v1 hooks. Under v2 it would either be skipped or fail the `Plugin.define` check. Fix is a default export that spreads a `Plugin.define({id: "do-it", setup})` object and keeps `server`. `setup` would register `ctx.session.hook("context")` (push our text onto `system`, mind it is `SystemPart[]`), `ctx.tool.hook("execute.before")` (throw to block, assumed from v1; semantics unverified), and `execute.after` (append to `result`, shape of `Tool.Result` not read). `decide()` stays shared. The header comment's `{"plugins": [dir]}` for v2 is consistent with the docs, but a dir under `.opencode/plugins/` is auto-discovered, so install-hooks could skip the config edit for project installs.
- Auto-discovery risk: v2 loads direct `.js` files in `.opencode/plugins/`; our `.opencode/plugins/` ships `do-it.mjs` in the repo, so opening do-it itself in v2 may load it without any config. Check that it fails open.
- Usage issue (docs/issues/per-step-usage-record-on-do-it-work-items.md): no documented v2 plugin hook exposes per-step token usage. Realistic options: document the gap for OpenCode, or read usage through `ctx.event.subscribe` or the client API after confirming payload fields in source. Do not promise parity yet.
- No subagent hook in either version: our "subagents share the system hook" note stays true, and in v2 the `agent` field on `context` could let the plugin skip injection for the main agent only if needed.
- Install gaps: `scripts/install.sh` writes commands to `.../opencode/command/` (singular) and links `.opencode/command` generated files. v2 prefers `commands/`; singular still works, so no break, but a v2-first install should target `commands/` and gen-opencode could emit it (v1 reads `command/`, so keep both or detect). Our commands emit `$ARGUMENTS` and a `description` only, which is valid in v2.
- Skills: our `~/.claude/skills` and `~/.agents/skills` links are both read by v2 and v1 (v2 docs list both); linking to both risks duplicate IDs for the same skill, worth a test on a real v2 install. Our skill `name` fields equal directory names, so path-derived IDs match.
- Agents: `agents/` files are Claude-format (`tools`, model tiers) and install only to `~/.claude/agents`. OpenCode v2 would need `permissions` frontmatter and `provider/model` ids, so reusing them is not free; leave as a gap.

Farmage adoption, each tied to a gap:

- Adopt: `dev-link`/`dev-unlink` pattern with `.bak` backup, as `scripts/install.sh --dev` or a npm script. Our install already symlinks, so the new part is only the `.bak` restore; low value, optional. Ties to the install gap.
- Adopt: a `check` target that also validates skill frontmatter and docs sync. We already have `npm run check`; no gain.
- Adopt idea: `instructions` array plus `skills` array in opencode.json as the v2-native way to point at repo rules and the skills dir without symlinks. Ties to T9: the installer's opencode.json merge could add `skills: [<clone>/skills]` instead of linking into `~/.agents/skills`. Needs a v1 check (v1 `skills` key not verified).
- Adopt idea: skill permission rules and `disable-model-invocation` for typed skills, since v2 honours it. Ties to our typed vs automatic skills; verify our frontmatter already sets it.
- Do not adopt: `install.sh` copy approach (stale copies, uninstall leaves commands), the plugin-cache symlink doc (wrong host layout), MODELAGENTS.md text (copied superpowers material, conflicts with our it-core posture and the repo rule not to copy other repos' text), AGENTS.md skill limits (their 1024-char and 80-100 line figures differ from our SKILL-MECHANICS budget).

## Open

- Exact v2 `context` hook `SystemPart` shape and `Tool.Result` shape (only type names seen); read packages/schema before writing the adapter.
- How a v2 `execute.before` hook blocks a tool (throw, or a field on the event); not stated in docs fetched. Needs a run against a v2 binary.
- Whether v2 emits usage in event payloads (message or step events) and how a plugin reads it; v2 event type list not fetched. Decides the usage issue.
- Whether v1 (1.19.x) accepts a default-export object with both `Plugin.define` fields and `server()` (docs say supported from 1.18.29).
- v2 rules page and a migration guide returned 404; confirm whether `CLAUDE.md` fallback still applies.
- Whether v2 dedupes skills found in both `~/.claude/skills` and `~/.agents/skills`.
- v2 stable release and tag status: only tags (v2.1.2) and docs seen; no v2 GitHub release listed in the feed.

## Verified results (spike, 2026-10-21)

Run in a scratch directory with a throwaway `XDG_*`/`HOME`, so the real
`~/.config/opencode` was untouched. Two binaries: v1 = installed 1.18.35, and
`opencode-ai@dev` = 0.0.0-dev-202610161232 (the newest tag; installed into a
scratch dir). No binary matching the opencode.ai/v2 docs was found: the
`dev` plugin SDK (`@opencode-ai/plugin` dev) defines `Plugin.define({id,
setup})` with a `PluginContext` of only `options, agent, aisdk, catalog,
command, integration, plugin, reference, skill`: no `session`, `tool` or
`permission` hooks. Model calls ran on v1 through the free `big-pickle` model;
dev refuses it ("OpenCode 1.18.0 or newer is required", its version is 0.0.0),
so dev runs were load-only.

| Item | Result | Status |
|------|--------|--------|
| v1 hook `tool.execute.before` blocks by throwing | A throw fails the tool; the model sees `Error: <message>` and reports it. Input `{tool, sessionID, callID}`, output `{args}`. | verified on 1.18.35 |
| v1 `experimental.chat.system.transform` | Input `{sessionID, model}`, `output.system` is `string[]`; a pushed string reached the model. | verified on 1.18.35 |
| v1 default export with `server` and `setup` together | Both are called under `"plugin"`: the `server` fn receives `{client, project, worktree, directory, ...}`, `setup` receives the v2 ctx above. Under `"plugins"` (dev only) just `setup`. | verified on 1.18.35 and dev |
| `setup` ctx has `session`/`tool` hooks | No, on either binary. Hooks `ctx.session.hook("context")`, `ctx.tool.hook("execute.before"/"execute.after")`, `permission.hook("evaluate")` from the docs sweep exist in neither. | verified absent; docs build unverified |
| v1 hooks on dev | The binary still triggers `tool.execute.before/after` from the v1 hook object, under `"plugin"`. Not run with a model. | load-only |
| `Tool.Result` and `SystemPart` shapes (v2 docs) | Not reachable; v1 `output.output` is a string, `system` strings. | unverified |
| Usage through a plugin | v1 `event` hook receives `message.updated` for assistant messages with `agent`, `modelID`, `providerID`, `cost`, `tokens {total, input, output, reasoning, cache {read, write}}`; the SDK `client` is in the plugin input. Subagent messages carry their own `sessionID`. | verified on 1.18.35 |
| `skills` array in `opencode.json` | Read; `debug skill` lists the skill. Same on dev. | verified |
| `commands/` beside `command/` | Both read into `config.command`, no duplicate error. Same on dev. | verified |
| `instructions` file with YAML frontmatter | Accepted; the model saw the whole file, frontmatter included. | verified on 1.18.35 |
| Agent `permissions:` list (`{permission, pattern, effect}`) | Ignored: the effective ruleset stays allow-all, on both binaries. | verified: unsafe |
| Agent `permission:` map (`"*": deny`, `read: allow`) | Applied after the default allow-all; effective rules include deny `*` and allow `read`. Both binaries. | verified |
| Agent `model: sonnet` | Accepted at load, no error. | verified, effect not run |
| Agent `tools: Read, Grep` (Claude string) | The whole config is invalid ("Expected object | undefined, got string"): every OpenCode command fails. Never link `agents/*.md` into an OpenCode agents dir. | verified on both |

Consequences: phase 2 cannot register tool hooks through `setup` on any
available binary; keep the v1 hook object as the working path and register
`setup` hooks only when the ctx offers them, once per process, because
`"plugin"` loads both shapes. Phase 3 generates the `permission` map (not the
`permissions` list). Phase 4 may use `skills`, `commands/` and `instructions`
on v1. Phase 6 has a verified path on v1.

Phase 2 smoke (2026-10-21): the repo plugin, loaded through `"plugin"` on
1.18.35 with the free model, blocked a `write` containing a fake AWS key with
the do-it compliance message (the model then retried and passed the
documented `do-it: allow` escape). The dev snapshot loads the same file
(`debug config` lists it); no model run there.

Phases 3 and 4 smoke (2026-10-21): `scripts/install.sh --no-hooks` into a
scratch `HOME`, then `opencode agent list`, `debug skill` and `debug config`
on 1.18.35 and the dev snapshot: the five generated `it-*` agents load as
subagents (no config error), skills load through the existing symlinks, and
commands present in both `command/` and `commands/` appear once each.
Decisions: keep the symlinks and add no `skills` array (both builds already
read them); add no `instructions` entry (the plugin already injects the core
posture each turn, so a file entry would pay for it twice; when the plugin
does not load, the repo's own AGENTS.md still applies).

## Re-check on OpenCode 1.19.3 (2026-10-21)

The installed `opencode` is now 1.19.3 (the earlier tables are 1.18.35 and the
dev snapshot). Scratch config for load checks, the real config for model runs
(`minimax-m3.1-flash-free`, plugin from the checkout):

| Item | Result |
|------|--------|
| Plugin block | A `write` with a fake AWS key was refused with the do-it compliance message; the model quoted it and stopped, no file written. |
| Agent `permissions:` list | Still ignored (allow-all). |
| Agent `permission:` map | Applied: generated `it-scout` resolves to `*` deny plus allow for read, grep, glob, list, bash; edit and write fall to deny. |
| Agent `tools: Read, Grep` | Still makes the config invalid. |
| Generated agents, `skills`, `commands/` and `command/`, `instructions` | Load, no error. |
| `it-scout` write attempt (live, via the task tool) | The write and edit tools were not available to it. It then created the file with `printf > file` in bash, since `bash` is allowed. Same reach as the Claude Code agent (`tools: Read, Grep, Glob, Bash`); narrowing bash is not part of this change. |
| `/do-it` lane XS (live, `--command do-it`) | Loaded the skill, read SCOUT, STATE, LANES and BOUNDARIES, stated lane XS, built test-first (red then green), wrote no planning file, made no commit. |

Log noise seen: `duplicate skill name do-it` (the same skill linked under
`~/.claude/skills` and `~/.agents/skills`) is a WARN with no effect.

## v2 plugin types (2026-10-21)

The npm `dev` plugin package has no `session` or `tool` hooks, but
`@opencode-ai/plugin@beta` (0.0.0-beta-19271) and `@next` do (the `dist/promise`
files). Read from those types, and the plugin is written to them:

- `Context` has `location.directory`, `session`, `tool`, `permission`, `event`.
  There is no `ctx.directory`; the plugin now uses `ctx.location.directory`.
- `session.hook("context")` event: `{sessionID, agent, model, system:
  SystemPart[], messages, tools, generation, providerOptions}`. `SystemPart` is
  `{type: "text", text, cache?, metadata?}`.
- `tool.hook("execute.before")` event: `{tool, sessionID, agent, messageID, id,
  input}` with `tool` and `input` mutable.
- `tool.hook("execute.after")` event: the same fields plus `status:
  "completed"` with `result`, or `status: "error"` with `error`.
- `Tool.Result` is `{output?, content?, metadata?}`; `content` is a string or
  a list of `{type: "text", text}` or file parts. It is not a string
  `output`, so the plugin appends its note to `content` (string: appended,
  list: a text part pushed, absent: set).
- `permission.hook("evaluate")` event: `{sessionID, agent?, action, resources,
  effect, message?}`.

The `opencode-ai@beta` npm binary (0.0.0-beta-202608110357) is the v1 CLI and
does not host these hooks; OpenCode 2.1.2 (brew) does, see the next section.

## Run on OpenCode 2.1.2 (2026-10-21)

`opencode` was upgraded by brew to v2.1.2 (the real v2 binary). Scratch `HOME`
and `XDG_*`, `opencode run --standalone`, the free `minimax-m3.1-flash-free`
model, a probe plugin, and the real do-it plugin.

| Item | Result |
|------|--------|
| Plugin entry | A configured plugin must be a directory with an `index.js` (`plugins` or `plugin` key). A plugin file given by path is skipped with `WARN configured plugin path must be a directory`; `main`, `exports["./server"]`, `index.mjs` and a dir with only `x.mjs` are not loaded. `.opencode/plugins/*.js` auto-loads; `.mjs` does not. This repo's `.opencode/plugins/index.js` (re-exporting `do-it.mjs`) is what v2 loads. |
| `setup` context | `app, location, options, agent, aisdk, command, credential, event, experimental, generate, model, provider, integration, mcp, permission, plugin, reference, rpc, skill, storage, tool, vcs, websearch, worktree, session, shell`. |
| `session.hook("context")` | Event keys `sessionID, model, system, messages, options, agent, tools`; a pushed `{type: "text", text}` reached the model. |
| `tool.hook("execute.before")` | `{tool, sessionID, agent, messageID, id, input}`. A throw blocks the tool; the model sees `{"error":{"type":"unknown","message":"<text>"},"content":[]}`. Tool names: `read`, `write`, `edit`, `shell` (not `bash`), `grep`, and an `execute` code tool. No patch tool. Inputs: write `{path, content}`, edit `{path, oldString, newString}`, shell `{command, workdir}`, read `{path}`. |
| `tool.hook("execute.after")` | `{..., status: "completed", result}` with `result = {output, content: [{type: "text", text}], metadata}`. A text part pushed onto `content` reached the model. |
| do-it plugin | Registered as `plugins: [<repo>/.opencode/plugins]`, loaded through `index.js`; a `write` containing a fake AWS key was blocked with the compliance message through the v2 `setup` hooks. |
| `permission.hook("evaluate")` | `{sessionID, agent, action: "shell", resources: ["echo one","echo two","cat"], source, effect: "allow"}` for `echo one && echo two | cat`: scanner-split pieces, not the whole command. `execute.before` still gets the whole `command`, so the commit scan stays there. |
| Usage | `ctx.event.subscribe({signal})` yields `session.step.ended` (`sessionID`, `assistantMessageID`, `cost`, `tokens {input, output, reasoning, cache {read, write}}`) and `session.usage.updated` (session totals). Agent and model are not on those events; the context hook has them per request. |
| Generated agents | The `permission` map works: a live `it-scout` had no `write` or `edit` tool (it fell back to shell, which is allowed). The config reader also accepts `permissions` and `tools`. |
| `execute` tool | Restricted JS: `tools` holds only catalog tools (`tools.opencode.*`, MCP); `tools.write` and `tools.shell` throw `Unknown tool`, `fetch` refuses `file://`, no `import`/`process`/`require`. A nested call fires `execute.before` again with the parent's call id and its own name (`opencode_worktree_create`), so the guards see it. The code text alone cannot write or run anything; no bypass found (checked 2.1.2, free model). |
| Stalls | Some first runs on a fresh state dir produced no output for minutes; a re-run on a copy of a warmed state dir was fine. |
