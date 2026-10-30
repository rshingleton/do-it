import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const EXPECTED = path.join(ROOT, 'tests/fixtures/digest-expected.md');

const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { status: r.status, stdout: r.stdout };
}
const ok = (r) => {
  assert.equal(r.status, 0, r.stdout);
  return r.stdout;
};

function fixture() {
  const dir = tmpDir('do-it-digest-');
  git(dir, 'init', '-q', '-b', 'dev');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(dir, 'tag', 'do-it/feat/phase-1');
  ok(work(dir, 'run', 'new', 'road', '--level', 'full'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'shipped'));
  ok(work(dir, 'run', 'slice', 'road', 'R2', 'parked', '--needs', 'decision', '--reason', 'storage engine unanswered'));
  ok(work(dir, 'run', 'slice', 'road', 'R3', 'blocked', '--reason', 'waits on R2'));
  ok(work(dir, 'run', 'set', 'road', 'assumptions', '["Default page size 50","Retry once on timeout"]'));
  ok(work(dir, 'run', 'set', 'road', 'limits', JSON.stringify([
    'no browser: layout not seen',
    'marker: src/a.js shortcut: one worker, add a pool at 100 jobs',
    'marker: src/b.js shortcut: global cache',
  ])));
  return dir;
}

const ARGS = ['--usage', '{"input":1200,"output":340}', '--findings', '["gh-7","gh-8"]', '--retro', '["tests first","flaky net check","pin the fixture","file R2 answer"]'];

test('digest matches the expected file, with a stubbed usage input', () => {
  const dir = fixture();
  // started is a clock value: pin it so the output is deterministic.
  const rec = path.join(dir, 'docs/planning/road.run/RUN.md');
  fs.writeFileSync(rec, fs.readFileSync(rec, 'utf8').replace(/started: .*/, 'started: 2026-10-30'));
  const text = ok(work(dir, 'run', 'digest', 'road', ...ARGS));
  assert.equal(text, fs.readFileSync(EXPECTED, 'utf8'));
  assert.match(text, /no-trigger/);
  assert.match(text, /git revert --no-edit do-it\/feat\/phase-1/);
});

test('digest carries no estimate phrase', () => {
  const text = ok(work(fixture(), 'run', 'digest', 'road', ...ARGS));
  for (const w of ['saved', 'faster', 'cheaper', 'hours', 'dollars', '$']) assert.ok(!text.toLowerCase().includes(w), `digest has "${w}"`);
});

test('digest is saved under the planning directory and stays untracked', () => {
  const dir = fixture();
  ok(work(dir, 'run', 'digest', 'road'));
  const saved = path.join(dir, 'docs/planning/road.run/DIGEST.md');
  assert.ok(fs.existsSync(saved));
  assert.match(git(dir, 'status', '--porcelain', '--untracked-files=all'), /\?\? docs\/planning\/road\.run\/DIGEST\.md/);
});

test('rejecting an assumption fires reject-assumption for the slice item', () => {
  const dir = fixture();
  ok(work(dir, 'new', 'feat', '--lane', 's', '--title', 'Feature'));
  ok(work(dir, 'set', 'feat', 'assumptions', '["Default page size 50"]'));
  ok(work(dir, 'event', 'feat', 'approve'));
  ok(work(dir, 'event', 'feat', 'start'));
  ok(work(dir, 'verify-phase', 'feat', '--', 'true'));
  ok(work(dir, 'event', 'feat', 'build-done'));
  const out = JSON.parse(ok(work(dir, 'event', 'feat', 'reject-assumption', '1', 'page', 'size', '25')));
  assert.equal(out.status, 'building');
  assert.deepEqual(out.assumptions, []);
  assert.match(out.fix[0], /Rejected assumption: Default page size 50\. Instead: page size 25/);
});
