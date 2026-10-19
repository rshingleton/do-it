// Regression tests for bugs found in the hooks and the OpenCode plugin.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { BUILTIN, scan, loadChecks } from '../hooks/lib/checks.mjs';
import { beforeEdit, afterEdit, beforeShell } from '../hooks/lib/guard.mjs';
import { DEFAULTS } from '../skills/track-it/scripts/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Assembled at runtime so this file never holds a key-shaped literal.
const KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-hreg-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  return { dir, git };
}

const ctxFor = (root, cfg = {}) => ({ root, cfg: { ...DEFAULTS, ...cfg }, enabled: true, rules: loadChecks(root).rules });

test('NotebookEdit content and path are scanned', () => {
  const ctx = ctxFor(repo().dir);
  assert.equal(beforeEdit(ctx, { notebook_path: 'n.ipynb', new_source: `k = '${KEY}'` }).action, 'block');
  assert.equal(beforeEdit(ctx, { notebook_path: '.env', new_source: 'x' }).action, 'block');
});

test('git commit -a / -am scans tracked changes that are not staged yet', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 't.py'), 'x = 1\n');
  git('add', 't.py');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 't');
  fs.writeFileSync(path.join(dir, 't.py'), `k = "${KEY}"\n`);
  const ctx = ctxFor(dir);
  assert.equal(beforeShell(ctx, 'git commit -am wip').action, 'block');
  assert.equal(beforeShell(ctx, 'git commit --all -m wip').action, 'block');
});

test('commit detection: global options, no false hits on strings or commit-tree', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'a.js'), `k = "${KEY}"\n`);
  git('add', 'a.js');
  const ctx = ctxFor(os.tmpdir());
  assert.equal(beforeShell(ctx, `git -C ${dir} commit -m wip`).action, 'block');
  const here = ctxFor(dir);
  assert.equal(beforeShell(here, 'git -c user.name=x commit -m wip').action, 'block');
  assert.equal(beforeShell(here, "echo 'later: git commit'").action, 'allow');
  assert.equal(beforeShell(here, 'git commit-tree HEAD^{tree} -m x').action, 'allow');
});

test('staged non-ASCII paths are scanned', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'café.py'), `k = "${KEY}"\n`);
  git('add', 'café.py');
  assert.equal(beforeShell(ctxFor(dir), 'git commit -m x').action, 'block');
});

test('lint command quotes paths so $ and backticks are not expanded', () => {
  const { dir } = repo();
  const file = path.join(dir, 'app/routes/$id.tsx');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  assert.equal(afterEdit(ctxFor(dir, { DO_IT_LINT_CMD: 'ls {file}' }), { file_path: file }).action, 'allow');
});

test('interpolated credentials in URLs are not secrets', () => {
  const ids = (t) => scan(t, BUILTIN, 'a.env.example').map((f) => f.id);
  assert.deepEqual(ids('DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@db:5432/app'), []);
  assert.deepEqual(ids('const u = `postgres://${user}:${password}@${host}`'), []);
  const literal = ['postgres://admin', 'hunter22@db/app'].join(':');
  assert.deepEqual(scan(literal, BUILTIN, 'a.js').map((f) => f.id), ['credential-in-url']);
});

test('env template variants are allowed', () => {
  for (const f of ['.env.local.example', 'cfg/.env.test.example', '.env.sample', '.env.template']) {
    assert.deepEqual(scan('', BUILTIN, f), [], f);
  }
  for (const f of ['.env', '.env.local', 'cfg/.env.production']) {
    assert.deepEqual(scan('', BUILTIN, f).map((x) => x.id), ['env-file'], f);
  }
});

test('sk- prefixed identifiers are not API keys', () => {
  assert.deepEqual(scan('import sk-learn-classifier-something-long-name', BUILTIN, 'a.py'), []);
  const real = ['sk-', 'proj-', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');
  assert.deepEqual(scan(`k = "${real}"`, BUILTIN, 'a.py').map((f) => f.id), ['openai-anthropic-key']);
});

test('OpenCode: apply_patch is guarded, removed lines are not, patched .env is', async () => {
  const { dir } = repo();
  const { default: plugin } = await import('../.opencode/plugins/do-it.mjs');
  const hooks = await plugin({ directory: dir });
  const before = (tool, args) => hooks['tool.execute.before']({ tool }, { args });
  await assert.rejects(
    before('apply_patch', { patchText: `*** Begin Patch\n*** Update File: a.js\n@@\n+k = "${KEY}"\n*** End Patch` }),
    /aws-access-key/,
  );
  await before('patch', { patchText: `*** Begin Patch\n*** Update File: a.js\n@@\n-k = "${KEY}"\n*** End Patch` });
  await assert.rejects(before('patch', { patchText: '*** Begin Patch\n*** Add File: .env\n+A=1\n*** End Patch' }), /env-file/);
});

test('claude post-tool reports lint failures as additionalContext', () => {
  const { dir } = repo();
  const r = spawnSync('node', [path.join(ROOT, 'hooks/claude.mjs'), 'post-tool'], {
    input: JSON.stringify({ cwd: dir, tool_name: 'Edit', tool_input: { file_path: 'a.js', new_string: 'x' } }),
    encoding: 'utf8',
    env: { ...process.env, DO_IT_LINT_CMD: 'echo bad; exit 1' },
  });
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /lint failed[\s\S]*bad/);
});
