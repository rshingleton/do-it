import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STOPS } from '../skills/do-it/scripts/stops.mjs';
import { gate as gateRule } from '../skills/do-it/scripts/gate.mjs';
import { runGate, runRejectAssumption, runVerify } from '../skills/do-it/scripts/runs.mjs';
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

test('gate: closing docs (the roadmap file, the to-do list, ADRs) do not make a verified slice stale; code still does', () => {
  const dir = fixture();
  ok(work(dir, 'set', 'feat', 'roadmap', JSON.stringify('docs/roadmap/r.md#R1')));
  ok(verify(dir));
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/adr'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/roadmap/r.md'), '| R1 | shipped |\n');
  fs.writeFileSync(path.join(dir, 'docs/TODO.md'), '- [ ] T1 x\n');
  fs.writeFileSync(path.join(dir, 'docs/adr/0001-x.md'), '# x\n');
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null });
  fs.writeFileSync(path.join(dir, 'a.js'), 'four\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY', 'a code edit after verify still reads stale');
});

test('run verify on an item past building says it must be building and that a replan reopens it, and runs no check', () => {
  const dir = fixture();
  ok(verify(dir));
  ok(work(dir, 'event', 'feat', 'build-done'));
  const marker = path.join(dir, 'check-ran');
  const r = work(dir, 'run', 'verify', 'road', 'R1', '--', `touch ${marker}`);
  assert.equal(r.status, 1);
  assert.match(r.out.error, /needs feat building, but it is auditing/);
  assert.match(r.out.error, /a replan reopens it/);
  ok(work(dir, 'event', 'feat', 'block', 'waiting'));
  assert.match(work(dir, 'run', 'verify', 'road', 'R1', '--', 'true').out.error, /but it is blocked: unblock it/);
  assert.equal(fs.existsSync(marker), false, 'the check never ran');
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

const audit = (dir, ...a) => ok(work(dir, 'run', 'audit', 'road', ...a));

test('audit cap: the round after a slice\'s cap is refused and uncounted, naming the slice; its last allowed round ships', () => {
  const dir = fixture(['--audit-cap', '2']);
  ok(verify(dir));
  assert.equal(audit(dir, 'R1').audit_rounds, 1);
  assert.equal(audit(dir, 'R1').allow, true);
  assert.equal(gate(dir).allow, true, 'the 2nd of 2 rounds passed: the slice ships');
  const over = audit(dir, 'R1');
  assert.deepEqual([over.allow, over.reason, over.audit_rounds, over.limit], [false, 'AUDIT_CAP', 2, 'slice R1']);
  assert.match(over.detail, /slice R1: 2 audit rounds, cap 2/);
  // A caller that ignores the refusal is still stopped at the gate; a raised cap clears it.
  assert.match(gate(dir).detail, /slice R1/);
  assert.equal(gate(dir).reason, 'AUDIT_CAP');
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '3'));
  assert.equal(gate(dir).allow, true);
  assert.equal(audit(dir, 'R1').allow, true);
  assert.equal(gate(dir).allow, true, 'the 3rd of 3 rounds passed: the slice ships');
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '1'));
  assert.equal(gate(dir).reason, 'AUDIT_CAP', 'a cap lowered below the rounds spent stops the gate');
  const fresh = ok(work(tmpRepo(), 'run', 'new', 'x'));
  assert.deepEqual([fresh.audit_cap, fresh.final_audit_cap, fresh.audit_total_cap], [3, 3, null]);
});

test('audit cap: a round needs a slice or --final', () => {
  const dir = fixture();
  assert.equal(work(dir, 'run', 'audit', 'road').status, 1);
});

test('audit cap: lowering a cap back to the value it refused at does not revive the refusal', () => {
  const dir = fixture(['--audit-cap', '2']);
  ok(verify(dir));
  audit(dir, 'R1');
  audit(dir, 'R1');
  assert.equal(audit(dir, 'R1').allow, false);
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '3'));
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '2'));
  assert.equal(gate(dir).allow, true, 'two rounds at a cap of two ship; the old refusal is gone');
  assert.equal(ok(work(dir, 'run', 'show', 'road')).audit_stop, undefined);
});

