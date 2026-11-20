import { tmpDir } from './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitOut } from '../skills/do-it/scripts/git.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/build-it/scripts/parallel.mjs');

function repo() {
  const dir = path.join(tmpDir('do-it-par-'), 'repo');
  fs.mkdirSync(dir);
  gitOut(dir, ['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', 't'], ['user.email', 't@t'], ['commit.gpgsign', 'false']]) gitOut(dir, ['config', k, v]);
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'a.txt'), lines);
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.log\n');
  gitOut(dir, ['add', '-A']);
  gitOut(dir, ['commit', '-qm', 'init']);
  return dir;
}

function run(cwd, ...args) {
  return runEnv(cwd, {}, ...args);
}

function runEnv(cwd, env, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const write = (dir, f, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), text);
};
const show = (dir, rev, f) => gitOut(dir, ['show', `${rev}:${f}`]);
const state = (dir) => gitOut(dir, ['status', '--porcelain', '-uall']) + gitOut(dir, ['diff']) + gitOut(dir, ['diff', '--cached']);

test('snapshot adopts tracked edit and untracked file, leaves ignored and planning out', () => {
  const dir = repo();
  write(dir, 'b.txt', 'edited\n');
  write(dir, 'new.txt', 'new\n');
  write(dir, 'ignored.log', 'x');
  write(dir, 'docs/planning/p/README.md', 'plan');
  write(dir, 'docs/issues/1.md', 'issue');
  gitOut(dir, ['add', 'b.txt']);
  const before = state(dir);
  const out = run(dir, 'snapshot', 'w1', '--base', 'HEAD');
  assert.equal(out.branch, 'do-it/w1');
  assert.match(out.root, /\.do-it[\\/]w1$/);
  assert.equal(show(dir, out.snapshot, 'b.txt'), 'edited\n');
  assert.equal(show(dir, out.snapshot, 'new.txt'), 'new\n');
  const files = gitOut(dir, ['ls-tree', '-r', '--name-only', out.snapshot]);
  assert.doesNotMatch(files, /ignored\.log|planning|issues/);
  assert.equal(gitOut(dir, ['rev-parse', 'do-it/w1--snapshot']).trim(), out.snapshot);
  assert.equal(gitOut(dir, ['rev-parse', 'do-it/w1']).trim(), out.snapshot);
  assert.equal(gitOut(dir, ['rev-parse', 'HEAD']).trim(), gitOut(dir, ['rev-parse', 'main']).trim());
  assert.equal(state(dir), before, 'index, tree and branch untouched');
  assert.equal(gitOut(dir, ['stash', 'list']), '');
});

test('snapshot of a clean tree is the base sha', () => {
  const dir = repo();
  const out = run(dir, 'snapshot', 'w2', '--base', 'HEAD');
  assert.equal(out.snapshot, gitOut(dir, ['rev-parse', 'HEAD']).trim());
});

function scratchChange(dir, id, edit) {
  const wt = path.join(path.dirname(dir), 'wt');
  gitOut(dir, ['worktree', 'add', '-q', wt, `do-it/${id}`]);
  edit(wt);
  gitOut(wt, ['add', '-A']);
  gitOut(wt, ['commit', '-qm', 'scratch']);
  gitOut(dir, ['worktree', 'remove', '--force', wt]);
}

test('land applies the delta only and keeps the user edits', () => {
  const dir = repo();
  write(dir, 'b.txt', 'user edit\n');
  const lines = fs.readFileSync(path.join(dir, 'a.txt'), 'utf8').replace('line 1\n', 'user line\n');
  write(dir, 'a.txt', lines);
  run(dir, 'snapshot', 'w3', '--base', 'HEAD');
  scratchChange(dir, 'w3', (wt) => {
    write(wt, 'a.txt', fs.readFileSync(path.join(wt, 'a.txt'), 'utf8').replace('line 28\n', 'scratch line\n'));
    write(wt, 'c.txt', 'c\n');
  });
  const r = run(dir, 'land', 'w3');
  assert.equal(r.landed, true);
  assert.deepEqual([...r.files].sort(), ['a.txt', 'c.txt']);
  const a = fs.readFileSync(path.join(dir, 'a.txt'), 'utf8');
  assert.match(a, /user line/);
  assert.match(a, /scratch line/);
  assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'user edit\n');
  assert.equal(fs.readFileSync(path.join(dir, 'c.txt'), 'utf8'), 'c\n');
  assert.equal(gitOut(dir, ['diff', '--cached']), '', 'nothing staged');
});

