import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STOPS } from '../skills/do-it/scripts/stops.mjs';
import { gate as gateRule, runGate, runVerify } from '../skills/do-it/scripts/gate.mjs';
import { nextSlice, showRun } from '../skills/do-it/scripts/run.mjs';

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

test('audit cap: the round after the cap is refused and uncounted; a slice whose last allowed round passed ships', () => {
  const dir = fixture(['--audit-cap', '2']);
  ok(verify(dir));
  assert.equal(ok(work(dir, 'run', 'audit', 'road')).audit_rounds, 1);
  assert.equal(ok(work(dir, 'run', 'audit', 'road')).allow, true);
  assert.equal(gate(dir).allow, true, 'the 2nd of 2 rounds passed: the slice ships');
  const over = ok(work(dir, 'run', 'audit', 'road'));
  assert.deepEqual([over.allow, over.reason, over.audit_rounds], [false, 'AUDIT_CAP', 2]);
  // A caller that ignores the refusal is still stopped at the gate; a raised cap clears it.
  assert.equal(gate(dir).reason, 'AUDIT_CAP');
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '3'));
  assert.equal(gate(dir).allow, true);
  // The raised cap's last allowed round passes: the refusal from before does not stop that slice.
  assert.equal(ok(work(dir, 'run', 'audit', 'road')).allow, true);
  assert.equal(gate(dir).allow, true, 'the 3rd of 3 rounds passed: the slice ships');
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '1'));
  assert.equal(gate(dir).reason, 'AUDIT_CAP', 'a cap lowered below the rounds spent stops the gate');
  assert.equal(ok(work(tmpRepo(), 'run', 'new', 'x')).audit_cap, 5);
});

test('audit cap: a record already past the cap still stops the gate', () => {
  const dir = fixture(['--audit-cap', '2']);
  ok(verify(dir));
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '1'));
  ok(work(dir, 'run', 'audit', 'road'));
  const rec = ok(work(dir, 'run', 'show', 'road'));
  assert.equal(rec.audit_cap, 1);
  assert.equal(gate(dir).allow, true, 'one round at a cap of one is not over it');
  const rec2 = JSON.parse(JSON.stringify(rec));
  rec2.audit_rounds = 2;
  assert.equal(gateRule(rec2, 'R1', { current: 'fp' }).reason, 'AUDIT_CAP');
});

