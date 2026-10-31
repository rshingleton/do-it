import { tmpDir } from './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkExternalDirectory as check, checkRepo } from '../skills/setup-it/scripts/opencode-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = (v) => JSON.stringify({ permission: { external_directory: v } });

test('allow is flagged, ask and deny pass', () => {
  assert.equal(check(cfg('allow')).status, 'allow');
  assert.equal(check(cfg('ask')).status, 'ok');
  assert.equal(check(cfg('deny')).status, 'ok');
});

test('a missing key or permission block is flagged', () => {
  assert.equal(check('{}').status, 'missing');
  assert.equal(check('{"permission":{"bash":"ask"}}').status, 'missing');
});

test('object form is judged by its "*" entry', () => {
  assert.equal(check(cfg({ '*': 'ask', '/tmp/**': 'allow' })).status, 'ok');
  assert.equal(check(cfg({ '*': 'allow' })).status, 'allow');
  assert.equal(check(cfg({ '/tmp/**': 'allow' })).status, 'missing');
});

test('comments and trailing commas parse; URLs in strings survive', () => {
  const r = check('{\n // note\n "x": "http://a/b", /* c */\n "permission": {"external_directory": "ask",},\n}');
  assert.deepEqual([r.status, r.comments], ['ok', true]);
  assert.equal(check('{}').comments, false);
});

test('invalid JSON or a string permission is reported, not thrown', () => {
  assert.equal(check('{nope').status, 'invalid');
  assert.equal(check('{"permission":"allow"}').status, 'invalid');
});

test('repo discovery: no OpenCode skips, .opencode alone is missing, file is read', () => {
  const dir = tmpDir('do-it-oc-');
  assert.equal(checkRepo(dir).applies, false);
  fs.mkdirSync(path.join(dir, '.opencode'));
  assert.deepEqual([checkRepo(dir).applies, checkRepo(dir).status], [true, 'missing']);
  fs.writeFileSync(path.join(dir, 'opencode.jsonc'), cfg('allow'));
  const r = spawnSync('node', ['skills/setup-it/scripts/opencode-check.mjs', dir], { cwd: ROOT, encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.deepEqual([out.file, out.status], ['opencode.jsonc', 'allow']);
});

// setup-it writes DO_IT_PROTECTED_BRANCHES from the remote's default branch.
import { execFileSync } from 'node:child_process';
import { protectedBranches } from '../skills/setup-it/scripts/default-branch.mjs';

function clonedRepo(defaultBranch, extra = '') {
  const remote = tmpDir('do-it-pb-remote-');
  const work = tmpDir('do-it-pb-seed-');
  const run = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
  run(remote, 'init', '-q', '--bare', '-b', defaultBranch);
  run(work, 'init', '-q', '-b', defaultBranch);
  run(work, 'config', 'user.name', 't');
  run(work, 'config', 'user.email', 't@t');
  fs.writeFileSync(path.join(work, 'a.txt'), 'x\n');
  run(work, 'add', '-A');
  run(work, 'commit', '-qm', 'init');
  run(work, 'remote', 'add', 'origin', remote);
  run(work, 'push', '-q', 'origin', defaultBranch);
  const dir = path.join(tmpDir('do-it-pb-clone-'), 'repo');
  execFileSync('git', ['clone', '-q', remote, dir], { encoding: 'utf8' });
  if (extra) {
    fs.mkdirSync(path.join(dir, '.do-it'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.do-it/config.env'), extra);
  }
  return dir;
}

test('setup-it: a remote whose default branch is trunk gets it added to the protected branches', () => {
  const r = protectedBranches(clonedRepo('trunk'));
  assert.deepEqual([r.default, r.current, r.value, r.write], ['trunk', 'main,master', 'main,master,trunk', true]);
});

test('setup-it: main, master or an already listed default branch writes nothing', () => {
  for (const b of ['main', 'master']) assert.equal(protectedBranches(clonedRepo(b)).write, false, b);
  const listed = protectedBranches(clonedRepo('trunk', 'DO_IT_PROTECTED_BRANCHES=main,trunk\n'));
  assert.deepEqual([listed.write, listed.value], [false, 'main,trunk']);
});

test('setup-it: a repo with no remote HEAD reports no default and writes nothing', () => {
  const dir = tmpDir('do-it-pb-none-');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const r = protectedBranches(dir);
  assert.deepEqual([r.default, r.write, r.value], [null, false, 'main,master']);
  const cli = spawnSync('node', [path.join(ROOT, 'skills/setup-it/scripts/default-branch.mjs'), dir], { encoding: 'utf8' });
  assert.equal(cli.status, 0);
  assert.equal(JSON.parse(cli.stdout).write, false);
});
