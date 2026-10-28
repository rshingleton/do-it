// do-it for OpenCode: the same injection and guards as the Claude Code hooks.
//
// - Every turn: the core posture and this repo's standards pointers are added
//   to the system prompt (OpenCode has no subagent hook; subagents share it).
//   The text is built once and rebuilt when HEAD or the index moves.
//   The internal-voice rules (skills/it-core/VOICE.md) are not injected here:
//   they would reach the main session too.
// - Before write/edit/patch: HIGH compliance hits throw, which blocks the tool.
// - Before bash `git commit`: the staged diff is scanned the same way.
// - After write/edit/patch: DO_IT_LINT_CMD output and MEDIUM/LOW hits are
//   appended to the tool result the model reads.
// - v2 only: subagent calls launched together in one message are forced to
//   `background: true`, so a parallel batch does not hold the parent.
// - Token usage from the host's events goes to the shared usage ledger
//   (skills/usage-it/scripts/opencode.mjs); it never blocks anything.
//
// One default export serves both plugin APIs: `server` is the v1 hook object
// (verified to block by throwing), `setup` is the v2 entry. A build that loads
// both (OpenCode 1.18.x under "plugin") calls both, so whichever registers
// hooks first owns them and the other stays empty. OpenCode 2 calls only
// `setup` (its ctx offers `session` and `tool`); OpenCode 1 calls `server`,
// and 1.18.x under "plugin" also calls `setup` with a ctx that has neither,
// so `setup` registers only what the context offers. Shapes: the research
// note docs/research/opencode-v2-integration.md, verified on 2.1.2.
//
// Install: scripts/install.sh, or add this directory to opencode.json:
//   OpenCode 1: { "plugin": ["/abs/path/do-it/.opencode/plugins/do-it.mjs"] }
//   OpenCode 2: { "plugins": ["/abs/path/do-it/.opencode/plugins"] }
// OpenCode 2 loads a plugin directory only through its index.js (which
// re-exports this file) and skips a plugin file given by path.

import fs from 'node:fs';
import path from 'node:path';
import { decide as realDecide } from '../../hooks/lib/decide.mjs';
import { createOpenCodeUsage } from '../../skills/usage-it/scripts/opencode.mjs';

// OpenCode's tool names, as the kinds decide() checks. OpenCode 1.x
// registers its patch tool as apply_patch (arg patchText); 2.x names its shell
// tool `shell` and has no patch tool (write takes {path, content}, edit takes
// {path, oldString, newString}).
const KINDS = { write: 'edit', edit: 'edit', patch: 'edit', apply_patch: 'edit', multiedit: 'edit', bash: 'shell', shell: 'shell' };

const kindOf = (tool) => KINDS[String(tool || '').toLowerCase()] ?? null;

// Fails open: OpenCode reads any throw as a block, so only a block decision
// may throw; every other error is reported and the tool runs.
function failOpen(name, fn) {
  return async (...args) => {
    let blocked;
    try {
      blocked = await fn(...args);
    } catch (e) {
      process.stderr.write(`do-it plugin ${name} failed open: ${e.message}\n`);
      return;
    }
    if (blocked) throw new Error(blocked);
  };
}

function report(r) {
  if (r.notice) process.stderr.write(`${r.notice}\n`);
  return r;
}

// Tool.Result.content is text or a list of parts; the note goes after what is there.
function appendContent(result, note) {
  if (typeof result.content === 'string') result.content += `\n\n${note}`;
  else if (Array.isArray(result.content)) result.content.push({ type: 'text', text: note });
  else if (result.content === undefined) result.content = note;
}

// The session context (posture, project docs, code map) is built once and
// reused until HEAD or the index moves, so a model request does not pay a
// `git ls-files` walk. A result with a notice is rebuilt, so a fixed config
// problem clears.
// shortcut: the key is stats of `<cwd>/.git` (HEAD, its reflog, the index), so
// a new untracked file, or an edit to AGENTS.md or the config, shows only after
// the next git add or commit; outside a repo root (a subdirectory, a
// worktree) it is built once per plugin instance. Upgrade to `git rev-parse`
// and a stat of the standards files if either matters.
function sessionMemo(decide, cwd) {
  const stamp = (f) => {
    try {
      return fs.statSync(path.join(cwd, '.git', f)).mtimeMs;
    } catch {
      return 0;
    }
  };
  let key = null;
  let result = null;
  return () => {
    // logs/HEAD moves with every commit, checkout and reset; HEAD itself only on a branch switch.
    const now = `${stamp('HEAD')}:${stamp('logs/HEAD')}:${stamp('index')}`;
    if (result && key === now) return result;
    const r = decide('session', { cwd });
    result = r.notice ? null : r;
    key = now;
    return r;
  };
}

