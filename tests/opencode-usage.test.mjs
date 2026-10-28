// OpenCode events become ledger rows that usage.mjs reports.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createPlugin } from '../.opencode/plugins/do-it.mjs';
import { createOpenCodeUsage } from '../skills/usage-it/scripts/opencode.mjs';
import { readAll } from '../skills/usage-it/scripts/ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => tmpDir('do-it-ocusage-');
const NOW = Date.now();

const tokens = (input, output, reasoning = 0, read = 0, write = 0) => ({ total: 0, input, output, reasoning, cache: { read, write } });
const msg = (id, sessionID, t, extra = {}) => ({
  type: 'message.updated',
  properties: { info: { id, sessionID, role: 'assistant', agent: 'it-reviewer', modelID: 'm1', providerID: 'p', cost: 9.99, tokens: t, time: { created: NOW - 5000, completed: NOW - 1000 }, ...extra } },
});

// One main session with a subagent child, a message repeated while streaming, and noise.
const v1Stream = () => [
  { type: 'session.created', properties: { info: { id: 's-main' } } },
  { type: 'session.created', properties: { info: { id: 's-sub', parentID: 's-main' } } },
  msg('a1', 's-main', tokens(10, 20, 5, 100, 7), { agent: 'build' }),
  msg('a2', 's-main', tokens(3, 4, 0, 50, 0), { agent: 'build' }),
  msg('a2', 's-main', tokens(3, 4, 0, 50, 0), { agent: 'build' }), // repeated update
  msg('a3', 's-main', tokens(1, 1), { time: { created: NOW } }), // still streaming: not counted
  msg('b1', 's-sub', tokens(2, 8, 2, 30, 0)),
  { type: 'message.updated', properties: { info: { id: 'u1', sessionID: 's-main', role: 'user' } } },
  { type: 'message.updated', properties: {} },
  { type: 'message.updated' },
  null,
  { type: 'session.idle', properties: {} },
];

const rowsOf = (dir) => Object.fromEntries(readAll(dir).map((r) => [r.id, r]));

test('v1 events: each completed message counts once, a subagent session keeps its agent', () => {
  const dir = tmp();
  const usage = createOpenCodeUsage({ dir, cwd: '/x/proj' });
  for (const e of v1Stream()) usage.event(e);
  const rows = rowsOf(dir);
  assert.deepEqual(Object.keys(rows).sort(), ['s-main', 's-sub']);
  assert.deepEqual(
    [rows['s-main'].kind, rows['s-main'].agent, rows['s-main'].turns, rows['s-main'].in, rows['s-main'].out, rows['s-main'].cr, rows['s-main'].cc],
    ['session', 'main', 2, 13, 29, 150, 7],
  );
  assert.deepEqual([rows['s-main'].ctx0, rows['s-main'].peak, rows['s-main'].project, rows['s-main'].model], [117, 117, 'proj', 'm1']);
  assert.deepEqual(
    [rows['s-sub'].kind, rows['s-sub'].agent, rows['s-sub'].turns, rows['s-sub'].out],
    ['subagent', 'it-reviewer', 1, 10],
  );
  assert.equal(JSON.stringify(rows).includes('9.99'), false); // cost is not recorded
});

test('v2 step events take agent and model from the context hook', () => {
  const dir = tmp();
  const usage = createOpenCodeUsage({ dir, cwd: '/x/proj' });
  usage.context({ sessionID: 's2', agent: 'build', model: { id: 'm2' } });
  usage.event({ type: 'session.step.ended', sessionID: 's2', assistantMessageID: 'x1', cost: 1, tokens: { input: 5, output: 6, reasoning: 1, cache: { read: 40, write: 2 } } });
  usage.event({ type: 'session.step.ended', sessionID: 's2', assistantMessageID: 'x2', tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } } });
  usage.event({ type: 'session.step.ended', sessionID: 's2', tokens: {} }); // no message id
  usage.event({ type: 'session.usage.updated', sessionID: 's2', tokens: tokens(99, 99) }); // session totals are not a step
  const r = rowsOf(dir).s2;
  assert.deepEqual([r.kind, r.agent, r.model, r.turns, r.in, r.out, r.cr, r.cc], ['session', 'build', 'm2', 2, 6, 8, 40, 2]);
});

test('prune runs once per day change, not once per step', () => {
  const calls = [];
  let now = Date.parse('2026-10-26T10:00:00Z');
  const usage = createOpenCodeUsage({ dir: tmp(), cwd: '/x/proj', prune: (...a) => calls.push(a), now: () => new Date(now) });
  usage.context({ sessionID: 's3', agent: 'build', model: 'm3' });
  const step = (i) => usage.event({ type: 'session.step.ended', sessionID: 's3', assistantMessageID: `m${i}`, tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } } });
  for (let i = 0; i < 200; i++) step(i);
  assert.equal(calls.length, 1);
  now += 24 * 3600 * 1000;
  step(200);
  step(201);
  assert.equal(calls.length, 2);
});

