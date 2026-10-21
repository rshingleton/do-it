#!/usr/bin/env node
// Claude Code hook entry point: node hooks/claude.mjs <event>
//
//   session-start   SessionStart   inject the core posture and standards pointers
//   subagent-start  SubagentStart  the same for subagents (SessionStart never reaches them);
//                                  read-only agents (Explore, Plan, it-scout) get it without the coding posture
//   pre-tool        PreToolUse     block HIGH compliance hits in edits and in git commits
//   post-tool       PostToolUse    report MEDIUM/LOW hits, run DO_IT_LINT_CMD
//
// Fails open: a crash or bad input never blocks the agent.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decide } from './lib/decide.mjs';

// Subagent types that only read; they skip the coding posture. A plugin agent
// reports itself as <plugin>:<name>, so the prefix is dropped before the lookup.
export const READ_ONLY_AGENTS = new Set(['Explore', 'Plan', 'claude-code-guide', 'it-scout', 'it-reviewer', 'it-skeptic']);
const agentName = (type) => String(type ?? '').replace(/^[^:]+:/, '');

// Claude Code's tool names, as the kinds decide() checks.
const KINDS = { Write: 'edit', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Bash: 'shell' };

const EVENTS = {
  'session-start': ['session', 'SessionStart'],
  'subagent-start': ['session', 'SubagentStart'],
  'pre-tool': ['before'],
  'post-tool': ['after', 'PostToolUse'],
};

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

// A block exits 2 with the reason on stderr; context goes back as
// hookSpecificOutput (after a tool, next to its result: the documented
// PostToolUse channel); a notice goes to stderr and the tool runs.
export async function handle(event, input) {
  const [name, hookEventName] = EVENTS[event] ?? [];
  if (!name) return { exit: 0 };
  const r = decide(name, {
    kind: KINDS[input.tool_name] ?? null,
    args: input.tool_input || {},
    cwd: input.cwd || process.cwd(),
    readOnly: event === 'subagent-start' && READ_ONLY_AGENTS.has(agentName(input.agent_type)),
  });
  if (r.block) return { exit: 2, stderr: r.block };
  const out = { exit: 0, stderr: r.notice };
  if (r.context && hookEventName) out.stdout = { hookSpecificOutput: { hookEventName, additionalContext: r.context } };
  return out;
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
// argv[1] may not be a file at all (node -e ... arg), which is not "main".
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) main();