test('audit cap: the run-total refusal clears when audit_total_cap is set again, so gate allows', () => {
  const dir = fixture(['--audit-cap', '2', '--max-slices', '2']);
  ok(verify(dir));
  for (const id of ['R1', 'R1', 'R2', 'R2']) assert.equal(audit(dir, id).allow, true);
  assert.equal(audit(dir, 'R3').allow, false);
  assert.equal(gate(dir).reason, 'AUDIT_CAP', 'the refusal stops the gate while the cap is unchanged');
  ok(work(dir, 'run', 'set', 'road', 'audit_total_cap', '5'));
  ok(work(dir, 'run', 'set', 'road', 'audit_total_cap', '4'));
  assert.equal(gate(dir).allow, true, 'four rounds at a cap of four ship: the record-level marker is gone');
});

test('audit cap: the final review refusal marker clears when final_audit_cap is set again', () => {
  const dir = fixture(['--final-audit-cap', '1']);
  assert.equal(audit(dir, '--final').allow, true);
  assert.equal(audit(dir, '--final').allow, false);
  assert.equal(ok(work(dir, 'run', 'show', 'road')).final_audit_refused, 1);
  ok(work(dir, 'run', 'set', 'road', 'final_audit_cap', '2'));
  ok(work(dir, 'run', 'set', 'road', 'final_audit_cap', '1'));
  assert.equal(ok(work(dir, 'run', 'show', 'road')).final_audit_refused, undefined);
});

test('audit cap: resuming the slice a stop names clears audit_stop; another slice\'s stop stays', () => {
  const dir = fixture(['--audit-cap', '1']);
  audit(dir, 'R1');
  assert.equal(audit(dir, 'R1').allow, false);
  assert.match(ok(work(dir, 'run', 'show', 'road')).audit_stop, /^slice R1:/);
  ok(work(dir, 'run', 'slice', 'road', 'R2', 'ready'));
  assert.match(ok(work(dir, 'run', 'show', 'road')).audit_stop, /^slice R1:/, 'resuming R2 leaves R1\'s stop');
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'ready'));
  assert.equal(ok(work(dir, 'run', 'show', 'road')).audit_stop, undefined);
});

test('audit cap: a record written before final_audit_cap existed still gates and counts the final review', () => {
  const dir = fixture();
  const file = path.join(dir, 'docs/planning/road.run/RUN.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^final_audit_cap:.*\n/m, ''));
  assert.equal(ok(work(dir, 'run', 'show', 'road')).final_audit_cap, undefined);
  ok(verify(dir));
  assert.equal(gate(dir).allow, true);
  assert.equal(audit(dir, '--final').allow, true, 'the final review falls back to audit_cap');
});

test('gate reads the record: it adds no gates entry for a slice that has none', () => {
  const rec = { slices: [], gates: [], audit_cap: 3, slice_cap_min: 120 };
  gateRule(rec, 'R9', { current: 'fp' });
  assert.deepEqual(rec.gates, []);
});

test('audit cap: a long run of slices at two rounds each finishes under default caps', () => {
  const dir = fixture();
  for (let i = 1; i <= 8; i++) {
    const id = `R${i}`;
    assert.equal(audit(dir, id).allow, true);
    assert.equal(audit(dir, id).allow, true, `${id} second round`);
    ok(work(dir, 'run', 'slice', 'road', id, 'shipped'));
  }
  assert.equal(ok(work(dir, 'run', 'show', 'road')).audit_rounds, 16, 'the run total counts across slices');
});

test('audit cap: a slice at its 4th round stops naming the slice, and the digest says which limit fired', () => {
  const dir = fixture();
  for (let i = 0; i < 3; i++) assert.equal(audit(dir, 'R1').allow, true);
  const r = audit(dir, 'R1');
  assert.deepEqual([r.allow, r.limit], [false, 'slice R1']);
  assert.equal(audit(dir, 'R2').allow, true, 'another slice has its own rounds');
  assert.equal(spawnSync('node', [WORK, 'run', 'digest', 'road'], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } }).status, 0);
  const digest = fs.readFileSync(path.join(dir, 'docs/planning/road.run/DIGEST.md'), 'utf8');
  assert.match(digest, /## Limit fired[\s\S]*AUDIT_CAP, slice R1: 3 audit rounds, cap 3/);
});

