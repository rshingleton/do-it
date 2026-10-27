// What do-it decides at each hook event, whatever the host. The Claude Code
// entry point and the OpenCode plugin map their own events and tool names
// onto this and translate the result into their own protocols.
//
//   decide(event, { kind, args, cwd, readOnly }, { env })
//     event  'session' | 'before' | 'after'
//     kind   'edit' | 'shell' | null (a tool do-it does not check)
//     readOnly  session only: the agent cannot edit, so skip the coding posture
//     voice     session only: add the voice rules (the agent has no copy of its own)
//   returns { block?, context?, notice? }
//     block    the reason to refuse the tool (only before it runs)
//     context  text for the model
//     notice   an error to report; the tool still runs
//
// Fails open: a crash never escapes, it comes back as a notice.

import { sessionContext } from './context.mjs';
import { setup, beforeEdit, afterEdit, beforeShell } from './guard.mjs';

export function decide(event, { kind = null, args = {}, cwd = process.cwd(), readOnly = false, voice = false } = {}, { env = process.env } = {}) {
  try {
    return decideOrThrow(event, kind, args || {}, cwd, env, { readOnly, voice });
  } catch (e) {
    return { notice: `do-it hook ${event} failed open: ${e.message}` };
  }
}

function decideOrThrow(event, kind, args, cwd, env, session) {
  // Most tool calls are tools do-it does not check: skip loading config.
  if (event !== 'session' && !kind) return {};
  const ctx = setup(cwd, env);
  if (!ctx.enabled) return {};

  if (event === 'session') {
    let text = sessionContext(ctx.root, ctx.cfg, session);
    if (ctx.error) text += `\n\ndo-it: ${ctx.error}`;
    return { context: text };
  }

  if (event === 'before') {
    // Compliance notes wait for the edit to run; only a block stops it here.
    const r = kind === 'edit' ? beforeEdit(ctx, args) : kind === 'shell' ? beforeShell(ctx, args.command) : null;
    if (r?.action === 'block') return { block: r.reason };
    // A shell warn rides along as context; an edit's notes wait for the edit.
    return kind === 'shell' && r?.action === 'warn' ? { context: r.message } : {};
  }

  if (event === 'after' && kind === 'edit') {
    // The edit already ran, so a HIGH hit cannot be blocked any more; the
    // before event blocked it if it could. Lint failures come first.
    const notes = [];
    const lint = afterEdit(ctx, args);
    if (lint.action !== 'allow') notes.push(lint.message);
    const pre = beforeEdit(ctx, args);
    if (pre.action === 'warn') notes.push(pre.message);
    return notes.length ? { context: notes.join('\n\n') } : {};
  }

  return {};
}
