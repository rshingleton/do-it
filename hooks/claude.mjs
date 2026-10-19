#!/usr/bin/env node
// Claude Code hook entry point: node hooks/claude.mjs <event>
//
//   session-start   SessionStart   inject the core posture and standards pointers
//   subagent-start  SubagentStart  the same for subagents (SessionStart never reaches them)
//   pre-tool        PreToolUse     block HIGH compliance hits in edits and in git commits
//   post-tool       PostToolUse    report MEDIUM/LOW hits, run DO_IT_LINT_CMD
//
// Fails open: a crash or bad input never blocks the agent.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sessionContext } from './lib/context.mjs';
import { setup, beforeEdit, afterEdit, beforeShell } from './lib/guard.mjs';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    setTimeout(() => resolve(data), 3000).unref();
  });
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

export async function handle(event, input) {
  const ctx = setup(input.cwd || process.cwd());
  if (!ctx.enabled) return { exit: 0 };

  switch (event) {
    case 'session-start':
    case 'subagent-start': {
      const hookEventName = event === 'session-start' ? 'SessionStart' : 'SubagentStart';
      let text = sessionContext(ctx.root, ctx.cfg);
      if (ctx.error) text += `\n\ndo-it: ${ctx.error}`;
      return { exit: 0, stdout: { hookSpecificOutput: { hookEventName, additionalContext: text } } };
    }
    case 'pre-tool': {
      const tool = input.tool_name;
      const r = EDIT_TOOLS.has(tool)
        ? beforeEdit(ctx, input.tool_input)
        : tool === 'Bash'
          ? beforeShell(ctx, input.tool_input?.command)
          : { action: 'allow' };
      return r.action === 'block' ? { exit: 2, stderr: r.reason } : { exit: 0 };
    }
    case 'post-tool': {
      if (!EDIT_TOOLS.has(input.tool_name)) return { exit: 0 };
      const notes = [];
      const pre = beforeEdit(ctx, input.tool_input);
      if (pre.action === 'warn') notes.push(pre.message);
      const lint = afterEdit(ctx, input.tool_input);
      if (lint.action === 'feedback') {
        return { exit: 0, stdout: { decision: 'block', reason: [lint.message, ...notes].join('\n\n') } };
      }
      if (lint.action === 'warn') notes.push(lint.message);
      if (!notes.length) return { exit: 0 };
      return { exit: 0, stdout: { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n\n') } } };
    }
    default:
      return { exit: 0 };
  }
}

async function main() {
  const event = process.argv[2];
  let input = {};
  try {
    const raw = (await readStdin()).replace(/^﻿/, '');
    input = raw ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }
  let result;
  try {
    result = await handle(event, input);
  } catch (e) {
    process.stderr.write(`do-it hook ${event} failed open: ${e.message}\n`);
    process.exit(0);
  }
  if (result.stdout) emit(result.stdout);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exit(result.exit);
}

// Compare real paths: Node resolves symlinks for import.meta.url but not argv[1].
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