test('audit cap: the final review has its own cap and does not spend a slice\'s rounds', () => {
  const dir = fixture(['--final-audit-cap', '2']);
  assert.equal(audit(dir, '--final').allow, true);
  assert.equal(audit(dir, '--final').allow, true);
  const r = audit(dir, '--final');
  assert.deepEqual([r.allow, r.limit, r.audit_rounds], [false, 'final review', 2]);
  assert.equal(audit(dir, 'R1').allow, true);
  assert.equal(ok(work(dir, 'run', 'show', 'road')).audit_rounds, 1, 'final rounds stay out of the slice total');
});

test('audit cap: the run total stops a runaway; max_slices x the per-slice cap is its default', () => {
  const dir = fixture(['--audit-cap', '2', '--max-slices', '2']);
  for (const id of ['R1', 'R1', 'R2', 'R2']) assert.equal(audit(dir, id).allow, true);
  const r = audit(dir, 'R3');
  assert.deepEqual([r.allow, r.limit], [false, 'run total']);
  assert.match(r.detail, /run total: 4 audit rounds, cap 4/);
  ok(work(dir, 'run', 'set', 'road', 'audit_total_cap', '5'));
  assert.equal(audit(dir, 'R3').allow, true, 'the overridden total allows one more');
  assert.equal(audit(dir, 'R4').allow, false);
  const none = fixture();
  for (let i = 1; i <= 12; i++) assert.equal(audit(none, `R${i}`).allow, true, 'no max_slices and no total: no backstop');
});

test('audit cap: resuming a parked slice starts its rounds again', () => {
  const dir = fixture(['--audit-cap', '1']);
  audit(dir, 'R1');
  assert.equal(audit(dir, 'R1').allow, false);
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'parked', '--reason', 'x', '--needs', 'user'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'ready'));
  assert.equal(audit(dir, 'R1').allow, true);
});

test('audit cap: a record already past the cap still stops the gate', () => {
  const dir = fixture(['--audit-cap', '2']);
  ok(verify(dir));
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '1'));
  audit(dir, 'R1');
  const rec = ok(work(dir, 'run', 'show', 'road'));
  assert.equal(rec.audit_cap, 1);
  assert.equal(gate(dir).allow, true, 'one round at a cap of one is not over it');
  const rec2 = JSON.parse(JSON.stringify(rec));
  rec2.gates.find((g) => g.id === 'R1').audit_rounds = 2;
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

test('run next: a run at its cap with nothing left to build finishes, and an in-flight slice is named', () => {
  const slice = (id, state) => ({ id, blocked_by: [], state });
  const rec = (max) => ({ max_slices: max, slices: [{ id: 'R1', status: 'shipped' }] });
  const done = nextSlice({ slices: [slice('R1', 'shipped')], ready: [] }, rec(1));
  assert.deepEqual([done.next, done.stop], [null, undefined], 'nothing left, so no stop');
  const flying = nextSlice({ slices: [slice('R1', 'shipped'), slice('R2', 'in flight')], ready: [] }, rec(1));
  assert.equal(flying.next, null);
  assert.equal(flying.stop.reason, 'MAX_SLICES');
  assert.match(flying.stop.detail, /R2 is in flight/);
  assert.equal(nextSlice({ slices: [slice('R1', 'shipped'), slice('R2', 'in flight')], ready: [] }, rec(2)).next, 'R2', 'under the cap the in-flight slice resumes');
});

