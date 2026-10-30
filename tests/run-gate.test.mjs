import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STOPS } from '../skills/do-it/scripts/stops.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { status: r.status, out: JSON.parse(r.stdout) };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};

// A repo with a started lane S item "feat" and a run record "road" whose slice R1 is that item.
function fixture(runFlags = []) {
  const dir = tmpDir('do-it-gate-');
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'a.js'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  ok(work(dir, 'new', 'feat', '--lane', 's', '--title', 'Feat'));
  ok(work(dir, 'event', 'feat', 'approve'));
  ok(work(dir, 'event', 'feat', 'start'));
  ok(work(dir, 'run', 'new', 'road', ...runFlags));
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'two\n');
  return dir;
}
const verify = (dir, cmd = 'true') => work(dir, 'run', 'verify', 'road', 'R1', '--', cmd);
const gate = (dir, id = 'R1') => ok(work(dir, 'run', 'gate', 'road', id));

test('gate: unverified, then allowed after a passing verify, then stale once code changes', () => {
  const dir = fixture();
  assert.deepEqual([gate(dir).allow, gate(dir).reason], [false, 'UNVERIFIED']);
  ok(verify(dir));
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null });
  fs.writeFileSync(path.join(dir, 'a.js'), 'three\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY');
  ok(verify(dir));
  assert.equal(gate(dir).allow, true, 'a new pass refreshes the gate');
});

test('flaky: a failure that passes on its one rerun parks the slice and records no pass', () => {
  const dir = fixture();
  // Fails the first run, passes the second: exactly one rerun.
  const marker = path.join(dir, '.attempt');
  const cmd = `test -f ${marker} || { touch ${marker}; exit 1; }`;
  const r = verify(dir, cmd);
  assert.equal(r.status, 1);
  assert.match(r.out.error, /FLAKY/);
  const run = ok(work(dir, 'run', 'show', 'road'));
  const s = run.slices.find((x) => x.id === 'R1');
  assert.deepEqual([s.status, s.needs], ['parked', 'user']);
  assert.match(s.reason, /^FLAKY/);
  assert.equal(gate(dir).reason, 'UNVERIFIED', 'no pass was recorded');
});

test('flaky: a check that fails twice is a plain failure, rerun only once, slice not parked', () => {
  const dir = fixture();
  const count = path.join(dir, '.count');
  const r = verify(dir, `echo x >> ${count}; exit 1`);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.out.error, /FLAKY/);
  assert.equal(fs.readFileSync(count, 'utf8').trim().split('\n').length, 2);
  assert.equal(ok(work(dir, 'run', 'show', 'road')).slices.length, 0);
});

test('slice cap: a slice past slice_cap_min stops with SLICE_CAP; the default is 120', () => {
  const dir = fixture(['--slice-cap-min', '30']);
  ok(verify(dir));
  assert.equal(gate(dir).allow, true);
  const old = new Date(Date.now() - 31 * 60000).toISOString();
  const d2 = fixture(['--slice-cap-min', '30']);
  fs.rmSync(path.join(d2, 'docs/planning/road.run'), { recursive: true });
  ok(work(d2, 'run', 'new', 'road', '--slice-cap-min', '30'));
  ok(work(d2, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', old));
  ok(verify(d2));
  const g = gate(d2);
  assert.deepEqual([g.allow, g.reason], [false, 'SLICE_CAP']);
  assert.equal(ok(work(dir, 'run', 'show', 'road')).slice_cap_min, 30);
  assert.equal(ok(work(tmpRepo(), 'run', 'new', 'x')).slice_cap_min, 120);
});

function tmpRepo() {
  const d = tmpDir('do-it-gate-d-');
  git(d, 'init', '-q');
  return d;
}

test('max-slices: stops once that many slices shipped; unset means no cap', () => {
  const dir = fixture(['--max-slices', '1']);
  ok(verify(dir));
  assert.equal(gate(dir).allow, true);
  ok(work(dir, 'run', 'slice', 'road', 'R0', 'shipped'));
  const g = gate(dir);
  assert.deepEqual([g.allow, g.reason], [false, 'MAX_SLICES']);
  const free = fixture();
  ok(verify(free));
  for (const id of ['R7', 'R8', 'R9']) ok(work(free, 'run', 'slice', 'road', id, 'shipped'));
  assert.equal(gate(free).allow, true);
});

test('audit cap: rounds across the run stop at audit_cap; the default is 5', () => {
  const dir = fixture(['--audit-cap', '2']);
  ok(verify(dir));
  ok(work(dir, 'run', 'audit', 'road'));
  assert.equal(gate(dir).allow, true);
  assert.equal(ok(work(dir, 'run', 'audit', 'road')).audit_rounds, 2);
  const g = gate(dir);
  assert.deepEqual([g.allow, g.reason], [false, 'AUDIT_CAP']);
  assert.equal(ok(work(tmpRepo(), 'run', 'new', 'x')).audit_cap, 5);
});

test('STOPS.md names exactly the shared reason codes, and judgment codes are named as judgment', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'skills/finish-it/STOPS.md'), 'utf8');
  const named = [...doc.matchAll(/^- `([A-Z_0-9]+)` \((park|stop)\)/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(named.map((n) => n[0]).sort(), Object.keys(STOPS).sort());
  for (const [code, action] of named) assert.equal(STOPS[code].action, action, code);
  const judgment = doc.slice(doc.indexOf('## Judgment'));
  for (const [code, s] of Object.entries(STOPS)) assert.equal(judgment.includes(`\`${code}\``), s.how === 'judgment', code);
  assert.match(fs.readFileSync(path.join(ROOT, 'skills/finish-it/SKILL.md'), 'utf8'), /STOPS\.md/);
});
