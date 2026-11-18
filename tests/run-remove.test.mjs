import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lockPath, STALE_MS } from '../skills/do-it/scripts/check-slot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const ROADMAP = 'docs/roadmap/road.md';

const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { status: r.status, stdout: r.stdout };
}
const ok = (r) => {
  assert.equal(r.status, 0, r.stdout);
  return JSON.parse(r.stdout);
};
const runDir = (dir) => path.join(dir, 'docs/planning/road.run');
const remove = (dir, slug = 'road') => work(dir, 'run', 'remove', slug, ROADMAP);

function writeRoadmap(dir, rows) {
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  const lines = rows.map(([id, blockedBy, status]) => `| ${id} | build | ${id} | G1 | ${blockedBy} | v | low | ${status} |`);
  fs.writeFileSync(
    path.join(dir, ROADMAP),
    `### M1\n\n| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |\n|---|---|---|---|---|---|---|---|\n${lines.join('\n')}\n`,
  );
}

// A run on a two-slice roadmap. R1 shipped; R2 shipped too when r2 is "shipped", else parked (resumable).
function fixture(r2 = 'parked') {
  const dir = tmpDir('do-it-run-remove-');
  git(dir, 'init', '-q', '-b', 'dev');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  writeRoadmap(dir, [['R1', 'none', 'shipped 2026-11-01 x'], ['R2', 'none', r2 === 'shipped' ? 'shipped 2026-11-01 x' : '']]);
  ok(work(dir, 'run', 'new', 'road', '--level', 'full'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'shipped'));
  if (r2 === 'shipped') ok(work(dir, 'run', 'slice', 'road', 'R2', 'shipped'));
  else ok(work(dir, 'run', 'slice', 'road', 'R2', 'parked', '--needs', 'decision', '--reason', 'unanswered'));
  return dir;
}

// Refused, with the record still on disk.
function refused(dir, pattern, slug = 'road') {
  const r = remove(dir, slug);
  assert.equal(r.status, 1, r.stdout);
  assert.match(JSON.parse(r.stdout).error, pattern);
  assert.ok(fs.existsSync(runDir(dir)), 'the run folder is kept');
}

test('run remove deletes the folder of a run whose roadmap is all shipped, and lists nothing tracked', () => {
  const dir = fixture('shipped');
  const out = ok(remove(dir));
  assert.equal(out.removed, 'docs/planning/road.run');
  assert.deepEqual(out.tracked, []);
  assert.ok(!fs.existsSync(runDir(dir)));
});

test('run remove names the run folder files git tracks, so the caller can git rm them', () => {
  const dir = fixture('shipped');
  git(dir, 'add', '-f', 'docs/planning/road.run');
  git(dir, 'commit', '-q', '-m', 'sweep the run record in');
  const out = ok(remove(dir));
  assert.deepEqual(out.tracked, ['docs/planning/road.run/RUN.md']);
});

test('run remove keeps the record of a run with a parked slice: it is resumable and the reason lives there', () => {
  const dir = fixture();
  refused(dir, /R2/);
  assert.match(fs.readFileSync(path.join(runDir(dir), 'RUN.md'), 'utf8'), /unanswered/, 'the parked reason is still on disk');
});

test('run remove keeps the record of a run with a blocked slice', () => {
  const dir = fixture('shipped');
  ok(work(dir, 'run', 'slice', 'road', 'R3', 'blocked'));
  refused(dir, /R3/);
});

test('run remove refuses a run with an open slice and keeps the folder', () => {
  const dir = fixture();
  ok(work(dir, 'run', 'start', 'road', 'R3', '--work', 'feat'));
  refused(dir, /R3/);
});

test('run remove refuses a roadmap that still has a slice nobody started, though every recorded slice shipped', () => {
  const dir = fixture('shipped');
  writeRoadmap(dir, [['R1', 'none', 'shipped 2026-11-01 x'], ['R2', 'none', 'shipped 2026-11-01 x'], ['R3', 'none', '']]);
  refused(dir, /not finished[\s\S]*R3/);
});

test('run remove refuses a roadmap whose unshipped slices are neither ready nor waiting: a Blocked-by cycle', () => {
  const dir = fixture('shipped');
  writeRoadmap(dir, [['R1', 'none', 'shipped 2026-11-01 x'], ['R2', 'none', 'shipped 2026-11-01 x'], ['R3', 'R4', ''], ['R4', 'R3', '']]);
  refused(dir, /not finished[\s\S]*R3/);
});

test('run remove refuses a completed roadmap that still has an unshipped slice', () => {
  const dir = fixture('shipped');
  writeRoadmap(dir, [['R1', 'none', 'shipped 2026-11-01 x'], ['R2', 'none', 'shipped 2026-11-01 x'], ['R3', 'none', '']]);
  const file = path.join(dir, ROADMAP);
  fs.writeFileSync(file, '---\ncompleted: 2026-11-01\n---\n' + fs.readFileSync(file, 'utf8'));
  refused(dir, /not finished[\s\S]*R3/);
});