test('run next: a slice blocked by an open (ask-when-reached) decision is listed under defects, not silently skipped', () => {
  const road = {
    slices: [
      { id: 'R1', blocked_by: [], state: 'ready' },
      { id: 'R2', blocked_by: ['D1'], state: 'blocked' },
      { id: 'R3', blocked_by: ['R2'], state: 'blocked' },
    ],
    ready: ['R1'],
    blocking: [{ id: 'D1', blocks: ['R2', 'R3'] }],
  };
  const out = nextSlice(road, { max_slices: null, slices: [] });
  assert.equal(out.next, 'R1');
  assert.deepEqual(out.defects, [{ decision: 'D1', blocks: ['R2', 'R3'], note: 'ask-when-reached: settle the decision, then the slices can run' }]);
  assert.deepEqual(nextSlice({ ...road, blocking: [] }, { max_slices: null, slices: [] }).defects, [], 'no open decision, no defects');
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
  const rec = runVerify({ ...base, opts: { '--': ['true'], phase: '2', paths: 'a.js' } });
  assert.deepEqual(calls.at(-1), ['feat', 2]);
  assert.equal(rec.gates[0].verified_fingerprint, 'fp');
  assert.ok(rec.gates[0].verified_files['a.js'], 'the named dirty file is hashed');
  const bare = runVerify({ ...base, opts: { '--': ['true'] } });
  assert.equal(bare.gates[0].verified_files, undefined, 'without --paths no files are recorded, and the older record is dropped');
  assert.throws(() => runVerify({ ...base, id: 'R9', opts: { '--': ['true'] } }), /run start first/);
  assert.throws(() => runVerify({ ...base, opts: {} }), /needs the checks/);
});

test('runVerify: --in resolves against the caller\'s directory, and a check that passes only on its rerun parks the slice', () => {
  const dir = fixture();
  const sub = path.join(dir, 'sub');
  fs.mkdirSync(path.join(sub, 'inner'), { recursive: true });
  fs.writeFileSync(path.join(sub, 'inner', 'here.txt'), 'x\n');
  const base = { ...unit(dir), items: stub(), root: dir, cwd: sub, fingerprintOf: () => 'fp', quote: String };
  // here.txt exists only under cwd/inner: resolving --in against the repo root would not find it.
  assert.equal(runVerify({ ...base, opts: { '--': ['test -f here.txt'], in: 'inner' } }).gates[0].verified_fingerprint, 'fp');
  assert.throws(() => runVerify({ ...base, opts: { '--': ['test -f here.txt'] } }), /exited 1/, 'without --in the check runs at the root');
  const flaky = path.join(dir, 'ran-once');
  assert.throws(() => runVerify({ ...base, opts: { '--': [`test -f ${flaky} || { touch ${flaky}; exit 1; }`] } }), /FLAKY/);
  const parked = showRun(base.planningDir, 'road').slices.find((s) => s.id === 'R1');
  assert.deepEqual([parked.status, parked.needs, /^FLAKY/.test(parked.reason)], ['parked', 'user', true]);
});

test('STATE.md names every run subcommand work.mjs lists in its usage error, and none that is only a record field', () => {
  const r = spawnSync('node', [WORK, 'run', 'nope', 'x'], { cwd: ROOT, encoding: 'utf8' });
  const subs = /work\.mjs run ([a-z|-]+) <slug>/.exec(JSON.parse(r.stdout).error)[1].split('|');
  const row = fs.readFileSync(path.join(ROOT, 'skills/do-it/STATE.md'), 'utf8').split('\n').find((l) => l.startsWith('| `work.mjs run <sub>'));
  // A sub counts where the row lists it (after the intro or a comma), not where another name merely contains it.
  for (const sub of subs) assert.match(row, new RegExp('(?:^|[,.] )`' + sub + '[` <\\\\]'), `${sub} is listed in the STATE.md run row`);
  assert.ok(!row.includes('`retries` (the record keeps'), 'retries is a record field, described under slice ... ready');
  assert.match(row, /`limit` and `detail` are null on allow/);
});

