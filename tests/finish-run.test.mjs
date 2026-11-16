import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');

function work(dir, ...args) {
  return workIn({}, dir, ...args);
}

function workIn(env, dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir, ...env } });
  return { status: r.status, out: JSON.parse(r.stdout) };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};

// R2 cannot proceed; R3 waits on R2, R4 on R3; R1, R5 and R6 (on R1) are independent.
const ROWS = {
  R1: 'none',
  R2: 'none',
  R3: 'R2',
  R4: 'R3',
  R5: 'none',
  R6: 'R1',
};

function fixture() {
  const dir = tmpDir('do-it-finish-');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  const file = path.join(dir, 'docs/roadmap/road.md');
  const status = {};
  const save = () => {
    const rows = Object.entries(ROWS).map(([id, b]) => `| ${id} | build | ${id} | G1 | ${b} | v | low | ${status[id] ?? ''} |`);
    fs.writeFileSync(file, `### M1\n\n| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
  };
  save();
  return { dir, ship: (id) => { status[id] = 'shipped 2026-10-30 x'; save(); } };
}

// The loop finish-it describes: ask the script for the next slice, build it,
// park it when it cannot go on. `blocked` names slices whose build parks.
function drive(dir, blocked, ship, started) {
  for (let i = 0; i < 20; i++) {
    const { next } = ok(work(dir, 'run', 'next', 'road', 'docs/roadmap/road.md'));
    if (!next) return;
    started.push(next);
    if (blocked.has(next)) ok(work(dir, 'run', 'slice', 'road', next, 'parked', '--needs', 'decision', '--reason', 'needs an answer'));
    else {
      ship(next);
      ok(work(dir, 'run', 'slice', 'road', next, 'shipped'));
    }
  }
  assert.fail('the loop did not end');
}

test('finish-it run: a parked slice leaves exactly its dependents unstarted, resume continues', () => {
  const { dir, ship } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  const started = [];
  drive(dir, new Set(['R2']), ship, started);
  assert.deepEqual(started.sort(), ['R1', 'R2', 'R5', 'R6'], 'R3 and R4 never start');
  const stop = ok(work(dir, 'run', 'next', 'road', 'docs/roadmap/road.md'));
  assert.deepEqual(stop, { next: null, parked: ['R2'], waiting: ['R3', 'R4'], defects: [] });

  // Resume: the user settled the question, so R2 rejoins and its dependents follow.
  ok(work(dir, 'run', 'slice', 'road', 'R2', 'ready'));
  const again = [];
  drive(dir, new Set(), ship, again);
  assert.deepEqual(again, ['R2', 'R3', 'R4']);
  assert.deepEqual(ok(work(dir, 'run', 'show', 'road')).slices.map((s) => s.id).sort(), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
});

test('finish-it run: a blocked slice in the record is skipped like a parked one', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'blocked'));
  const r = ok(work(dir, 'run', 'next', 'road', 'docs/roadmap/road.md'));
  assert.equal(r.next, 'R2');
  assert.deepEqual(r.waiting, ['R6']);
});

test('finish-it run: next needs a run record and a roadmap file', () => {
  const { dir } = fixture();
  assert.equal(work(dir, 'run', 'next', 'road', 'docs/roadmap/road.md').status, 1);
  ok(work(dir, 'run', 'new', 'road'));
  assert.equal(work(dir, 'run', 'next', 'road').status, 1);
});

// Two checkouts, one planning dir: a record made in A is visible in B, so B's commands
// must refuse rather than read a record that is not its own.
function pair() {
  const a = fixture().dir;
  const b = tmpDir('do-it-finish-b-');
  execFileSync('git', ['init', '-q'], { cwd: b });
  const planningDir = tmpDir('do-it-finish-runs-');
  const env = { DO_IT_PLANNING_DIR: planningDir };
  return { a, b, planningDir, env, inA: (...args) => workIn(env, a, ...args), inB: (...args) => workIn(env, b, ...args) };
}

// The record stores the repo's real path in posix form. Windows spells one path two ways,
// so a check folds case there, as the record's own guard does.
const posixRoot = (dir) => fs.realpathSync.native(dir).split(path.sep).join('/');
const mentions = (text, p) => (process.platform === 'win32' ? text.toLowerCase().includes(p.toLowerCase()) : text.includes(p));

// Every run subcommand but new acts on the record, so every one of them refuses.
const COMMANDS = [
  ['show', 'road'],
  ['set', 'road', 'level', 'lite'],
  ['slice', 'road', 'R1', 'shipped'],
  ['next', 'road', 'docs/roadmap/road.md'],
  ['contract', 'road'],
  ['tracks', 'road', 'docs/roadmap/road.md'],
  ['start', 'road', 'R1', '--work', 'w'],
  ['audit', 'road', 'R1'],
  ['gate', 'road', 'R1'],
  ['verify', 'road', 'R1', '--', 'node', '-e', '0'],
  ['review-change', 'road'],
  ['commit', 'road', 'w', '--paths', 'a'],
  ['digest', 'road'],
  ['add-assumptions', 'road', 'w', '["a"]'],
  ['reject-assumption', 'road', 'w#1', 'b'],
];

test('finish-it run: a record names the repo root it was made in, in posix form', () => {
  const { a, inA } = pair();
  ok(inA('run', 'new', 'road'));
  const record = ok(inA('run', 'show', 'road'));
  const root = posixRoot(a);
  assert.ok(mentions(record.root, root) && mentions(root, record.root), `${record.root} is ${root}`);
  assert.ok(!record.root.includes('\\'), record.root);
});

test('finish-it run: every run command from another checkout refuses, naming both roots', () => {
  const { a, b, inA, inB } = pair();
  ok(inA('run', 'new', 'road'));
  for (const args of COMMANDS) {
    const r = inB('run', ...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.ok(mentions(r.out.error, posixRoot(a)), `${args.join(' ')}: ${r.out.error}`);
    assert.ok(mentions(r.out.error, posixRoot(b)), `${args.join(' ')}: ${r.out.error}`);
  }
  assert.deepEqual(ok(inA('run', 'show', 'road')).slices, [], 'the refusals changed nothing');
});

test('finish-it run: a record made before root keeps working from another checkout', () => {
  const { planningDir, inA, inB } = pair();
  ok(inA('run', 'new', 'road'));
  const file = path.join(planningDir, 'road.run', 'RUN.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^root: .*\r?\n/m, ''));
  const record = ok(inB('run', 'show', 'road'));
  assert.ok(record.root === undefined || record.root === null, JSON.stringify(record.root));
});
