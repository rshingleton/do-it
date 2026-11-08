import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

// A planning directory beside the code repository (a separate ops repository) is a supported layout:
// there is nothing of it inside the repo to exclude, so the change commands must not pass it to git.
test('verify, audit and the fingerprint work when the planning dir is outside the repo', () => {
  const parent = tmpDir('do-it-outside-');
  const repo = path.join(parent, 'code');
  const planning = path.join(parent, 'ops', 'docs', 'planning');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(planning, { recursive: true });
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'user.email', 't@t');
  git(repo, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, 'a.js'), 'one\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'init');

  const run = (...args) => {
    const r = spawnSync('node', [WORK, ...args], {
      cwd: repo, encoding: 'utf8',
      env: { ...process.env, XDG_CONFIG_HOME: repo, DO_IT_PLANNING_DIR: planning },
    });
    return { status: r.status, out: JSON.parse(r.stdout) };
  };
  const ok = (r) => { assert.equal(r.status, 0, JSON.stringify(r.out)); return r.out; };

  ok(run('new', 'feat', '--lane', 's', '--title', 'Feat'));
  ok(run('event', 'feat', 'approve'));
  ok(run('event', 'feat', 'start'));
  fs.writeFileSync(path.join(repo, 'a.js'), 'two\n');
  const fp = ok(run('fingerprint', 'feat'));
  assert.ok(fp.fingerprint, 'a fingerprint is computed');
  ok(run('verify-phase', 'feat', '--', 'true'));
  ok(run('event', 'feat', 'build-done'));
  ok(run('event', 'feat', 'audit-pass'));
});