test('every reason the gate and run next return is a code in STOPS, shared with the loop text', () => {
  const rec = { max_slices: 1, slice_cap_min: 1, audit_cap: 1, slices: [{ id: 'S', status: 'shipped' }], gates: [{ id: 'R1', started: '2026-01-01T00:00:00Z', audit_rounds: 2 }] };
  const seen = new Set();
  const stop = (r) => seen.add(r.reason);
  stop(gateRule(rec, 'R1', { current: 'fp', now: Date.parse('2026-01-01T00:00:30Z') }));
  stop(gateRule({ ...rec, max_slices: null }, 'R1', { current: 'fp', now: Date.parse('2026-01-01T00:00:30Z') }));
  stop(gateRule({ ...rec, max_slices: null, audit_cap: 9 }, 'R1', { current: 'fp', now: Date.parse('2026-01-01T00:05:00Z') }));
  const soon = { current: 'fp', now: Date.parse('2026-01-01T00:00:30Z') };
  stop(gateRule({ ...rec, max_slices: null, audit_cap: 9, slice_cap_min: 99 }, 'R1', soon));
  stop(gateRule({ ...rec, max_slices: null, audit_cap: 9, slice_cap_min: 99, gates: [{ id: 'R1', verified_fingerprint: 'old' }] }, 'R1', soon));
  assert.deepEqual([...seen].sort(), ['AUDIT_CAP', 'MAX_SLICES', 'SLICE_CAP', 'STALE_VERIFY', 'UNVERIFIED']);
  for (const code of seen) assert.equal(STOPS[code]?.how, 'gate', `${code} is a gate stop in STOPS`);
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
  // A stop is live only where its call is: the item that makes the call names the stop path on
  // its own lines, so a mention elsewhere in the loop cannot stand in for it.
  // Each loop item is a `N. ` line or a `- (a)` to `- (g)` bullet under item 3; a new bullet format needs this updated.
  const item = (call) => loop.split(/\n(?=\s*(?:- \([a-z]\)|\d+\.) )/).find((x) => x.includes(`work.mjs run ${call} <slug>`));
  assert.match(item('gate'), /`allow` false: ship\s+nothing/, 'the gate call carries its allow-false line');
  assert.match(item('audit'), /`allow`\s+false: never start the round/, 'the audit call carries its allow-false line');
  assert.match(loop, /`next` is null: go to §4/, 'a null next is where the loop ends');
  assert.ok(item('next'), 'the loop calls run next');
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

// The loop closes the turn only at §4. A closing message or `Next:` before it ends a run
// that `run next` would have gone on with.
// Only the numbered items are scanned (the lead paragraph says where the turn ends, in the very words
// this looks for); "none closes the turn" is item 3 saying a step does not close it.
const closesEarly = (loop) => {
  const start = loop.search(/^1\. /m);
  assert.ok(start >= 0, 'the loop has numbered items to scan');
  const items = loop.slice(start).replace(/none closes the turn/g, '');
  return /\bNext:|close[sd]? the turn|ends? (the|your) turn|stop here|hand(s|ed)? (it |control )?back to the user/i.test(items);
};

test('the finish-it loop ends its turn only at §4, and says a parked or resumed slice is not a stop', () => {
  const loop = section(fs.readFileSync(path.join(ROOT, 'skills/finish-it/SKILL.md'), 'utf8'), '2. Loop');
  assert.match(loop, /The turn ends only at §4, when `run next` returns no `next`/);
  assert.match(loop, /parked or\s+resumed slice/);
  assert.equal(closesEarly(loop), false);
  assert.equal(closesEarly(`${loop}\n7. A slice parked: close the turn with a Next: line.`), true, 'a fixture that closes before §4 fails');
  for (const phrase of ['ends the turn', 'end your turn', 'closes the turn', 'hand back to the user', 'hands it back to the user']) {
    assert.equal(closesEarly(`${loop}\n7. A slice parked: this ${phrase} here.`), true, phrase);
  }
});

test('the finish-it resume text names the slice id that `run slice ... ready` needs', () => {
  const resume = section(fs.readFileSync(path.join(ROOT, 'skills/finish-it/SKILL.md'), 'utf8'), '3. Resume');
  assert.match(resume, /work\.mjs run slice <slug> <slice> ready/);
  assert.doesNotMatch(resume, /no id/);
});

// A run record "road" whose item "feat" has two assumptions with the same text, and a stub
// work item that records the plan events fired at it.
function rejectFixture(planStatus = 'shipping') {
  const dir = fixture();
  ok(work(dir, 'run', 'add-assumptions', 'road', 'feat', '["same","same"]'));
  const fired = [];
  const plan = { state: { status: planStatus, assumptions: ['same', 'same'] } };
  const items = {
    get: () => plan,
    fire: (id, event, args) => {
      fired.push([id, event, args.n, args.text]);
      if (items.fail) throw new Error('plan event refused');
    },
  };
  return { ...unit(dir), items, fired, plan };
}

test('reject-assumption: two assumptions with equal text lose one in the plan, and the record key says which', () => {
  const t = rejectFixture();
  const out = runRejectAssumption({ ...t, key: 'feat#2', instead: 'different' });
  assert.deepEqual(t.fired, [['feat', 'reject-assumption', 2, 'different']], 'equal texts, the plan unchanged: the key\'s own place is removed');
  assert.equal(out.reopened, true);
  const rec = showRun(t.planningDir, 'road');
  assert.ok(rec.assumptions.includes('feat#1: same') && !rec.assumptions.includes('feat#2: same'), 'the other keeps its number');
  assert.deepEqual(rec.rejected, ['feat#2: same (instead: different)']);
});

// A run record "road" whose item "feat" has these assumptions, and a plan stub that lists them.
function planOf(texts, status = 'shipping') {
  const dir = fixture();
  ok(work(dir, 'run', 'add-assumptions', 'road', 'feat', JSON.stringify(texts)));
  const fired = [];
  const plan = { state: { status, assumptions: [...texts] } };
  const items = { get: () => plan, fire: (id, event, args) => fired.push([event, args.n, args.text]) };
  return { ...unit(dir), dir, items, fired, plan };
}

test('reject-assumption: the plan entry is found by text among those left, after an earlier rejection', () => {
  const t = planOf(['a', 'b']);
  runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  t.plan.state.assumptions = ['b']; // the plan event removed the first
  runRejectAssumption({ ...t, key: 'feat#2', instead: 'y' });
  assert.deepEqual(t.fired, [['reject-assumption', 1, 'x'], ['reject-assumption', 1, 'y']]);
});

test('reject-assumption: an assumption ship-it already rejected plan-side only updates the record, no refusal', () => {
  const t = planOf(['a', 'b']);
  t.plan.state.assumptions = ['b']; // ship-it removed `a` from the plan
  const out = runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  assert.deepEqual([out.reopened, t.fired], [false, []]);
  assert.ok(out.followup, 'the record-only change is named in followup');
  assert.deepEqual(showRun(t.planningDir, 'road').rejected, ['feat#1: a (instead: x)']);
});

test('reject-assumption: a re-add renumbers the record and the plan entry is still found', () => {
  const t = planOf(['a', 'b']);
  runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  ok(work(t.dir, 'run', 'add-assumptions', 'road', 'feat', '["p","q"]'));
  t.plan.state.assumptions = ['p', 'q'];
  runRejectAssumption({ ...t, key: 'feat#2', instead: 'y' });
  assert.deepEqual(t.fired.at(-1), ['reject-assumption', 2, 'y']);
});

test('reject-assumption: text that looks like a key does not confuse a later rejection', () => {
  const t = planOf(['see x#2: y', 'z']);
  runRejectAssumption({ ...t, key: 'feat#1', instead: 'a' });
  t.plan.state.assumptions = ['z'];
  runRejectAssumption({ ...t, key: 'feat#2', instead: 'b' });
  assert.deepEqual(t.fired.map((f) => f[1]), [1, 1]);
});

test('reject-assumption: a plan still building is named, not called closed, and a lookup failure is not swallowed', () => {
  const t = planOf(['a'], 'building');
  const out = runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  assert.deepEqual([out.reopened, t.fired], [false, []]);
  assert.ok(out.followup.includes('building') && !out.followup.includes('closed'), 'names the state, never calls it closed');
  const u = planOf(['a']);
  u.items.get = () => {
    throw new Error('EACCES: cannot read the plan');
  };
  assert.throws(() => runRejectAssumption({ ...u, key: 'feat#1', instead: 'x' }), /EACCES/);
});

test('reject-assumption: the replacement is collapsed to one line before it reaches the record', () => {
  const t = planOf(['a']);
  runRejectAssumption({ ...t, key: 'feat#1', instead: 'x\n## forged\t line  two' });
  assert.deepEqual(showRun(t.planningDir, 'road').rejected, ['feat#1: a (instead: x ## forged line two)']);
  assert.equal(t.fired[0][2], 'x ## forged line two');
});

test('reject-assumption: equal texts after a plan-side reject: rejecting feat#1 leaves feat#2 and the plan\'s one entry', () => {
  const t = rejectFixture();
  t.plan.state.assumptions = ['same']; // ship-it rejected one plan-side; the list closed up
  const first = runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  assert.deepEqual([first.reopened, t.fired], [false, []], 'the lists differ and the texts are equal: nothing is guessed, the record alone changes');
  assert.match(first.followup, /feat#1, feat#2/);
  const second = runRejectAssumption({ ...t, key: 'feat#2', instead: 'y' });
  assert.deepEqual(t.fired, [['feat', 'reject-assumption', 1, 'y']], 'feat#2 is the survivor: the plan event fires with the right text');
  assert.equal(second.reopened, true);
  assert.deepEqual(showRun(t.planningDir, 'road').rejected, ['feat#1: same (instead: x)', 'feat#2: same (instead: y)']);
});

test('reject-assumption: a re-add marks the earlier rejections so their keys cannot read as the new list\'s', () => {
  const t = planOf(['a', 'b']);
  runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  ok(work(t.dir, 'run', 'add-assumptions', 'road', 'feat', '["p","q"]'));
  const rec = showRun(t.planningDir, 'road');
  assert.deepEqual(rec.rejected, ['earlier feat#1: a (instead: x)']);
  assert.deepEqual(rec.assumptions.filter((a) => a.startsWith('feat#')), ['feat#1: p', 'feat#2: q']);
  ok(work(t.dir, 'run', 'add-assumptions', 'road', 'feat', '["r"]'));
  assert.deepEqual(showRun(t.planningDir, 'road').rejected, ['earlier feat#1: a (instead: x)'], 'a second re-add does not stack the mark');
});

test('reject-assumption: a done or closed plan says to file a new fix item', () => {
  for (const status of ['done', 'closed']) {
    const t = planOf(['a'], status);
    const out = runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
    assert.deepEqual([out.reopened, t.fired], [false, []]);
    assert.ok(out.followup.includes('new fix item') && !out.followup.includes('fix: list'), status);
  }
});

test('new refuses the id sweep, which the run sweep records its defaults under', () => {
  const dir = fixture();
  const r = work(dir, 'new', 'sweep', '--lane', 's', '--title', 'x');
  assert.equal(r.status, 1);
  assert.match(r.out.error, /reserved/);
});

test('run set refuses assumptions, which only add-assumptions writes', () => {
  const dir = fixture();
  const r = work(dir, 'run', 'set', 'road', 'assumptions', '["x"]');
  assert.equal(r.status, 1);
  assert.match(r.out.error, /add-assumptions/);
  assert.deepEqual(ok(work(dir, 'run', 'add-assumptions', 'road', 'sweep', '["default one"]')).assumptions.slice(-1), ['sweep#1: default one']);
});

test('reject-assumption: a refused plan event leaves the record exactly as it was', () => {
  const t = rejectFixture();
  t.items.fail = true;
  const before = JSON.stringify(showRun(t.planningDir, 'road'));
  assert.throws(() => runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' }), /plan event refused/);
  assert.equal(JSON.stringify(showRun(t.planningDir, 'road')), before);
});

test('reject-assumption: a plan edited by hand fires no event and names it, so the plan is never changed blind', () => {
  const t = rejectFixture();
  t.plan.state.assumptions = ['edited by hand', 'edited too'];
  const out = runRejectAssumption({ ...t, key: 'feat#2', instead: 'x' });
  assert.deepEqual([out.reopened, t.fired], [false, []]);
  assert.ok(out.followup, 'a hand-edited plan is named in followup');
});

test('reject-assumption: a closed item has no plan to reopen, so only the record changes', () => {
  const t = rejectFixture();
  t.items.get = () => {
    throw new Error('no plan for feat under docs/planning');
  };
  const out = runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  assert.equal(out.reopened, false);
  assert.deepEqual(t.fired, []);
  assert.equal(showRun(t.planningDir, 'road').rejected.length, 1);
  assert.throws(() => runRejectAssumption({ ...t, key: 'feat#9', instead: 'x' }), /no recorded assumption/);
});

test('gate.mjs holds the rule and counters only: the run handlers live in runs.mjs, and commitSlice stays short', () => {
  const scripts = path.join(ROOT, 'skills/do-it/scripts');
  assert.doesNotMatch(fs.readFileSync(path.join(scripts, 'gate.mjs'), 'utf8'), /^export (async )?function run[A-Z]/m);
  for (const handler of ['runGate', 'runVerify', 'runReviewChange', 'runRejectAssumption']) {
    assert.match(fs.readFileSync(path.join(scripts, 'runs.mjs'), 'utf8'), new RegExp(`^export function ${handler}\\(`, 'm'));
  }
  const commit = fs.readFileSync(path.join(scripts, 'commit.mjs'), 'utf8');
  const body = /^export function commitSlice[\s\S]*?^}/m.exec(commit)[0];
  assert.ok(body.split('\n').length < 60, 'commitSlice is under 60 lines');
});

test('the run scripts carry one id pattern, one git spawn and one record writer', () => {
  const dir = path.join(ROOT, 'skills/do-it/scripts');
  // Whole-line and trailing `//` comments are stripped first, so a note that quotes a pattern cannot satisfy
  // or fail the check. No block-comment strip: these scripts have none, and a string like 'a/*/b' would open one.
  const code = (text) => text.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
  const sources = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => [f, code(fs.readFileSync(path.join(dir, f), 'utf8'))]));
  const files = (re) => Object.keys(sources).filter((f) => re.test(sources[f]));
  assert.deepEqual(files(/\[A-Za-z0-9\]\[A-Za-z0-9_\.-\]/), ['ids.mjs'], 'the id pattern is written once');
  assert.deepEqual(files(/spawnSync\(['"]git['"]/), ['git.mjs'], 'git is spawned in one place');
  assert.deepEqual(files(/\bwrite\(file, /), ['run.mjs'], 'only run.mjs writes the record');
  assert.deepEqual(files(/\bgit as \w+/), [], 'the shared git helper is imported unaliased in every script');
  // Nothing outside run.mjs imports its internals, and run.mjs exports only what something imports.
  const exported = [...sources['run.mjs'].matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  const others = Object.entries(sources).filter(([f]) => f !== 'run.mjs').map(([, t]) => t).join('\n');
  const unused = exported.filter((name) => !new RegExp(`\\b${name}\\b`).test(others));
  assert.deepEqual(unused, [], 'run.mjs has no unused export');
});

test('the docs name the do-it commit line as the ATTRIBUTION constant, and finish-it maps the level argument to run new --level', () => {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  assert.doesNotMatch(read('skills/build-it/COMMITS.md') + read('skills/do-it/scripts/commit.mjs'), /user's (commit )?rules?/);
  assert.match(read('skills/build-it/COMMITS.md'), /ATTRIBUTION/);
  assert.match(read('skills/finish-it/SKILL.md'), /run new <slug> --level\s+lite\|full\|ultra/);
});