// A foreground `subagent` call blocks the parent, so one assistant message that
// launches two or more subagents would hold the session until the slowest ends.
// The host dispatches a message's tool calls together (their before hooks fire
// in the same tick), so each call registers under its message id, yields one
// tick, and a call that then sees a sibling is run in the background.
// shortcut: a lone call, or a sibling dispatched after the yield, stays
// foreground; upgrade if the host ever orders a message's calls apart.
function batchSubagents() {
  const seen = new Map();
  return async (event) => {
    if (!isSubagent(event.tool) || !event.input || !event.messageID) return;
    seen.set(event.messageID, (seen.get(event.messageID) || 0) + 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (seen.get(event.messageID) > 1) event.input.background = true;
    setTimeout(() => seen.delete(event.messageID), 1000).unref();
  };
}

const isSubagent = (tool) => String(tool || '').toLowerCase() === 'subagent';

// `createPlugin({decide})` and the server's second argument replace the decision module in tests.
// `usageDir` redirects the usage ledger in tests.
export function createPlugin({ decide: baseDecide = realDecide, usageDir } = {}) {
  let v1Live = false;
  let v2Live = false;

  const server = async ({ directory } = {}, { decide: override } = {}) => {
    if (v2Live) return {};
    const decide = override || baseDecide;
    v1Live = true;
    const cwd = directory || process.cwd();
    const session = sessionMemo(decide, cwd);
    const usage = createOpenCodeUsage({ cwd, ...(usageDir && { dir: usageDir }) });
    return {
      // Never throws: the usage module swallows its own errors, and a throw here would only be noise.
      event: async ({ event } = {}) => usage.event(event),

      'experimental.chat.system.transform': failOpen('context', async (_input, output) => {
        const r = report(session());
        if (r.context) output.system.push(r.context);
      }),

      // shortcut: a commit-message warning (r.context) has no channel here, so
      // OpenCode only gets blocks; add one when the host exposes a before-note.
      'tool.execute.before': failOpen('before', async (input, output) => {
        return report(decide('before', { kind: kindOf(input.tool), args: output.args || {}, cwd })).block;
      }),

      'tool.execute.after': failOpen('after', async (input, output) => {
        const args = input.args || output.metadata?.args || {};
        const r = report(decide('after', { kind: kindOf(input.tool), args, cwd }));
        if (r.context && typeof output.output === 'string') output.output += `\n\n${r.context}`;
      }),
    };
  };

  // The v2 shapes below were run on OpenCode 2.1.2 (location.directory,
  // SystemPart {type, text}, Tool.Result {output, content, metadata}). A
  // shape that is not as expected is skipped.
  const setup = async (ctx) => {
    const decide = baseDecide;
    if (v1Live || !ctx?.session?.hook || !ctx?.tool?.hook) return;
    v2Live = true;
    const cwd = ctx.location?.directory || process.cwd();
    const session = sessionMemo(decide, cwd);
    const usage = createOpenCodeUsage({ cwd, ...(usageDir && { dir: usageDir }) });
    // The step events carry neither agent nor model; the context hook does, on each request.
    const stop = new AbortController();
    if (typeof ctx.event?.subscribe === 'function') {
      (async () => {
        for await (const ev of ctx.event.subscribe({ signal: stop.signal })) usage.event(ev);
      })().catch((e) => process.stderr.write(`do-it plugin usage failed open: ${e.message}\n`));
    }
    ctx.session.hook('context', failOpen('context', async (event) => {
      usage.context(event);
      const r = report(session());
      if (r.context && Array.isArray(event.system)) event.system.push({ type: 'text', text: r.context });
    }));
    const backgroundBatch = batchSubagents();
    ctx.tool.hook('execute.before', failOpen('before', async (event) => {
      await backgroundBatch(event);
      return report(decide('before', { kind: kindOf(event.tool), args: event.input || {}, cwd })).block;
    }));
    ctx.tool.hook('execute.after', failOpen('after', async (event) => {
      if (event.status !== 'completed') return;
      const r = report(decide('after', { kind: kindOf(event.tool), args: event.input || {}, cwd }));
      if (r.context && event.result) appendContent(event.result, r.context);
    }));
    // The v2 docs let setup return a cleanup; it ends the usage loop on dispose.
    return () => stop.abort();
  };

  return { id: 'do-it', server, setup };
}

const plugin = createPlugin();
export const DoItPlugin = plugin.server;
export default plugin;