test('run next: stops handing out slices once max_slices shipped, and says why', () => {
  const road = { slices: [{ id: 'R1', blocked_by: [], state: 'shipped' }, { id: 'R2', blocked_by: [], state: 'ready' }], ready: ['R2'] };
  const rec = (shipped, max) => ({ max_slices: max, slices: shipped.map((id) => ({ id, status: 'shipped' })) });
  assert.equal(nextSlice(road, rec(['R1'], 2)).next, 'R2');
  assert.equal(nextSlice(road, rec(['R1'], null)).next, 'R2', 'no cap, no stop');
  const stopped = nextSlice(road, rec(['R1'], 1));
  assert.equal(stopped.next, null);
  assert.equal(stopped.stop.reason, 'MAX_SLICES');
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

// The two orchestrators called in-process, with the work item stubbed: what they decide
// and record is checked without going through work.mjs.
const unit = (dir) => ({ planningDir: path.join(dir, 'docs/planning'), slug: 'road', id: 'R1' });
const stub = (calls = []) => ({
  get: (id) => ({ id }),
  verifyPhase: (id, phase, check) => {
    calls.push([id, phase]);
    const r = check();
    if (!r.ok) throw new Error(`verify-phase: ${r.why}`);
  },
});

test('runGate: no verify, a matching fingerprint and a moved one give UNVERIFIED, allow and STALE_VERIFY', () => {
  const dir = fixture();
  const base = { ...unit(dir), items: stub() };
  assert.equal(runGate({ ...base, fingerprintOf: () => 'fp' }).reason, 'UNVERIFIED');
  runVerify({ ...base, root: dir, cwd: dir, opts: { '--': ['true'] }, fingerprintOf: () => 'fp', quote: String });
  assert.equal(runGate({ ...base, fingerprintOf: () => 'fp' }).allow, true);
  assert.equal(runGate({ ...base, fingerprintOf: () => 'moved' }).reason, 'STALE_VERIFY');
  assert.equal(runGate({ ...base, id: 'R9', fingerprintOf: () => 'fp' }).reason, 'UNVERIFIED', 'an unknown slice has no verify');
});

test('runVerify: a pass records the fingerprint and file hashes, a failure records neither', () => {
  const dir = fixture();
  const calls = [];
  const base = { ...unit(dir), items: stub(calls), root: dir, cwd: dir, fingerprintOf: () => 'fp', quote: String };
  assert.throws(() => runVerify({ ...base, opts: { '--': ['false'] } }), /exited 1/);
  assert.equal(showRun(base.planningDir, 'road').gates[0].verified_fingerprint, undefined);
  const rec = runVerify({ ...base, opts: { '--': ['true'], phase: '2' } });
  assert.deepEqual(calls.at(-1), ['feat', 2]);
  assert.equal(rec.gates[0].verified_fingerprint, 'fp');
  assert.ok(rec.gates[0].verified_files['a.js'], 'the dirty file is hashed');
  assert.throws(() => runVerify({ ...base, id: 'R9', opts: { '--': ['true'] } }), /run start first/);
  assert.throws(() => runVerify({ ...base, opts: {} }), /needs the checks/);
});

test('the run usage error lists every subcommand the loop calls', () => {
  const dir = fixture();
  const r = spawnSync('node', [WORK, 'run', 'bogus', 'road'], { cwd: dir, encoding: 'utf8' });
  for (const sub of ['start', 'audit', 'gate', 'verify', 'reject-assumption']) assert.match(r.stdout + r.stderr, new RegExp(`\\b${sub}\\b`));
});

// The finish-it loop is text an agent follows, so a stop is only as live as its call
// site there. Each shared stop code names the `work.mjs run` call that surfaces it.
const CALL_SITE = {
  STALE_VERIFY: 'gate',
  UNVERIFIED: 'gate',
  SLICE_CAP: 'gate',
  FLAKY: 'verify',
  MAX_SLICES: 'next',
  AUDIT_CAP: 'audit',
};
const section = (doc, title) => doc.slice(doc.indexOf(`## ${title}`)).split(/\n## /)[0];

test('every stop code has a call site in the finish-it loop, in the order the stops need', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'skills/finish-it/SKILL.md'), 'utf8');
  const loop = section(doc, '2. Loop');
  for (const [code, s] of Object.entries(STOPS)) {
    if (s.how === 'gate') {
      assert.ok(CALL_SITE[code], `${code} has no entry in CALL_SITE`);
      assert.match(loop, new RegExp(`work\\.mjs run ${CALL_SITE[code]} <slug>`), `${code}: the loop never calls run ${CALL_SITE[code]}`);
    }
  }
  // The clock starts once the work item exists and before build; verify records, audit counts
  // before each round, the gate runs before ship-it, and only then is the slice marked shipped.
  const at = (re) => {
    const m = re.exec(loop);
    assert.ok(m, `${re} is missing from the loop`);
    return m.index;
  };
  const order = [
    /work\.mjs run start <slug> <slice> --work/,
    /work\.mjs run verify <slug> <slice>/,
    /work\.mjs run audit <slug>/,
    /work\.mjs run gate <slug> <slice>/,
    /work\.mjs run slice <slug> <slice> shipped/,
  ].map(at);
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'start, verify, audit, gate, shipped in that order');
  assert.match(loop, /stop code first in `--reason`/, 'a park puts the stop code first');
  // A `run next` stop is reported where the run closes.
  assert.match(section(doc, '4. Close'), /`stop`/);
});

test('the finish-it resume text names the slice id that `run slice ... ready` needs', () => {
  const resume = section(fs.readFileSync(path.join(ROOT, 'skills/finish-it/SKILL.md'), 'utf8'), '3. Resume');
  assert.match(resume, /work\.mjs run slice <slug> <slice> ready/);
  assert.doesNotMatch(resume, /no id/);
});
