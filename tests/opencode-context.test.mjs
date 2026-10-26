// The OpenCode plugin builds the session context once, not on every model request.

import './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { createPlugin } from '../.opencode/plugins/do-it.mjs';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-ctx-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  return { dir, git };
}

// A decide that counts session builds and answers with the count.
function counting(extra = {}) {
  const calls = { session: 0 };
  const decide = (event) => {
    if (event !== 'session') return {};
    calls.session++;
    return { context: `ctx ${calls.session}`, ...extra };
  };
  return { decide, calls };
}

// The v2 ctx: records the hooks the plugin registers.
function v2ctx(dir) {
  const hooks = {};
  return {
    hooks,
    ctx: {
      location: { directory: dir },
      session: { hook: (name, fn) => (hooks[name] = fn) },
      tool: { hook: (name, fn) => (hooks[`tool.${name}`] = fn) },
    },
  };
}

test('v1 context hook builds the context once while HEAD and the index are unchanged', async () => {
  const { dir, git } = repo();
  const { decide, calls } = counting();
  const hooks = await createPlugin({ decide }).server({ directory: dir });
  const turn = async () => {
    const out = { system: [] };
    await hooks['experimental.chat.system.transform']({}, out);
    return out.system;
  };
  assert.deepEqual(await turn(), ['ctx 1']);
  assert.deepEqual(await turn(), ['ctx 1']);
  assert.equal(calls.session, 1);

  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'next');
  assert.deepEqual(await turn(), ['ctx 2']);
  assert.equal(calls.session, 2);
});

test('v2 context hook builds the context once while HEAD and the index are unchanged', async () => {
  const { dir, git } = repo();
  const { decide, calls } = counting();
  const { ctx, hooks } = v2ctx(dir);
  await createPlugin({ decide }).setup(ctx);
  const turn = async () => {
    const event = { system: [] };
    await hooks.context(event);
    return event.system;
  };
  assert.deepEqual(await turn(), [{ type: 'text', text: 'ctx 1' }]);
  assert.deepEqual(await turn(), [{ type: 'text', text: 'ctx 1' }]);
  assert.equal(calls.session, 1);

  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git('add', 'a.txt');
  await turn();
  assert.equal(calls.session, 2);
});

test('a session result that carries a notice is not cached', async () => {
  const { dir } = repo();
  const { decide, calls } = counting({ notice: 'config warning' });
  const hooks = await createPlugin({ decide }).server({ directory: dir });
  const write = process.stderr.write;
  process.stderr.write = () => true;
  try {
    await hooks['experimental.chat.system.transform']({}, { system: [] });
    await hooks['experimental.chat.system.transform']({}, { system: [] });
  } finally {
    process.stderr.write = write;
  }
  assert.equal(calls.session, 2);
});

test('outside a git directory the context is still built once per plugin instance', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-ctx-plain-'));
  const { decide, calls } = counting();
  const hooks = await createPlugin({ decide }).server({ directory: dir });
  await hooks['experimental.chat.system.transform']({}, { system: [] });
  await hooks['experimental.chat.system.transform']({}, { system: [] });
  assert.equal(calls.session, 1);
});
