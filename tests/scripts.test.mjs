import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('repo check passes', () => {
  const r = spawnSync('node', ['scripts/check.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
});

test('OpenCode commands are generated from the skills', () => {
  const r = spawnSync('node', ['scripts/gen-opencode.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('fingerprint changes with tracked and untracked edits, ignores planning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-fp-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  const fp = () => execFileSync('bash', [path.join(ROOT, 'skills/do-it/scripts/fingerprint.sh'), 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

  const empty = fp();
  fs.mkdirSync(path.join(dir, 'docs/planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/planning/x.md'), 'plan');
  assert.equal(fp(), empty);
  fs.writeFileSync(path.join(dir, 'new file.js'), 'a');
  const withNew = fp();
  assert.notEqual(withNew, empty);
  fs.writeFileSync(path.join(dir, 'new file.js'), 'b');
  assert.notEqual(fp(), withNew);
});

test('tracker CLI runs through a symlink and prints JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-cli-'));
  fs.mkdirSync(path.join(dir, '.git'));
  const link = path.join(dir, 'tracker-link');
  fs.symlinkSync(path.join(ROOT, 'skills/tracker'), link);
  const out = execFileSync('node', [path.join(link, 'scripts/tracker.mjs'), 'create', '--title', 'Hello', '--body', 'b'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: dir, DO_IT_TRACKER: 'local' },
  });
  assert.equal(JSON.parse(out).ref, 'docs/issues/hello.md');
  assert.ok(fs.existsSync(path.join(dir, 'docs/issues/hello.md')));
});
