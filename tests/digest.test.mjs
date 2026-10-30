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
  // Another run's phase tag sits in the same repo: it is not this run's rollback.
  git(dir, 'tag', 'do-it/other/phase-1');
  ok(work(dir, 'run', 'new', 'road', '--level', 'full'));
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'shipped'));
  ok(work(dir, 'run', 'slice', 'road', 'R2', 'parked', '--needs', 'decision', '--reason', 'storage engine unanswered'));
  ok(work(dir, 'run', 'slice', 'road', 'R3', 'blocked', '--reason', 'waits on R2'));
  ok(work(dir, 'run', 'set', 'road', 'assumptions', '["Retry once on timeout"]'));
  ok(work(dir, 'run', 'add-assumptions', 'road', 'feat', '["Default page size 50","Cache 5 min"]'));
  ok(work(dir, 'run', 'reject-assumption', 'road', 'feat#1', 'page', 'size', '25'));
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

test('run new records base, show reads it back, and a rejection keeps other keys', () => {
  const dir = fixture();
  const rec = JSON.parse(ok(work(dir, 'run', 'show', 'road')));
  assert.equal(rec.base, git(dir, 'rev-parse', 'HEAD'));
  assert.deepEqual(rec.assumptions, ['Retry once on timeout', 'feat#2: Cache 5 min']);
  assert.deepEqual(rec.rejected, ['feat#1: Default page size 50 (instead: page size 25)']);
  assert.equal(work(dir, 'run', 'reject-assumption', 'road', 'feat#1', 'x').status === 0, false);
});

test('run new outside git records base null', () => {
  const dir = tmpDir('do-it-nogit-');
  ok(work(dir, 'run', 'new', 'road'));
  assert.equal(JSON.parse(ok(work(dir, 'run', 'show', 'road'))).base, null);
});

test('rejecting an assumption after the item closed works through the run record', () => {
  const dir = fixture();
  ok(work(dir, 'new', 'gone', '--lane', 's', '--title', 'Gone'));
  ok(work(dir, 'run', 'add-assumptions', 'road', 'gone', '["Use utc"]'));
  ok(work(dir, 'set', 'gone', 'assumptions', '["Use utc"]'));
  ok(work(dir, 'event', 'gone', 'approve'));
  ok(work(dir, 'event', 'gone', 'start'));
  ok(work(dir, 'verify-phase', 'gone', '--', 'true'));
  ok(work(dir, 'event', 'gone', 'build-done'));
  ok(work(dir, 'event', 'gone', 'audit-pass'));
  ok(work(dir, 'event', 'gone', 'ship-prepared'));
  ok(work(dir, 'close', 'gone'));
  const out = JSON.parse(ok(work(dir, 'run', 'reject-assumption', 'road', 'gone#1', 'use', 'local', 'time')));
  assert.equal(out.reopened, false);
  assert.match(out.followup, /fix:/);
  assert.ok(out.record.rejected.some((r) => r.startsWith('gone#1: Use utc')));
});

// A repo whose run base is its first commit, with one change made after it.
function reviewFixture(commitMode, { commitChange }) {
  const dir = tmpDir('do-it-review-');
  git(dir, 'init', '-q', '-b', 'dev');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'a.js'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  ok(work(dir, 'run', 'new', 'road', '--commit', commitMode));
  fs.writeFileSync(path.join(dir, 'a.js'), 'two\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'new\n');
  fs.mkdirSync(path.join(dir, 'docs/planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/planning/plan.md'), 'a plan\n');
  if (commitChange) {
    git(dir, 'add', '-f', '-A');
    git(dir, 'commit', '-qm', 'run commit');
  }
  return dir;
}
const review = (dir) => JSON.parse(ok(work(dir, 'run', 'review-change', 'road')));

test('final review: --commit none reads the working tree against base, so its change set is not empty', () => {
  const r = review(reviewFixture('none', { commitChange: false }));
  assert.equal(r.mode, 'worktree');
  assert.deepEqual(r.files.map((f) => f.path).sort(), ['a.js', 'b.js'], 'untracked files count, planning files do not');
});

test('final review: committed work with a clean tree reads <base>...HEAD, planning files left out', () => {
  const r = review(reviewFixture('phase', { commitChange: true }));
  assert.equal(r.mode, 'range');
  assert.deepEqual(r.files.map((f) => f.path).sort(), ['a.js', 'b.js']);
});

test('final review: uncommitted closing docs in a committed run read the working tree', () => {
  const dir = reviewFixture('phase', { commitChange: true });
  fs.writeFileSync(path.join(dir, 'TODO.md'), 'closing docs, not committed yet\n');
  const r = review(dir);
  assert.equal(r.mode, 'worktree');
  assert.deepEqual(r.files.map((f) => f.path).sort(), ['TODO.md', 'a.js', 'b.js']);
});

test('digest rollback lists only this run\'s phase tags', () => {
  const text = ok(work(fixture(), 'run', 'digest', 'road', ...ARGS));
  assert.match(text, /## Rollback \(1\)/);
  assert.doesNotMatch(text, /do-it\/other\/phase-1/);
});

test('digest shows what became of each retried slice', () => {
  const dir = fixture();
  // R2 was parked, resumed and shipped; R3 was blocked, resumed and parked again; R4 never ran again.
  ok(work(dir, 'run', 'slice', 'road', 'R2', 'ready'));
  ok(work(dir, 'run', 'slice', 'road', 'R2', 'shipped'));
  ok(work(dir, 'run', 'slice', 'road', 'R3', 'ready'));
  ok(work(dir, 'run', 'slice', 'road', 'R3', 'parked', '--needs', 'user', '--reason', 'FLAKY: check passed on rerun'));
  ok(work(dir, 'run', 'slice', 'road', 'R4', 'parked', '--needs', 'user', '--reason', 'IRREVERSIBLE'));
  ok(work(dir, 'run', 'slice', 'road', 'R4', 'ready'));
  const text = ok(work(dir, 'run', 'digest', 'road', ...ARGS));
  assert.match(text, /## Retried \(3\)/);
  assert.match(text, /- R2: was parked \(storage engine unanswered\), now shipped/);
  assert.match(text, /- R3: was blocked \(waits on R2\), now parked \(FLAKY: check passed on rerun\)/);
  assert.match(text, /- R4: was parked \(IRREVERSIBLE\), now not run again yet/);
});
