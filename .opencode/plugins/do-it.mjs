// do-it for OpenCode: the same injection and guards as the Claude Code hooks.
//
// - Every turn: the core posture and this repo's standards pointers are added
//   to the system prompt (OpenCode has no subagent hook; subagents share it).
// - Before write/edit/patch: HIGH compliance hits throw, which blocks the tool.
// - Before bash `git commit`: the staged diff is scanned the same way.
// - After write/edit/patch: MEDIUM/LOW hits and DO_IT_LINT_CMD output are
//   appended to the tool result the model reads.
//
// Install: scripts/install.sh, or add this directory to opencode.json:
//   OpenCode 1: { "plugin": ["/abs/path/do-it/.opencode/plugins/do-it.mjs"] }
//   OpenCode 2: { "plugins": ["/abs/path/do-it/.opencode/plugins"] }

import { sessionContext } from '../../hooks/lib/context.mjs';
import { setup, beforeEdit, afterEdit, beforeShell } from '../../hooks/lib/guard.mjs';

// OpenCode 1.x registers its patch tool as apply_patch (arg patchText).
const EDIT_TOOLS = new Set(['write', 'edit', 'patch', 'apply_patch', 'multiedit']);

function context(cwd) {
  const ctx = setup(cwd);
  return ctx.enabled ? sessionContext(ctx.root, ctx.cfg) : '';
}

export const DoItPlugin = async ({ directory } = {}) => {
  const cwd = directory || process.cwd();
  return {
    'experimental.chat.system.transform': async (_input, output) => {
      const text = context(cwd);
      if (text) output.system.push(text);
    },

    'tool.execute.before': async (input, output) => {
      const ctx = setup(cwd);
      if (!ctx.enabled) return;
      const tool = String(input.tool || '').toLowerCase();
      const r = EDIT_TOOLS.has(tool)
        ? beforeEdit(ctx, output.args)
        : tool === 'bash'
          ? beforeShell(ctx, output.args?.command)
          : { action: 'allow' };
      if (r.action === 'block') throw new Error(r.reason);
    },

    'tool.execute.after': async (input, output) => {
      const tool = String(input.tool || '').toLowerCase();
      if (!EDIT_TOOLS.has(tool)) return;
      const ctx = setup(cwd);
      if (!ctx.enabled) return;
      const args = input.args || output.metadata?.args || {};
      const notes = [];
      const pre = beforeEdit(ctx, args);
      if (pre.action === 'warn') notes.push(pre.message);
      const lint = afterEdit(ctx, args);
      if (lint.action !== 'allow') notes.push(lint.message);
      if (notes.length && typeof output.output === 'string') output.output += `\n\n${notes.join('\n\n')}`;
    },
  };
};

export default DoItPlugin;