test('a prune that throws still leaves the row recorded', () => {
  const dir = tmp();
  const usage = createOpenCodeUsage({ dir, prune: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => usage.event({ type: 'session.step.ended', sessionID: 's4', assistantMessageID: 'x', tokens: { input: 1, output: 1 } }));
  assert.equal(readAll(dir).length, 1);
});

test('a 1,000-session stream keeps a bounded run map: an old session restarts, a recent one keeps its totals', () => {
  const dir = tmp();
  const usage = createOpenCodeUsage({ dir, cwd: '/x/proj' });
  const step = (sid, i) => usage.event({ type: 'session.step.ended', sessionID: sid, assistantMessageID: `m${i}`, tokens: { input: 1, output: 1 } });
  for (let i = 0; i < 1000; i++) step(`s${i}`, 0);
  step('s999', 1);
  step('s0', 1);
  const rows = rowsOf(dir);
  assert.equal(rows.s999.turns, 2);
  assert.equal(rows.s0.turns, 1); // evicted, so the late message starts a fresh total
});

test('a late message with an earlier stamp keeps the run day and leaves one row per id', () => {
  const dir = tmp();
  const usage = createOpenCodeUsage({ dir, cwd: '/x/proj' });
  const day = (d) => Date.parse(`2026-10-${d}T12:00:00Z`);
  usage.event(msg('a1', 's5', tokens(1, 1), { time: { completed: day(26) } }));
  usage.event(msg('a2', 's5', tokens(1, 1), { time: { completed: day(25) } }));
  const rows = readAll(dir).filter((r) => r.id === 's5');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].day, '2026-10-26');
  assert.equal(rows[0].turns, 2);
});

test('a prune that throws is retried on the next step', () => {
  let calls = 0;
  const usage = createOpenCodeUsage({ dir: tmp(), prune: () => { if (++calls === 1) throw new Error('boom'); } });
  const step = (i) => usage.event({ type: 'session.step.ended', sessionID: 's6', assistantMessageID: `m${i}`, tokens: { input: 1, output: 1 } });
  step(1);
  step(2);
  step(3);
  assert.equal(calls, 2); // failed once, retried, then done for the day
});

test('malformed payloads record nothing and never throw', () => {
  const dir = tmp();
  const usage = createOpenCodeUsage({ dir });
  for (const e of [undefined, null, 5, 'x', {}, { type: 'message.updated', properties: { info: { role: 'assistant', time: { completed: 1 } } } }]) usage.event(e);
  usage.context(null);
  assert.deepEqual(readAll(dir), []);
});

test('an unwritable usage dir fails open', () => {
  const file = path.join(tmp(), 'plain');
  fs.writeFileSync(file, '');
  const usage = createOpenCodeUsage({ dir: path.join(file, 'sub') });
  assert.doesNotThrow(() => v1Stream().forEach((e) => usage.event(e)));
});

test('the v1 plugin event hook feeds the ledger and usage.mjs reports it', async () => {
  const dir = tmp();
  const hooks = await createPlugin({ usageDir: dir }).server({ directory: '/x/proj' });
  for (const e of v1Stream()) await hooks.event({ event: e });
  const out = JSON.parse(execFileSync('node', [path.join(ROOT, 'skills/usage-it/scripts/usage.mjs'), '--days', '2', '--by', 'agent', '--json'], { env: { ...process.env, DO_IT_USAGE_DIR: dir }, encoding: 'utf8' }));
  const by = Object.fromEntries(out.map((g) => [g.agent, g]));
  assert.deepEqual([by.main.runs, by.main.out, by['it-reviewer'].runs, by['it-reviewer'].out], [1, 29, 1, 10]);
});

test('the v2 plugin feeds the ledger from ctx.event.subscribe and the context hook', async () => {
  const dir = tmp();
  const hooks = {};
  const events = [
    { type: 'session.step.ended', sessionID: 's9', assistantMessageID: 'y1', tokens: { input: 7, output: 3, cache: { read: 1, write: 0 } } },
    { type: 'session.step.ended', sessionID: 's9', assistantMessageID: 'y2', tokens: { input: 1, output: 2, cache: { read: 0, write: 0 } } },
  ];
  let release;
  const gate = new Promise((r) => (release = r));
  const ctx = {
    location: { directory: '/x/proj' },
    session: { hook: (n, fn) => (hooks[n] = fn) },
    tool: { hook: (n, fn) => (hooks[`tool.${n}`] = fn) },
    event: { subscribe: async function* () { await gate; yield* events; } },
  };
  await createPlugin({ decide: () => ({}), usageDir: dir }).setup(ctx);
  await hooks.context({ sessionID: 's9', agent: 'build', model: 'm9', system: [] });
  release();
  for (let i = 0; i < 20 && !readAll(dir).length; i++) await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 20));
  const r = rowsOf(dir).s9;
  assert.deepEqual([r.model, r.turns, r.in, r.out, r.cr], ['m9', 2, 8, 5, 1]);
});

test('the cleanup setup returns aborts the subscribe signal and ends the loop', async () => {
  let signal;
  let ended = false;
  const ctx = {
    location: { directory: '/x/proj' },
    session: { hook: () => {} },
    tool: { hook: () => {} },
    event: {
      subscribe: async function* (opts) {
        signal = opts.signal;
        try {
          await new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
        } finally {
          ended = true;
        }
      },
    },
  };
  const cleanup = await createPlugin({ decide: () => ({}), usageDir: tmp() }).setup(ctx);
  assert.equal(typeof cleanup, 'function');
  assert.equal(signal.aborted, false);
  cleanup();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(signal.aborted, true);
  assert.equal(ended, true);
});

test('a subscribe stream that throws fails open', async () => {
  const hooks = {};
  const ctx = {
    location: { directory: '/x/proj' },
    session: { hook: (n, fn) => (hooks[n] = fn) },
    tool: { hook: (n, fn) => (hooks[`tool.${n}`] = fn) },
    event: { subscribe: async function* () { throw new Error('stream down'); } },
  };
  const write = process.stderr.write;
  let seen = '';
  process.stderr.write = (s) => ((seen += s), true);
  try {
    await createPlugin({ decide: () => ({}), usageDir: tmp() }).setup(ctx);
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.stderr.write = write;
  }
  assert.match(seen, /usage failed open: stream down/);
});