test('land fails and changes nothing when the user made the added file', () => {
  const dir = repo();
  run(dir, 'snapshot', 'w4', '--base', 'HEAD');
  scratchChange(dir, 'w4', (wt) => {
    write(wt, 'b.txt', 'scratch b\n');
    write(wt, 'c.txt', 'scratch c\n');
  });
  write(dir, 'c.txt', 'mine\n');
  const before = state(dir);
  const r = run(dir, 'land', 'w4');
  assert.equal(r.landed, false);
  assert.equal(r.branch, 'do-it/w4');
  assert.ok(r.reason);
  assert.equal(state(dir), before);
  assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'b\n');
  assert.equal(fs.readFileSync(path.join(dir, 'c.txt'), 'utf8'), 'mine\n');
});

test('land fails and changes nothing on a conflicting hunk', () => {
  const dir = repo();
  run(dir, 'snapshot', 'w5', '--base', 'HEAD');
  scratchChange(dir, 'w5', (wt) => {
    write(wt, 'a.txt', fs.readFileSync(path.join(wt, 'a.txt'), 'utf8').replace('line 5\n', 'scratch 5\n'));
    write(wt, 'b.txt', 'scratch b\n');
  });
  write(dir, 'a.txt', fs.readFileSync(path.join(dir, 'a.txt'), 'utf8').replace('line 5\n', 'user 5\n'));
  const before = state(dir);
  const r = run(dir, 'land', 'w5');
  assert.equal(r.landed, false);
  assert.equal(state(dir), before);
  assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'b\n');
});

test('land keeps the bytes of a text file that is not valid UTF-8', () => {
  const dir = repo();
  run(dir, 'snapshot', 'w6', '--base', 'HEAD');
  const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
  scratchChange(dir, 'w6', (wt) => fs.writeFileSync(path.join(wt, 'notes.txt'), latin1));
  const r = run(dir, 'land', 'w6');
  assert.equal(r.landed, true);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'notes.txt')), latin1);
});

test('land ignores user diff config and reports non-ASCII names plainly', () => {
  const dir = repo();
  gitOut(dir, ['config', 'diff.noprefix', 'true']);
  gitOut(dir, ['config', 'color.diff', 'always']);
  gitOut(dir, ['config', 'diff.mnemonicPrefix', 'true']);
  gitOut(dir, ['config', 'core.quotePath', 'true']);
  run(dir, 'snapshot', 'w7', '--base', 'HEAD');
  scratchChange(dir, 'w7', (wt) => {
    write(wt, 'b.txt', 'scratch b\n');
    write(wt, 'caf\u00e9.txt', 'x\n');
  });
  const r = run(dir, 'land', 'w7');
  assert.equal(r.landed, true, r.reason);
  assert.deepEqual([...r.files].sort(), ['b.txt', 'caf\u00e9.txt']);
  assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'scratch b\n');
});

test('land with no delta lands nothing and succeeds', () => {
  const dir = repo();
  run(dir, 'snapshot', 'w8', '--base', 'HEAD');
  assert.deepEqual(run(dir, 'land', 'w8'), { landed: true, files: [] });
});

test('land of an unknown id names the missing branch, not a conflict', () => {
  const dir = repo();
  const r = run(dir, 'land', 'nope');
  assert.equal(r.landed, false);
  assert.match(r.reason, /no scratch branch/);
});

test('land writes the scratch bytes even when the user config fixes whitespace on apply', () => {
  const dir = repo();
  gitOut(dir, ['config', 'apply.whitespace', 'fix']);
  run(dir, 'snapshot', 'w9', '--base', 'HEAD');
  const text = 'a   \nb \t\n';
  scratchChange(dir, 'w9', (wt) => write(wt, 'ws.txt', text));
  const r = run(dir, 'land', 'w9');
  assert.equal(r.landed, true, r.reason);
  assert.equal(fs.readFileSync(path.join(dir, 'ws.txt'), 'utf8'), text);
});

test('snapshot works when the caller sets GIT_LITERAL_PATHSPECS', () => {
  const dir = repo();
  write(dir, 'new.txt', 'new\n');
  const out = runEnv(dir, { GIT_LITERAL_PATHSPECS: '1' }, 'snapshot', 'w10', '--base', 'HEAD');
  assert.equal(show(dir, out.snapshot, 'new.txt'), 'new\n');
});