test('run remove removes a run whose recorded parked slice the roadmap has since dropped', () => {
  const dir = fixture();
  writeRoadmap(dir, [['R1', 'none', 'shipped 2026-11-01 x'], ['R2', 'none', 'dropped 2026-11-02 no longer needed']]);
  ok(remove(dir));
  assert.ok(!fs.existsSync(runDir(dir)));
});

test('run remove refuses a roadmap with no parsed slices: a wrong or broken file is not a finished run', () => {
  const dir = fixture('shipped');
  writeRoadmap(dir, []);
  refused(dir, /not finished[\s\S]*no slices/);
});

test('run remove removes a run whose recorded parked slice the roadmap shows shipped: the roadmap is the authority', () => {
  const dir = fixture();
  writeRoadmap(dir, [['R1', 'none', 'shipped 2026-11-01 x'], ['R2', 'none', 'shipped 2026-11-02 elsewhere']]);
  ok(remove(dir));
  assert.ok(!fs.existsSync(runDir(dir)));
});

test('run remove says what to do next for an unshipped roadmap slice', () => {
  const dir = fixture('shipped');
  writeRoadmap(dir, [['R1', 'none', 'shipped 2026-11-01 x'], ['R2', 'none', 'shipped 2026-11-01 x'], ['R3', 'none', '']]);
  refused(dir, /ship or drop/);
});

test('run remove refuses a run stopped at its slice cap while a slice is left', () => {
  const dir = fixture('shipped');
  ok(work(dir, 'run', 'set', 'road', 'max_slices', '2'));
  writeRoadmap(dir, [['R1', 'none', 'shipped 2026-11-01 x'], ['R2', 'none', 'shipped 2026-11-01 x'], ['R3', 'none', '']]);
  refused(dir, /R3/);
});

test('run remove needs the roadmap file, and refuses an unknown slug', () => {
  const dir = fixture('shipped');
  const bare = work(dir, 'run', 'remove', 'road');
  assert.equal(bare.status, 1, bare.stdout);
  assert.match(JSON.parse(bare.stdout).error, /roadmap/);
  assert.ok(fs.existsSync(runDir(dir)));
  const r = remove(dir, 'nope');
  assert.equal(r.status, 1, r.stdout);
  assert.ok(fs.existsSync(runDir(dir)));
});

test('run remove refuses while a fresh checks.lock is held, and a stale lock does not block', () => {
  const dir = fixture('shipped');
  const lock = lockPath(path.join(dir, 'docs/planning'), 'road');
  fs.writeFileSync(lock, '1\n');
  refused(dir, /checks\.lock/);
  const old = new Date(Date.now() - STALE_MS - 60000);
  fs.utimesSync(lock, old, old);
  ok(remove(dir));
  assert.ok(!fs.existsSync(runDir(dir)));
});

test('finish-it DIGEST.md: the run is recorded and removed only after the assumption review, and only when run next left nothing', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'skills/finish-it/DIGEST.md'), 'utf8');
  const text = raw.replace(/\s+/g, ' ');
  for (const needle of ['run entry', 'closing report', 'run remove']) assert.ok(text.includes(needle), `missing: ${needle}`);
  assert.doesNotMatch(text, /saves `<planning dir>\/<slug>\.run\/DIGEST\.md`/);
  const review = raw.indexOf('## 3. Assumption review');
  assert.ok(review > 0, 'the assumption review section exists');
  assert.ok(raw.indexOf('work.mjs run remove') > review, 'run remove comes after the assumption review, which needs the record');
  assert.ok(text.includes('No rejection pending'), 'section 3 hands on to section 4 instead of declaring the run final');
  const finish = text.slice(text.indexOf('Finish the run'));
  assert.ok(finish.includes('--resume'), 'a run with a parked slice keeps its record for --resume');
  assert.ok(finish.includes('`run next`') && finish.includes('`next` null') && finish.includes('`stop`') && finish.includes('`defects`') && finish.includes('`waiting`'), 'final means run next left nothing: no next, stop, defects or waiting');
  assert.ok(finish.includes('already in `history.md`'), 'a retry skips an entry that is already written');
  assert.ok(finish.includes('run remove <slug> <roadmap>'), 'remove is given the roadmap file, as run next is');
  assert.ok(finish.includes('`tracked`') && finish.includes('git rm'), 'a run folder a commit swept in is git rm-ed');
  assert.ok(finish.includes('closing-docs commit'), 'the entry and the removal ride the run\'s closing-docs commit');
});
