// Phase 6 of tracks-mode: the mode is recorded in ADR 0012, a run refuses more than one track when
// its commit mode writes no branch, and DO_IT_TRACKS, finish-it and LANES.md each state it once.

import { cleanEnv, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

function work(dir, args, env = cleanEnv()) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env });
  return { status: r.status, out: JSON.parse(r.stdout) };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};

function repo() {
  const dir = tmpDir('do-it-guard-');
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return dir;
}

const text = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('run new refuses --tracks above 1 with --commit none, naming the branch each track would miss', () => {
  const dir = repo();
  const r = work(dir, ['run', 'new', 'road', '--tracks', '2', '--commit', 'none']);
  assert.equal(r.status, 1);
  assert.match(r.out.error, /--tracks 2/);
  assert.match(r.out.error, /commit mode is none/);
  assert.match(r.out.error, /no branch to merge/);
  assert.equal(fs.existsSync(path.join(dir, 'docs/planning/road.run/RUN.md')), false, 'no record is written');
  // One track with nothing to commit is how a run starts today.
  assert.equal(ok(work(dir, ['run', 'new', 'solo', '--commit', 'none'])).tracks, 1);
});

test('a config that resolves the mode to none refuses the same way: DO_IT_COMMIT=never, no flag', () => {
  const dir = repo();
  const env = cleanEnv({ DO_IT_COMMIT: 'never' });
  const r = work(dir, ['run', 'new', 'road', '--tracks', '2'], env);
  assert.equal(r.status, 1);
  assert.match(r.out.error, /commit mode is none/);
  assert.match(r.out.error, /DO_IT_COMMIT=never/);
  // The flag is the explicit ask, so it wins over the config and the pair is allowed.
  assert.equal(ok(work(dir, ['run', 'new', 'asked', '--tracks', '2', '--commit', 'phase'], env)).tracks, 2);
});

test('run tracks refuses a record set to none before it starts a worktree', () => {
  const dir = repo();
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/roadmap/r.md'), '# R\n\n| Slice | Kind | Delivers | Risk | Blocked by | Status |\n|---|---|---|---|---|---|\n| R1 | feat | api | low | - | ready |\n');
  ok(work(dir, ['run', 'new', 'road', '--tracks', '2']));
  ok(work(dir, ['run', 'set', 'road', 'commit', 'none']));
  const r = work(dir, ['run', 'tracks', 'road', 'docs/roadmap/r.md']);
  assert.equal(r.status, 1);
  assert.match(r.out.error, /commit mode is none/);
  assert.match(r.out.error, /no branch to merge/);
});

test('ADR 0012 is Proposed or Accepted, carries the measured shares and the width rule', () => {
  const adr = text('docs/adr/0012-coordinator-plus-tracks.md');
  assert.match(adr, /^---\nstatus: (Proposed|Accepted)\n---/, 'the ADR is proposed or accepted');
  for (const want of ['1.08x', '1.19x', '1.65x', '2.0x', 'DO_IT_TRACKS', 'serial', '0008-opt-in-run-commits.md']) {
    assert.ok(adr.includes(want), `the ADR records ${want}`);
  }
  assert.match(adr, /Width is `min\(ready independent slices, tracks, DO_IT_TRACKS\)`/, 'the width rule is the three terms the function uses, under the ceiling');
  assert.doesNotMatch(adr, /resource cap/, 'the machine cap no caller produces is not part of the rule');
});

test('DO_IT_TRACKS sits beside the run keys, and the two skills state the mode and link the contract', () => {
  const config = text('skills/track-it/CONFIG.md');
  const row = config.split('\n').find((l) => l.includes('`DO_IT_TRACKS`'));
  assert.ok(row, 'DO_IT_TRACKS is a documented key');
  assert.match(row, /\| `3` \|/, 'its default is the measured 3');
  assert.match(row, /`--tracks/, 'the override flag is named');
  assert.match(row, /\b5\b/, 'the hard ceiling is named');
  assert.match(config, /more than one track needs a commit mode that writes a branch/);
  const lanes = text('skills/do-it/LANES.md');
  assert.match(lanes, /`--tracks N`/, 'LANES.md names the mode');
  assert.match(lanes, /\.\.\/finish-it\/TRACKS\.md/, 'LANES.md links the contract instead of restating it');
  const track = text('skills/finish-it/TRACKS.md');
  assert.match(track, /`--commit none`/, 'finish-it states where the mode stops');
  assert.match(track, /no branch to merge/);
});
