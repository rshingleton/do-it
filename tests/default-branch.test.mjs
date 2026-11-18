// Import env first: static imports run in source order, and the isolation must
// be in place before any other module reads the environment.
import { tmpDir } from './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { protectedBranches } from '../skills/setup-it/scripts/default-branch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A real clone, so origin/HEAD is set the way `git clone` sets it, with an
// optional .do-it/config.env.
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

test('setup-it: a feature/x default branch gets it added, slash and all', () => {
  const r = protectedBranches(clonedRepo('feature/x'));
  assert.deepEqual([r.default, r.value, r.write], ['feature/x', 'main,master,feature/x', true]);
});

test('setup-it: main, master or an already listed default branch writes nothing', () => {
  for (const b of ['main', 'master']) assert.equal(protectedBranches(clonedRepo(b)).write, false, b);
  const listed = protectedBranches(clonedRepo('trunk', 'DO_IT_PROTECTED_BRANCHES=main,trunk\n'));
  assert.deepEqual([listed.write, listed.value], [false, 'main,trunk']);
});

// The protected list is comma-separated, so a name holding a comma would split
// into two entries.
test('setup-it: a default branch whose name holds a comma is not proposed', () => {
  const r = protectedBranches(clonedRepo('release,1'));
  assert.deepEqual([r.default, r.skipped, r.value, r.write], ['release,1', 'comma in the name', 'main,master', false]);
});

// A symbolic ref survives the branch it names, so only rev-parse --verify says
// the target is really there.
test('setup-it: a dangling origin/HEAD proposes nothing', () => {
  const dir = clonedRepo('trunk');
  execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/gone'], { cwd: dir });
  const r = protectedBranches(dir);
  assert.deepEqual([r.skipped, r.value, r.write], ['dangling origin/HEAD', 'main,master', false]);
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

// A missing git is a broken install, not an answer to print, so the throw is
// deliberate and is pinned here rather than caught.
test('setup-it: a git that cannot spawn throws', () => {
  const dir = clonedRepo('trunk');
  const saved = process.env.PATH;
  process.env.PATH = tmpDir('do-it-nogit-');
  try {
    assert.throws(() => protectedBranches(dir), /ENOENT/);
  } finally {
    process.env.PATH = saved;
  }
});
