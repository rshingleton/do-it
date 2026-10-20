// do-it for OpenCode: the same injection and guards as the Claude Code hooks.
//
// - Every turn: the core posture and this repo's standards pointers are added
//   to the system prompt (OpenCode has no subagent hook; subagents share it).
// - Before write/edit/patch: HIGH compliance hits throw, which blocks the tool.
// - Before bash `git commit`: the staged diff is scanned the same way.
// - After write/edit/patch: DO_IT_LINT_CMD output and MEDIUM/LOW hits are
//   appended to the tool result the model reads.
//
// Install: scripts/install.sh, or add this directory to opencode.json:
//   OpenCode 1: { "plugin": ["/abs/path/do-it/.opencode/plugins/do-it.mjs"] }
//   OpenCode 2: { "plugins": ["/abs/path/do-it/.opencode/plugins"] }

import { decide as realDecide } from '../../hooks/lib/decide.mjs';

// OpenCode's tool names, as the kinds decide() checks. OpenCode 1.x
// registers its patch tool as apply_patch (arg patchText).
const KINDS = { write: 'edit', edit: 'edit', patch: 'edit', apply_patch: 'edit', multiedit: 'edit', bash: 'shell' };

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

// The second argument's `decide` replaces the decision module in tests.
export const DoItPlugin = async ({ directory } = {}, { decide = realDecide } = {}) => {
  const cwd = directory || process.cwd();
  return {
    'experimental.chat.system.transform': failOpen('context', async (_input, output) => {
      const r = report(decide('session', { cwd }));
      if (r.context) output.system.push(r.context);
    }),

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

export default DoItPlugin;
