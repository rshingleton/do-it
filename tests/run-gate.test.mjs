import { read, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STOPS } from '../skills/do-it/scripts/stops.mjs';
import { auditRoom, countAudit, gate as gateRule } from '../skills/do-it/scripts/gate.mjs';
import { runGate, runRejectAssumption, runVerify } from '../skills/do-it/scripts/runs.mjs';
import { nextSlice, resumeSlice, showRun, sliceRun, updateRun } from '../skills/do-it/scripts/run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A path as a bash check spells it: forward slashes.
const sh = (p) => p.replaceAll('\\', '/');
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
// `prefix` lets a test put a space in the checkout path, as a quoted shell check must survive.
function fixture(runFlags = [], prefix = 'do-it-gate-') {
  const dir = tmpDir(prefix);
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
// A slice begins before it audits: `run audit` refuses an id the record holds no gate entry for.
const start = (dir, id) => ok(work(dir, 'run', 'start', 'road', id, '--work', 'feat'));

// The plan's last audit round, ended on these Musts: what the next `run audit` is classified against.
// The plan's third failed round in a row blocks the item, so unblock it before the next one.
function auditFailed(dir, ...musts) {
  const status = () => ok(work(dir, 'show', 'feat')).status;
  if (status() === 'blocked') ok(work(dir, 'event', 'feat', 'unblock'));
  if (status() === 'building') {
    ok(work(dir, 'verify-phase', 'feat', '--', 'true'));
    ok(work(dir, 'event', 'feat', 'build-done'));
  }
  ok(work(dir, 'event', 'feat', 'audit-fail', ...musts));
}

test('gate: unverified, then allowed after a passing verify, then stale once code changes', () => {
  const dir = fixture();
  assert.deepEqual([gate(dir).allow, gate(dir).reason], [false, 'UNVERIFIED']);
  ok(verify(dir));
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null });
  fs.writeFileSync(path.join(dir, 'a.js'), 'three\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY');
  ok(verify(dir));
  assert.equal(gate(dir).allow, true, 'a new pass refreshes the gate');
  assert.equal(gate(dir, 'R9').reason, 'UNVERIFIED', 'an unknown slice has no verify');
});

test('gate: closing docs (the roadmap file, the to-do list, ADRs) and filed issues do not make a verified slice stale; code still does', () => {
  const dir = fixture();
  ok(work(dir, 'set', 'feat', 'roadmap', JSON.stringify('docs/roadmap/r.md#R1')));
  ok(verify(dir));
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/adr'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/issues'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/roadmap/r.md'), '| R1 | shipped |\n');
  fs.writeFileSync(path.join(dir, 'docs/TODO.md'), '- [ ] T1 x\n');
  fs.writeFileSync(path.join(dir, 'docs/adr/0001-x.md'), '# x\n');
  fs.writeFileSync(path.join(dir, 'docs/issues/filed-by-another-session.md'), '---\ntitle: x\n---\n');
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null });
  fs.writeFileSync(path.join(dir, 'a.js'), 'four\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY', 'a code edit after verify still reads stale');
});

// A second started slice of the same run, its plan naming the files it owns.
function second(dir, { id = 'R2', work: workId = 'two', files = ['b.js'] } = {}) {
  ok(work(dir, 'new', workId, '--lane', 's', '--title', workId));
  ok(work(dir, 'event', workId, 'approve'));
  ok(work(dir, 'event', workId, 'start'));
  ok(work(dir, 'run', 'start', 'road', id, '--work', workId));
  fs.appendFileSync(path.join(dir, 'docs/planning', `${workId}.md`), `\n## Files\n${files.join('\n')}\n`);
}

test('gate: another slice\'s plan files do not make a verified slice stale, its own still do', () => {
  const dir = fixture();
  second(dir);
  ok(verify(dir));
  fs.writeFileSync(path.join(dir, 'b.js'), 'bee\n');
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null }, 'R2\'s new file is not R1\'s change');
  fs.writeFileSync(path.join(dir, 'b.js'), 'buzz\n');
  assert.equal(gate(dir).allow, true, 'R2 editing its own file again is still not R1\'s change');
  fs.writeFileSync(path.join(dir, 'a.js'), 'three\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY', 'R1\'s own file moved');
  fs.writeFileSync(path.join(dir, 'c.js'), 'cee\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY', 'a changed file no slice declares still reads stale');
  ok(verify(dir));
  fs.appendFileSync(path.join(dir, 'docs/planning/feat.md'), '\n## Files\na.js\nb.js\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'bazz\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY', 'a file two plans name stays in the fingerprint');
});

test('run verify on an item past building says it must be building and that a replan reopens it, and runs no check', () => {
  const dir = fixture();
  ok(verify(dir));
  ok(work(dir, 'event', 'feat', 'build-done'));
  const marker = path.join(dir, 'check-ran');
  const r = work(dir, 'run', 'verify', 'road', 'R1', '--', `touch ${sh(marker)}`);
  assert.equal(r.status, 1);
  assert.match(r.out.error, /needs feat building, but it is auditing/);
  assert.match(r.out.error, /a replan reopens it/);
  ok(work(dir, 'event', 'feat', 'block', 'waiting'));
  assert.match(work(dir, 'run', 'verify', 'road', 'R1', '--', 'true').out.error, /but it is blocked: unblock it/);
  assert.equal(fs.existsSync(marker), false, 'the check never ran');
});

test('flaky: a failure that passes on its one rerun parks the slice and records no pass', () => {
  const dir = fixture([], 'do-it gate ');
  // Fails the first run, passes the second: exactly one rerun.
  const marker = path.join(dir, '.attempt');
  const cmd = `test -f "${sh(marker)}" || { touch "${sh(marker)}"; exit 1; }`;
  const r = verify(dir, cmd);
  assert.equal(r.status, 1);
  assert.match(r.out.error, /FLAKY/);
  const run = ok(work(dir, 'run', 'show', 'road'));
  const s = run.slices.find((x) => x.id === 'R1');
  assert.deepEqual([s.status, s.needs], ['parked', 'user']);
  assert.match(s.reason, /^FLAKY/);
  assert.equal(gate(dir).reason, 'UNVERIFIED', 'no pass was recorded');
  // A check that fails both times is a plain failure: one rerun, no park.
  const twice = fixture();
  const count = path.join(twice, '.count');
  const failed = verify(twice, `echo x >> ${sh(count)}; exit 1`);
  assert.equal(failed.status, 1);
  assert.doesNotMatch(failed.out.error, /FLAKY/);
  assert.equal(fs.readFileSync(count, 'utf8').trim().split('\n').length, 2, 'rerun only once');
  assert.equal(ok(work(twice, 'run', 'show', 'road')).slices.length, 0, 'not parked');
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

// A fresh record on the fixture's repo: a start keeps `started` and a day of wall clock is
// not work when no command ran in it.
function fresh(dir, flags = []) {
  fs.rmSync(path.join(dir, 'docs/planning/road.run'), { recursive: true });
  ok(work(dir, 'run', 'new', 'road', ...flags));
  return Date.now();
}
const iso = (ms) => new Date(ms).toISOString();
const DAY = 24 * 60 * 60000;

test('slice cap: the cap counts in-flight spans less the queue time, and a null cap never fires', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const at = (min) => new Date(start + min * 60000).toISOString();
  const now = start + 45 * 60000;
  const rec = (g, cap = 30) => ({ slices: [], audit_cap: 3, slice_cap_min: cap, gates: [{ id: 'R1', verified_fingerprint: 'fp', ...g }] });
  const allowed = { allow: true, reason: null, detail: null };
  // 20 closed minutes plus 25 open ones: 45 of work, past a 30 minute cap.
  assert.equal(gateRule(rec({ active_ms: 20 * 60000, active_since: at(20) }), 'R1', { current: 'fp', now }).reason, 'SLICE_CAP');
  // 15 of the 45 queued for the check slot: 30 of work, at the cap and allowed.
  assert.deepEqual(gateRule(rec({ active_ms: 20 * 60000, active_since: at(20), waited_ms: 15 * 60000 }), 'R1', { current: 'fp', now }), allowed);
  // A record written before spans reads its open span from `started`, as it always did.
  assert.equal(gateRule(rec({ started: at(0) }), 'R1', { current: 'fp', now }).reason, 'SLICE_CAP');
  // A closed span leaves no open one behind: the 20 minutes it banked are the whole charge.
  assert.deepEqual(gateRule(rec({ started: at(0), active_ms: 20 * 60000 }), 'R1', { current: 'fp', now }), allowed);
  // An unset cap counts nothing, however long the span.
  assert.deepEqual(gateRule(rec({ started: at(0) }, null), 'R1', { current: 'fp', now }), allowed);
});

test('slice cap: an empty --slice-cap-min means no cap, at run new and at run set', () => {
  const dir = fixture();
  const now = fresh(dir, ['--slice-cap-min', '']);
  assert.equal(ok(work(dir, 'run', 'show', 'road')).slice_cap_min, null);
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(now - 2 * DAY)));
  ok(verify(dir));
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null }, 'a two day span with no cap');
  ok(work(dir, 'run', 'set', 'road', 'slice_cap_min', '30'));
  assert.equal(gate(dir).reason, 'SLICE_CAP', 'a set cap counts the span');
  ok(work(dir, 'run', 'set', 'road', 'slice_cap_min', 'null'));
  assert.equal(ok(work(dir, 'run', 'show', 'road')).slice_cap_min, null);
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null }, 'null again is no cap');
});

// The parked-day issue's acceptance, walked through the record's own commands: a park the user
// must settle and an interrupted session both spend no cap, and an unset cap never fires.
test('slice cap: a session interrupted for two days, or a slice parked waiting for the user, counts only its in-flight time', () => {
  const dir = fixture();
  const now = fresh(dir, ['--slice-cap-min', '30']);
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(now - 2 * DAY)));
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--at', iso(now - 2 * DAY + 10 * 60000), '--', 'true'));
  assert.equal(gate(dir).reason, 'SLICE_CAP', 'two days of wall clock with no second start');
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(now - 10 * 60000)));
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--at', iso(now - 5 * 60000), '--', 'true'));
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null }, 'ten minutes before the gap and ten after it');

  const parked = fixture();
  const later = fresh(parked, ['--slice-cap-min', '30']);
  const first = later - 2 * DAY;
  ok(work(parked, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(first)));
  ok(work(parked, 'run', 'verify', 'road', 'R1', '--at', iso(first + 10 * 60000), '--', 'true'));
  ok(work(parked, 'run', 'slice', 'road', 'R1', 'parked', '--reason', 'waiting on the user', '--needs', 'decision', '--at', iso(first + 20 * 60000)));
  const g = showRun(path.join(parked, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  assert.equal(g.active_ms, 10 * 60000, 'the park closes the span where the verify saw it, not twenty minutes in');
  assert.equal(g.active_since, undefined, 'an audit park leaves no clock running');
  ok(work(parked, 'run', 'slice', 'road', 'R1', 'ready', '--at', iso(later - 10 * 60000)));
  ok(work(parked, 'run', 'verify', 'road', 'R1', '--at', iso(later - 5 * 60000), '--', 'true'));
  assert.deepEqual(gate(parked), { allow: true, reason: null, detail: null }, 'ten minutes of work either side of a day parked');

  const free = fixture();
  const day = fresh(free, ['--slice-cap-min', '']);
  ok(work(free, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(day - DAY)));
  ok(verify(free));
  assert.deepEqual(gate(free), { allow: true, reason: null, detail: null }, 'a day-old span with no cap');
});

test('run slice parked: a close stamped before the span opened counts zero, never a refund', () => {
  const dir = fixture();
  const now = fresh(dir, ['--slice-cap-min', '30']);
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(now - 10 * 60000)));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'parked', '--reason', 'x', '--needs', 'user', '--at', iso(now - 60 * 60000)));
  const g = showRun(path.join(dir, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  assert.equal(g.active_ms, 0, 'a close before the start adds nothing, not a negative span');
  assert.equal(g.active_since, undefined);
  assert.equal(g.last_seen, iso(now - 10 * 60000), 'a park is not evidence of work');
  assert.equal(gate(dir).reason, 'UNVERIFIED', 'the cap did not fire; only the missing verify stops it');
});

test('audit cap: a Must from two rounds back still counts as a repeat', () => {
  const dir = fixture(['--audit-cap', '3']);
  // A, B, A, B: the second A is already raised, so it is the same loop as A, A.
  const spent = [];
  for (const musts of [['leak'], ['race'], ['leak'], ['race']]) {
    auditFailed(dir, ...musts);
    spent.push(audit(dir, 'R1').audit_spent);
  }
  assert.deepEqual(spent, [0, 0, 1, 2], 'each repeat spends one, whichever round first raised it');
});

test('audit cap: the auto-park closes the slice\'s in-flight span', () => {
  const dir = fixture(['--audit-cap', '1']);
  const now = fresh(dir, ['--audit-cap', '1']);
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(now - 30 * 60000)));
  auditFailed(dir, 'a leak');
  assert.equal(audit(dir, 'R1').allow, true, 'the first round on this Must is new work');
  assert.equal(audit(dir, 'R1').allow, true, 'the repeat spends the one round');
  assert.equal(audit(dir, 'R1').allow, false, 'past the one round the slice parks');
  const g = showRun(path.join(dir, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  assert.ok(g.active_ms >= 29 * 60000, `the thirty minutes are banked: ${g.active_ms}`);
  assert.equal(g.active_since, undefined, 'the parked slice has no clock left running');
});

test('run start, verify and audit stamp last_seen; a --final audit stamps none', () => {
  const dir = fixture();
  const gates = () => showRun(path.join(dir, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  const at = (min) => iso(Date.now() - min * 60000);
  const seen = { start: at(50), verify: at(40), audit: at(30), final: at(20) };
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', seen.start));
  assert.equal(gates().last_seen, seen.start);
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--at', seen.verify, '--', 'true'));
  assert.equal(gates().last_seen, seen.verify, 'the verify is the later evidence');
  ok(work(dir, 'run', 'audit', 'road', 'R1', '--at', seen.audit));
  assert.equal(gates().last_seen, seen.audit);
  const final = ok(work(dir, 'run', 'audit', 'road', '--final', '--at', seen.final));
  assert.equal(gates().last_seen, seen.audit, 'the final review has no slice to stamp');
  assert.equal(final.audit_spent, null, 'the final review has no per-slice counter to report');
  assert.equal(showRun(path.join(dir, 'docs/planning'), 'road').final_audit_rounds, 1);
});

test('a record written before spans gates from started, and the next run start replaces that fallback', () => {
  const dir = fixture(['--slice-cap-min', '30']);
  ok(verify(dir));
  const planned = path.join(dir, 'docs/planning');
  const old = iso(Date.now() - 40 * 60000);
  updateRun(planned, 'road', (r) => {
    const g = r.gates.find((x) => x.id === 'R1');
    for (const k of ['active_ms', 'active_since', 'last_seen']) delete g[k];
    g.started = old;
  });
  assert.equal(gate(dir).reason, 'SLICE_CAP', 'a pre-change record gates as it always did');
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(Date.now())));
  const g = showRun(planned, 'road').gates.find((x) => x.id === 'R1');
  assert.equal(g.active_ms, 0, 'the fallback span closes where it began, charging nothing');
  assert.equal(gate(dir).allow, true, 'and the fresh span is new, not the forty minutes back to started');
});

test('a pre-span record does not bank its old clock when a verify and then a park close it', () => {
  const dir = fixture(['--slice-cap-min', '30']);
  ok(verify(dir));
  const planned = path.join(dir, 'docs/planning');
  updateRun(planned, 'road', (r) => {
    const g = r.gates.find((x) => x.id === 'R1');
    for (const k of ['active_ms', 'active_since', 'last_seen']) delete g[k];
    g.started = iso(Date.now() - 20 * 60 * 60000);
  });
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--', 'true'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'parked', '--reason', 'x', '--needs', 'user'));
  const g = showRun(planned, 'road').gates.find((x) => x.id === 'R1');
  assert.equal(g.active_ms, 0, 'there was no open span to close, so nothing is banked');
  assert.equal(g.started, undefined, 'the fallback is gone, so the next span starts clean');
  assert.notEqual(gate(dir).reason, 'SLICE_CAP', 'twenty hours of an untouched wall clock are not work');
});

test('a failing verify still stamps last_seen, so the next start banks the minutes before it', () => {
  const dir = fixture(['--slice-cap-min', '30']);
  const now = fresh(dir, ['--slice-cap-min', '30']);
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(now - 45 * 60000)));
  const failed = work(dir, 'run', 'verify', 'road', 'R1', '--at', iso(now - 5 * 60000), '--', 'false');
  assert.equal(failed.status, 1, 'the check failed, so nothing is recorded as verified');
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(now)));
  const g = showRun(path.join(dir, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  assert.equal(g.active_ms, 40 * 60000, 'the forty minutes before the failing command are work');
  assert.equal(g.started, iso(now - 45 * 60000), 'the first start time is kept, not overwritten');
});

test('slice cap: shipping a slice stops its clock, so its cap never fires on wall clock', () => {
  const dir = fixture(['--slice-cap-min', '30']);
  const now = fresh(dir, ['--slice-cap-min', '30']);
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', iso(now - 2 * DAY)));
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--at', iso(now - 2 * DAY + 5 * 60000), '--', 'true'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'shipped'));
  const g = showRun(path.join(dir, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  assert.equal(g.active_since, undefined, 'a shipped slice has no clock left running');
  assert.equal(g.active_ms, 5 * 60000, 'the five minutes it worked, not the two days since');
  assert.notEqual(gate(dir).reason, 'SLICE_CAP');
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

// `countAudit` in-process: the classification a `run audit` call makes, against a real record.
const roundOf = (dir) => {
  const planningDir = path.join(dir, 'docs/planning');
  return (musts, id = 'R1') => countAudit(planningDir, 'road', { id, musts });
};

test('countAudit: a new Must each round spends nothing; a repeated Must spends one', () => {
  const dir = fixture(['--audit-cap', '3']);
  const round = roundOf(dir);
  const first = round(['a missing test']);
  const second = round(['a missing guard']);
  assert.deepEqual([first.audit_spent, first.audit_rounds], [0, 1], 'the first round has no round before it');
  assert.deepEqual([second.audit_spent, second.audit_rounds], [0, 2], 'a new Must is new work');
  const third = round(['a missing guard']);
  assert.deepEqual([third.audit_spent, third.audit_rounds], [1, 3], 'the same Must again spends one');
  const g = showRun(path.join(dir, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  assert.deepEqual(g.last_musts, ['a missing guard'], 'the round before is kept for the next call');
});

test('countAudit: a refused round counts nothing and says the last fix was never reviewed', () => {
  const dir = fixture(['--audit-cap', '1']);
  const round = roundOf(dir);
  round(['m']);
  round(['m']);
  const over = round(['m']);
  assert.deepEqual([over.allow, over.reason, over.audit_rounds, over.audit_spent], [false, 'SLICE_AUDIT_CAP', 2, 1]);
  assert.match(over.detail, /last fix unreviewed$/);
  const g = showRun(path.join(dir, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  assert.deepEqual([g.audit_rounds, g.audit_spent, g.last_musts], [2, 1, ['m']], 'the refusal spent and stored nothing');
});

test('run audit: the plan\'s last Must classifies the round; a slice with no plan spends nothing', () => {
  const dir = fixture(['--audit-cap', '1']);
  auditFailed(dir, 'fix the leak');
  assert.equal(audit(dir, 'R1').audit_spent, 0, 'the first round on the plan\'s Must is new work');
  auditFailed(dir, 'fix the leak');
  assert.equal(audit(dir, 'R1').audit_spent, 1, 'the same Must again spends the one round');
  // A started slice whose work item holds no plan: there is nothing to repeat.
  ok(work(dir, 'run', 'start', 'road', 'R2', '--work', 'noplan'));
  const plain = audit(dir, 'R2');
  assert.deepEqual([plain.audit_rounds, plain.audit_spent], [1, 0], 'a slice with no plan has nothing to repeat');
});

test('run start: an unparseable --at is refused and leaves the span as it was', () => {
  const dir = fixture();
  const gates = () => showRun(path.join(dir, 'docs/planning'), 'road').gates.find((x) => x.id === 'R1');
  const before = gates();
  const bad = work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat', '--at', 'nope');
  assert.equal(bad.status, 1);
  assert.match(bad.out.error, /--at must be an ISO time/);
  assert.deepEqual(gates(), before, 'no field of the span moved');
});

test('countAudit: a record written before audit_spent reports zero repeats, not its round count', () => {
  const dir = fixture(['--audit-cap', '3']);
  const planned = path.join(dir, 'docs/planning');
  updateRun(planned, 'road', (r) => {
    const g = r.gates.find((x) => x.id === 'R1');
    g.audit_rounds = 2;
    delete g.audit_spent;
  });
  const round = countAudit(planned, 'road', { id: 'R1', musts: ['a new claim'] });
  assert.equal(round.audit_spent, 0, 'no repeat has been counted on this record');
  assert.equal(round.audit_rounds, 3);
});

test('run audit: a bare Must number classifies nothing, so two findings both numbered 1 never repeat', () => {
  const dir = fixture(['--audit-cap', '1']);
  auditFailed(dir, '1');
  assert.equal(audit(dir, 'R1').audit_spent, 0);
  auditFailed(dir, '1');
  const second = audit(dir, 'R1');
  assert.equal(second.audit_spent, 0, 'a number is an ordinal, not a claim');
  assert.equal(second.allow, true, 'two different findings filed as Must 1 are new work');
});

test('audit cap: a resume starts both counters, so a repeat after it spends one', () => {
  const dir = fixture(['--audit-cap', '2']);
  const planningDir = path.join(dir, 'docs/planning');
  const round = roundOf(dir);
  round(['m']);
  round(['m']);
  sliceRun(planningDir, 'road', 'R1', 'parked', { reason: 'x', needs: 'user' });
  resumeSlice(planningDir, 'road', 'R1');
  const first = round(['m']);
  assert.deepEqual([first.audit_spent, first.audit_rounds], [0, 1], 'the resume starts the rounds again, and the first is new');
  const repeat = round(['m']);
  assert.deepEqual([repeat.audit_spent, repeat.audit_rounds], [1, 2], 'a repeat after the resume spends one');
});

test('gate: the slice cap reads audit_spent, not the rounds the slice started', () => {
  const rec = (audit) => ({ slices: [], audit_cap: 1, slice_cap_min: null, gates: [{ id: 'R1', verified_fingerprint: 'fp', ...audit }] });
  const allowed = { allow: true, reason: null, detail: null };
  assert.deepEqual(gateRule(rec({ audit_rounds: 9, audit_spent: 0 }), 'R1', { current: 'fp' }), allowed, 'nine rounds that each found something new are not a loop');
  assert.equal(gateRule(rec({ audit_rounds: 2, audit_spent: 2 }), 'R1', { current: 'fp' }).reason, 'SLICE_AUDIT_CAP');
  const room = auditRoom(rec({ audit_rounds: 2, audit_spent: 1 }), 'R1');
  assert.deepEqual([room.allow, room.reason], [false, 'SLICE_AUDIT_CAP']);
  assert.match(room.detail, /slice R1: 1 round repeated an earlier Must, cap 1/, 'the dispatch detail keeps its counter line');
});

test('run audit: an id the record holds no gate entry for is refused, so no round is spent on it', () => {
  const dir = fixture();
  const r = work(dir, 'run', 'audit', 'road', 'R9');
  assert.equal(r.status, 1);
  assert.match(r.out.error, /run audit: R9 has no gate entry; run start first/);
  const rec = ok(work(dir, 'run', 'show', 'road'));
  assert.equal((rec.gates ?? []).some((g) => g.id === 'R9'), false, 'no R9 gates entry');
  assert.equal(rec.audit_rounds, undefined, 'no round spent');
  start(dir, 'R9');
  assert.equal(audit(dir, 'R9').audit_rounds, 1, 'started, the slice audits');
});

test('audit cap: the round after a slice\'s cap is refused and uncounted, naming the slice; its last allowed round ships', () => {
  const dir = fixture(['--audit-cap', '2']);
  ok(verify(dir));
  auditFailed(dir, 'm1');
  assert.equal(audit(dir, 'R1').audit_rounds, 1);
  assert.equal(audit(dir, 'R1').allow, true, 'the same Must again spends one of two');
  assert.equal(gate(dir).allow, true, 'one repeat at a cap of two: the slice ships');
  assert.equal(audit(dir, 'R1').allow, true, 'the second repeat spends the cap');
  const over = audit(dir, 'R1');
  assert.deepEqual([over.allow, over.reason, over.audit_rounds, over.audit_spent, over.limit], [false, 'SLICE_AUDIT_CAP', 3, 2, 'slice R1']);
  assert.match(over.detail, /slice R1: 2 rounds repeated an earlier Must, cap 2/);
  // A caller that ignores the refusal is still stopped at the gate; a raised cap clears it.
  assert.match(gate(dir).detail, /slice R1/);
  assert.equal(gate(dir).reason, 'SLICE_AUDIT_CAP');
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '3'));
  assert.equal(gate(dir).allow, true);
  assert.equal(audit(dir, 'R1').allow, true);
  assert.equal(gate(dir).allow, true, 'the 3rd repeat at a cap of three: the slice ships');
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '1'));
  assert.equal(gate(dir).reason, 'SLICE_AUDIT_CAP', 'a cap lowered below the repeats stopped the gate');
  const fresh = ok(work(tmpRepo(), 'run', 'new', 'x'));
  assert.deepEqual([fresh.audit_cap, fresh.final_audit_cap, fresh.audit_total_cap], [3, 3, null]);
});

test('audit cap: a slice at its cap parks and the run goes on; resume gives it fresh rounds', () => {
  const dir = fixture(['--audit-cap', '1']);
  auditFailed(dir, 'm1');
  assert.equal(audit(dir, 'R1').allow, true);
  assert.equal(audit(dir, 'R1').allow, true, 'the repeat spends the one round');
  const over = audit(dir, 'R1');
  assert.deepEqual([over.allow, over.reason], [false, 'SLICE_AUDIT_CAP']);
  const parked = ok(work(dir, 'run', 'show', 'road')).slices.find((s) => s.id === 'R1');
  assert.deepEqual([parked.status, parked.needs], ['parked', 'decision']);
  assert.match(parked.reason, /slice R1: 1 round repeated an earlier Must, cap 1/);
  assert.match(parked.reason, /last fix unreviewed$/);
  start(dir, 'R2');
  assert.equal(audit(dir, 'R2').allow, true, 'another slice still audits');
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'ready'));
  assert.equal(audit(dir, 'R1').allow, true, 'resume zeroes the slice\'s rounds');
  // A manual park and resume does the same.
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'parked', '--reason', 'x', '--needs', 'user'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'ready'));
  assert.equal(audit(dir, 'R1').allow, true, 'a manual park and resume starts its rounds again');
});

test('audit cap: the final review and run total still stop the run without parking a slice', () => {
  const dir = fixture(['--audit-cap', '2', '--max-slices', '1']);
  for (const id of ['R1', 'R1']) assert.equal(audit(dir, id).allow, true);
  start(dir, 'R2');
  const r = audit(dir, 'R2');
  assert.deepEqual([r.allow, r.reason, r.limit], [false, 'AUDIT_CAP', 'run total']);
  assert.equal(ok(work(dir, 'run', 'show', 'road')).slices.length, 0);
});

test('audit cap: a round needs a slice or --final', () => {
  const dir = fixture();
  assert.equal(work(dir, 'run', 'audit', 'road').status, 1);
});

test('audit cap: lowering a cap back to the value it refused at does not revive the refusal', () => {
  const dir = fixture(['--audit-cap', '2']);
  ok(verify(dir));
  auditFailed(dir, 'm1');
  audit(dir, 'R1');
  audit(dir, 'R1');
  audit(dir, 'R1');
  assert.equal(audit(dir, 'R1').allow, false);
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '3'));
  ok(work(dir, 'run', 'set', 'road', 'audit_cap', '2'));
  assert.equal(gate(dir).allow, true, 'two repeats at a cap of two ship; the old refusal is gone');
  assert.equal(ok(work(dir, 'run', 'show', 'road')).audit_stop, undefined);
  // The run-total refusal clears the same way.
  const total = fixture(['--audit-cap', '2', '--max-slices', '2']);
  ok(verify(total));
  for (const id of ['R2', 'R3']) start(total, id);
  for (const id of ['R1', 'R1', 'R2', 'R2']) assert.equal(audit(total, id).allow, true);
  assert.equal(audit(total, 'R3').allow, false);
  assert.equal(gate(total).reason, 'AUDIT_CAP', 'the refusal stops the gate while the cap is unchanged');
  ok(work(total, 'run', 'set', 'road', 'audit_total_cap', '5'));
  ok(work(total, 'run', 'set', 'road', 'audit_total_cap', '4'));
  assert.equal(gate(total).allow, true, 'four rounds at a cap of four ship: the record-level marker is gone');
  // And so does the final review's.
  const fin = fixture(['--final-audit-cap', '1']);
  assert.equal(audit(fin, '--final').allow, true);
  assert.equal(audit(fin, '--final').allow, false);
  assert.equal(ok(work(fin, 'run', 'show', 'road')).final_audit_refused, 1);
  ok(work(fin, 'run', 'set', 'road', 'final_audit_cap', '2'));
  ok(work(fin, 'run', 'set', 'road', 'final_audit_cap', '1'));
  assert.equal(ok(work(fin, 'run', 'show', 'road')).final_audit_refused, undefined);
  // A record written before final_audit_cap existed still gates and counts the final review.
  const old = fixture();
  const file = path.join(old, 'docs/planning/road.run/RUN.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^final_audit_cap:.*\n/m, ''));
  assert.equal(ok(work(old, 'run', 'show', 'road')).final_audit_cap, undefined);
  ok(verify(old));
  assert.equal(gate(old).allow, true);
  assert.equal(audit(old, '--final').allow, true, 'the final review falls back to audit_cap');
});

test('audit cap: resuming the slice a stop names clears audit_stop; another slice\'s stop stays', () => {
  const dir = fixture(['--audit-cap', '1']);
  auditFailed(dir, 'm1');
  audit(dir, 'R1');
  audit(dir, 'R1');
  assert.equal(audit(dir, 'R1').allow, false);
  assert.match(ok(work(dir, 'run', 'show', 'road')).audit_stop, /^slice R1:/);
  ok(work(dir, 'run', 'slice', 'road', 'R2', 'ready'));
  assert.match(ok(work(dir, 'run', 'show', 'road')).audit_stop, /^slice R1:/, 'resuming R2 leaves R1\'s stop');
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'ready'));
  assert.equal(ok(work(dir, 'run', 'show', 'road')).audit_stop, undefined);
  // The prefix names the slice exactly: resuming R1 leaves an R10 stop alone.
  start(dir, 'R10');
  assert.equal(audit(dir, 'R10').allow, true);
  assert.equal(audit(dir, 'R10').allow, true, 'the repeat spends the one round');
  assert.equal(audit(dir, 'R10').allow, false);
  const r10 = ok(work(dir, 'run', 'show', 'road')).audit_stop;
  assert.match(r10, /^slice R10:/);
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'ready'));
  assert.equal(ok(work(dir, 'run', 'show', 'road')).audit_stop, r10, 'resuming R1 leaves R10\'s stop');
});

// The converging-audit issue's R17: each round found a new, real Must, and the old cap parked the
// third call before its fix was reviewed. A new Must spends nothing, so the review goes ahead.
test('audit cap: R17 - two rounds that each raised a new Must are allowed, and the third review runs with audit_spent 0', () => {
  const dir = fixture();
  ok(verify(dir));
  const first = audit(dir, 'R1');
  assert.deepEqual([first.allow, first.audit_rounds, first.audit_spent], [true, 1, 0], 'the first round has no round before it');
  auditFailed(dir, 'the play aborted on an unreachable host', 'the password comparison failed on every healthy host');
  ok(verify(dir));
  const second = audit(dir, 'R1');
  assert.deepEqual([second.allow, second.audit_rounds, second.audit_spent], [true, 2, 0], 'two new Musts are new work');
  auditFailed(dir, 'a report task read a field a failed result does not have');
  ok(verify(dir));
  const third = audit(dir, 'R1');
  assert.deepEqual([third.allow, third.audit_rounds, third.audit_spent, third.limit], [true, 3, 0, null], 'the round 2 fix gets its review under a cap of 3');
});

test('audit cap: a slice repeating the same Must four times parks the fifth with "last fix unreviewed", and the digest names the limit', () => {
  const dir = fixture();
  auditFailed(dir, 'm1');
  const rounds = [];
  for (let i = 0; i < 4; i++) rounds.push(audit(dir, 'R1'));
  assert.deepEqual(rounds.map((x) => x.audit_spent), [0, 1, 2, 3], 'one spent for each repeat, the first round new');
  const r = audit(dir, 'R1');
  assert.deepEqual([r.allow, r.reason, r.limit], [false, 'SLICE_AUDIT_CAP', 'slice R1']);
  assert.match(r.detail, /last fix unreviewed$/);
  const parked = ok(work(dir, 'run', 'show', 'road')).slices.find((s) => s.id === 'R1');
  assert.match(parked.reason, /last fix unreviewed$/);
  start(dir, 'R2');
  assert.equal(audit(dir, 'R2').allow, true, 'another slice has its own rounds');
  assert.equal(spawnSync('node', [WORK, 'run', 'digest', 'road'], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } }).status, 0);
  const digest = fs.readFileSync(path.join(dir, 'docs/planning/road.run/DIGEST.md'), 'utf8');
  assert.match(digest, /## Limit fired[\s\S]*- SLICE_AUDIT_CAP, slice R1: 3 rounds repeated an earlier Must, cap 3/);
});

test('gate reads the record: it adds no gates entry for a slice that has none', () => {
  const rec = { slices: [], gates: [], audit_cap: 3, slice_cap_min: 120 };
  gateRule(rec, 'R9', { current: 'fp' });
  assert.deepEqual(rec.gates, []);
  // A cap the record already shows as spent, and still no entry for the slice: the cap path reads only.
  const spent = { slices: [], gates: [], audit_cap: 3, audit_total_cap: 0, audit_refused: 0, slice_cap_min: 120 };
  assert.equal(gateRule(spent, 'R9', { current: 'fp' }).reason, 'AUDIT_CAP');
  assert.deepEqual(spent.gates, []);
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
  for (const id of ['R2', 'R3', 'R4']) start(dir, id);
  for (const id of ['R1', 'R1', 'R2', 'R2']) assert.equal(audit(dir, id).allow, true);
  const r = audit(dir, 'R3');
  assert.deepEqual([r.allow, r.limit], [false, 'run total']);
  assert.match(r.detail, /run total: 4 audit rounds, cap 4/);
  ok(work(dir, 'run', 'set', 'road', 'audit_total_cap', '5'));
  assert.equal(audit(dir, 'R3').allow, true, 'the overridden total allows one more');
  assert.equal(audit(dir, 'R4').allow, false);
  const none = fixture();
  for (let i = 1; i <= 12; i++) {
    start(none, `R${i}`);
    assert.equal(audit(none, `R${i}`).allow, true, 'no max_slices and no total: no backstop');
  }
  // Under the defaults a long run at two rounds a slice finishes.
  const defaults = fixture();
  for (let i = 1; i <= 8; i++) {
    const id = `R${i}`;
    start(defaults, id);
    assert.equal(audit(defaults, id).allow, true);
    assert.equal(audit(defaults, id).allow, true, `${id} second round`);
    ok(work(defaults, 'run', 'slice', 'road', id, 'shipped'));
  }
  assert.equal(ok(work(defaults, 'run', 'show', 'road')).audit_rounds, 16, 'the run total counts across slices');
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
  rec2.gates.find((g) => g.id === 'R1').audit_spent = 2;
  assert.equal(gateRule(rec2, 'R1', { current: 'fp' }).reason, 'SLICE_AUDIT_CAP');
});

test('run audit: a refusal another writer clears before the write is not reported, and the retried round is', () => {
  const dir = fixture(['--audit-cap', '1']);
  auditFailed(dir, 'm');
  audit(dir, 'R1'); // the first round on the plan's Must is new work
  audit(dir, 'R1'); // the repeat spends the slice's one allowed round
  let raised = false;
  // The plan lookup a refusal makes is where the other writer lands: it raises the cap.
  const items = {
    get: () => {
      if (!raised) {
        raised = true;
        ok(work(dir, 'run', 'set', 'road', 'audit_cap', '2'));
      }
      return { state: { status: 'building' } };
    },
  };
  const out = countAudit(path.join(dir, 'docs/planning'), 'road', { id: 'R1', items });
  assert.deepEqual([out.allow, out.audit_rounds], [true, 3], 'the retry\'s own answer, never the first attempt\'s refusal');
});

test('run audit: a second audit that lands in the read-modify-write window keeps its round', () => {
  const dir = fixture(['--audit-cap', '1']);
  const planning = path.join(dir, 'docs/planning');
  auditFailed(dir, 'm');
  audit(dir, 'R1'); // the first round on the plan's Must is new work
  audit(dir, 'R1'); // the repeat spends R1's one allowed round
  start(dir, 'R2');
  // The refusal path looks the plan up; the second audit lands there, between this call's read and
  // its write, so the record it read is replaced under it.
  let landed = false;
  const items = {
    get: () => {
      if (!landed) {
        landed = true;
        assert.equal(ok(work(dir, 'run', 'audit', 'road', 'R2')).allow, true, 'the second audit is counted');
      }
      return { state: { status: 'building' } };
    },
  };
  const out = countAudit(planning, 'road', { id: 'R1', items });
  assert.deepEqual([out.allow, out.audit_rounds, out.limit], [false, 2, 'slice R1'], 'R1 is still at its cap: refused and not counted');
  const rec = showRun(planning, 'road');
  assert.equal(rec.gates.find((g) => g.id === 'R2').audit_rounds, 1, 'the audit that landed in the window kept its round');
  assert.equal(rec.audit_rounds, 3, 'both rounds are in the record');
  assert.ok(rec.slices.some((s) => s.id === 'R1' && s.status === 'parked'), 'the refusal still parks R1');
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
  assert.deepEqual(nextSlice(road, { max_slices: null, slices: [] }, { batch: 3 }).next, ['R1'], 'a batch keeps the slices the decision and the chain hold back out of it');
});

test('run next --batch: the next N free slices in the order next uses, and one id without the flag', () => {
  // roadmapSlices' `ready` is already sorted by milestone, risk, blocks then id.
  const free = ['R1', 'R2', 'R3'].map((id) => ({ id, blocked_by: [], state: 'ready' }));
  const road = { slices: free, ready: ['R3', 'R1', 'R2'] };
  const rec = { max_slices: null, slices: [] };
  assert.equal(nextSlice(road, rec).next, 'R3', 'without --batch the first id, as before');
  assert.deepEqual(nextSlice(road, rec, { batch: 2 }).next, ['R3', 'R1'], 'the first two, in that order');
  assert.deepEqual(nextSlice(road, rec, { batch: 9 }).next, ['R3', 'R1', 'R2'], 'a batch past the queue is the whole queue');
  // An in-flight slice resumes before a new one starts, so it leads the batch too.
  const flying = { slices: [...free, { id: 'R4', blocked_by: [], state: 'in flight' }], ready: ['R3', 'R1', 'R2'] };
  assert.deepEqual(nextSlice(flying, rec, { batch: 2 }).next, ['R4', 'R3']);
  // At the cap the list shape holds: a coordinator reads `next` as a list whichever way the run ends.
  const capped = nextSlice(road, { max_slices: 1, slices: [{ id: 'R0', status: 'shipped' }] }, { batch: 2 });
  assert.deepEqual([capped.next, capped.stop.reason], [[], 'MAX_SLICES']);
  assert.throws(() => nextSlice(road, rec, { batch: 0 }), /positive whole number/);
  // The CLI takes the count, refuses zero, and stays one id without the flag.
  const dir = fixture();
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs/roadmap/r.md'),
    [
      '# R',
      '### M1',
      '| Slice | Kind | Delivers | Risk | Blocked by | Status |',
      '|-------|------|----------|------|------------|--------|',
      '| R1 | feat | a | low | - | ready |',
      '| R2 | feat | b | high | - | ready |',
      '| R3 | feat | c | med | - | ready |',
      '',
    ].join('\n'),
  );
  const file = 'docs/roadmap/r.md';
  assert.equal(ok(work(dir, 'run', 'next', 'road', file)).next, 'R2', 'risk orders the queue, so high risk comes first');
  assert.deepEqual(ok(work(dir, 'run', 'next', 'road', file, '--batch', '2')).next, ['R2', 'R3']);
  assert.deepEqual(ok(work(dir, 'run', 'next', 'road', file, '--batch', '9')).next, ['R2', 'R3', 'R1']);
  const bad = work(dir, 'run', 'next', 'road', file, '--batch', '0');
  assert.equal(bad.status, 1);
  assert.match(bad.out.error, /positive whole number/);
});

test('run next --batch: a slice that waits on a parked one stays out, through the chain', () => {
  const road = {
    slices: [
      { id: 'R1', blocked_by: [], state: 'ready' },
      { id: 'R2', blocked_by: ['R1'], state: 'ready' },
      { id: 'R3', blocked_by: ['R2'], state: 'ready' },
      { id: 'R4', blocked_by: [], state: 'ready' },
    ],
    ready: ['R1', 'R4', 'R2', 'R3'],
  };
  const parked = { max_slices: null, slices: [{ id: 'R1', status: 'parked' }] };
  assert.deepEqual(nextSlice(road, parked, { batch: 4 }).next, ['R4'], 'R2 waits on the parked R1 and R3 on R2');
  assert.deepEqual(nextSlice(road, parked).next, 'R4', 'the single id agrees with the batch');
});

test('STOPS.md names exactly the shared reason codes, and judgment codes are named as judgment', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'skills/finish-it/STOPS.md'), 'utf8');
  const named = [...doc.matchAll(/^- `([A-Z_0-9]+)` \((park|stop)\)/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(named.map((n) => n[0]).sort(), Object.keys(STOPS).sort());
  for (const [code, action] of named) assert.equal(STOPS[code].action, action, code);
  const judgment = doc.slice(doc.indexOf('## Judgment'));
  for (const [code, s] of Object.entries(STOPS)) assert.equal(judgment.includes(`\`${code}\``), s.how === 'judgment', code);
  // The slice-cap issue asks the doc to say what the cap measures: in-flight minutes, never parked time.
  const cap = doc.split('\n').find((l) => l.startsWith('- `SLICE_CAP`'));
  assert.match(cap, /in-flight minutes/, 'the cap measures in-flight minutes');
  assert.match(cap, /Parked time[^\n]*are not counted/, 'parked time is named as not counted');
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

test('runVerify: one directory under two names records the coordinator tree, so no merged check is asked', () => {
  // macOS /var and Windows RUNNER~1 name the same tree as /private/var and runneradmin.
  const dir = fixture();
  const link = path.join(path.dirname(dir), `link-${path.basename(dir)}`);
  try {
    fs.symlinkSync(dir, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (e) {
    if (process.platform !== 'win32') throw e;
    return assert.ok(true, `no junction allowed: ${e.message}`);
  }
  try {
    const base = { ...unit(dir), items: stub(), root: link, cwd: link, fingerprintOf: () => 'fp', quote: String };
    const rec = runVerify({ ...base, opts: { '--': ['true'] } });
    assert.equal(rec.gates[0].verified_root, '.', 'the same tree under another name is the coordinator\'s own checkout');
    assert.equal(runGate({ ...base }).allow, true, 'so the gate does not ask for a merged check');
  } finally {
    fs.rmSync(link, { force: true });
  }
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
  const back = runVerify({ ...base, opts: { '--': ['true'], paths: 'a.js' } });
  assert.ok(back.gates[0].verified_files['a.js'], 'the reverse order: --paths after a bare verify records the files again');
  assert.throws(() => runVerify({ ...base, id: 'R9', opts: { '--': ['true'] } }), /run start first/);
  assert.throws(() => runVerify({ ...base, opts: {} }), /needs the checks/);
});

test('runVerify: --in resolves against the caller\'s directory, and a check that passes only on its rerun parks the slice', () => {
  const dir = fixture([], 'do-it gate ');
  const sub = path.join(dir, 'sub');
  fs.mkdirSync(path.join(sub, 'inner'), { recursive: true });
  fs.writeFileSync(path.join(sub, 'inner', 'here.txt'), 'x\n');
  const base = { ...unit(dir), items: stub(), root: dir, cwd: sub, fingerprintOf: () => 'fp', quote: String };
  // here.txt exists only under cwd/inner: resolving --in against the repo root would not find it.
  assert.equal(runVerify({ ...base, opts: { '--': ['test -f here.txt'], in: 'inner' } }).gates[0].verified_fingerprint, 'fp');
  assert.throws(() => runVerify({ ...base, opts: { '--': ['test -f here.txt'] } }), /exited 1/, 'without --in the check runs at the root');
  const flaky = path.join(dir, 'ran-once');
  assert.throws(() => runVerify({ ...base, opts: { '--': [`test -f "${sh(flaky)}" || { touch "${sh(flaky)}"; exit 1; }`] } }), /FLAKY/);
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
  // The loop's own calls are all offered in that error.
  for (const sub of ['start', 'audit', 'gate', 'verify', 'reject-assumption']) assert.ok(subs.includes(sub), `${sub} is a subcommand the loop calls`);
});

test('every reason the gate and run next return is a code in STOPS, shared with the loop text', () => {
  const rec = { max_slices: 1, slice_cap_min: 1, audit_cap: 1, slices: [{ id: 'S', status: 'shipped' }], gates: [{ id: 'R1', started: '2026-01-01T00:00:00Z', audit_spent: 2 }] };
  const seen = new Set();
  const stop = (r) => seen.add(r.reason);
  // MAX_SLICES comes from run next, the path that emits it; the gate's other four from the rule.
  const road = { slices: [{ id: 'R1', blocked_by: [], state: 'shipped' }, { id: 'R2', blocked_by: [], state: 'ready' }], ready: ['R2'] };
  stop(nextSlice(road, { max_slices: 1, slices: [{ id: 'R1', status: 'shipped' }] }).stop);
  stop(gateRule({ ...rec, max_slices: null }, 'R1', { current: 'fp', now: Date.parse('2026-01-01T00:00:30Z') }));
  stop(gateRule({ ...rec, max_slices: null, audit_cap: 9 }, 'R1', { current: 'fp', now: Date.parse('2026-01-01T00:05:00Z') }));
  const soon = { current: 'fp', now: Date.parse('2026-01-01T00:00:30Z') };
  stop(gateRule({ ...rec, max_slices: null, audit_cap: 9, slice_cap_min: 99 }, 'R1', soon));
  stop(gateRule({ ...rec, max_slices: null, audit_cap: 9, slice_cap_min: 99, gates: [{ id: 'R1', verified_fingerprint: 'old' }] }, 'R1', soon));
  assert.deepEqual([...seen].sort(), ['MAX_SLICES', 'SLICE_AUDIT_CAP', 'SLICE_CAP', 'STALE_VERIFY', 'UNVERIFIED']);
  for (const code of seen) assert.equal(STOPS[code]?.how, 'gate', `${code} is a gate stop in STOPS`);
});

// The finish-it loop is text an agent follows, so a stop is only as live as its call
// site there. Each shared stop code names the `work.mjs run` call that surfaces it.
const CALL_SITE = {
  STALE_VERIFY: 'gate',
  UNVERIFIED: 'gate',
  SLICE_CAP: 'gate',
  FLAKY: 'verify',
  VERIFY_CAP: 'gate',
  MAX_SLICES: 'next',
  AUDIT_CAP: 'audit',
  SLICE_AUDIT_CAP: 'audit',
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

test('the finish-it loop ends its turn only at §4, never per slice', () => {
  const doc = read('skills/finish-it/SKILL.md');
  const loop = section(doc, '2. Loop');
  assert.match(doc, /^## 4\. Close$/m, 'the Close section follows the loop');
  assert.equal(closesEarly(loop), false);
  assert.equal(closesEarly(`${loop}\n7. A slice parked: close the turn with a Next: line.`), true, 'a fixture that closes before §4 fails');
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

// A run record "road" whose item "feat" has these assumptions, and a plan stub that lists them.
function planOf(texts, status = 'shipping') {
  const dir = fixture();
  ok(work(dir, 'run', 'add-assumptions', 'road', 'feat', JSON.stringify(texts)));
  const fired = [];
  const plan = { state: { status, assumptions: [...texts] } };
  const items = { get: () => plan, fire: (id, event, args) => fired.push([event, args.n, args.text]) };
  return { ...unit(dir), dir, items, fired, plan };
}

test('reject-assumption: an assumption ship-it already rejected plan-side only updates the record, no refusal', () => {
  const t = planOf(['a', 'b']);
  t.plan.state.assumptions = ['b']; // ship-it removed `a` from the plan
  const out = runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  assert.deepEqual([out.reopened, t.fired], [false, []]);
  assert.ok(out.followup, 'the record-only change is named in followup');
  assert.deepEqual(showRun(t.planningDir, 'road').rejected, ['feat#1: a (instead: x)']);
  // A plan edited by hand fires no event and names it, so the plan is never changed blind.
  const hand = rejectFixture();
  hand.plan.state.assumptions = ['edited by hand', 'edited too'];
  const edited = runRejectAssumption({ ...hand, key: 'feat#2', instead: 'x' });
  assert.deepEqual([edited.reopened, hand.fired], [false, []]);
  assert.ok(edited.followup, 'a hand-edited plan is named in followup');
  assert.match(edited.followup, /no longer lists it \(rejected plan-side or edited\): only the record changed/);
  assert.deepEqual(hand.plan.state.assumptions, ['edited by hand', 'edited too'], 'the hand-edited plan is left alone');
  // A closed item has no plan to reopen, so only the record changes.
  const closed = rejectFixture();
  closed.items.get = () => {
    throw new Error('no plan for feat under docs/planning');
  };
  const gone = runRejectAssumption({ ...closed, key: 'feat#1', instead: 'x' });
  assert.equal(gone.reopened, false);
  assert.deepEqual(closed.fired, []);
  assert.equal(showRun(closed.planningDir, 'road').rejected.length, 1);
  assert.throws(() => runRejectAssumption({ ...closed, key: 'feat#9', instead: 'x' }), /no recorded assumption/);
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

test('reject-assumption: equal texts after a plan-side reject leave the plan alone and ambiguous names every id', () => {
  const t = rejectFixture();
  t.plan.state.assumptions = ['same']; // ship-it rejected one plan-side; the list closed up
  const out = runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  assert.deepEqual([out.reopened, t.fired], [false, []], 'the texts are equal and the lists differ: nothing is guessed');
  assert.match(out.followup, /equal texts \(feat#1, feat#2\)/);
  assert.deepEqual(t.plan.state.assumptions, ['same'], 'the plan is left alone');
  assert.deepEqual(showRun(t.planningDir, 'road').rejected, ['feat#1: same (instead: x)']);
});

test('reject-assumption: once an equal text is rejected, the survivor\'s rejection fires the plan event at its one entry', () => {
  const t = rejectFixture();
  t.plan.state.assumptions = ['same'];
  runRejectAssumption({ ...t, key: 'feat#1', instead: 'x' });
  const second = runRejectAssumption({ ...t, key: 'feat#2', instead: 'y' });
  assert.deepEqual(t.fired, [['feat', 'reject-assumption', 1, 'y']], 'feat#2 is the survivor: the plan event fires with the right text');
  assert.equal(second.reopened, true);
  assert.deepEqual(showRun(t.planningDir, 'road').rejected, ['feat#1: same (instead: x)', 'feat#2: same (instead: y)']);
  // Equal texts with the plan unchanged: the key's own place is removed, and the record says which.
  const both = rejectFixture();
  const out = runRejectAssumption({ ...both, key: 'feat#2', instead: 'different' });
  assert.deepEqual(both.fired, [['feat', 'reject-assumption', 2, 'different']], 'the plan event fires at the key\'s place');
  assert.equal(out.reopened, true);
  const rec = showRun(both.planningDir, 'road');
  assert.ok(rec.assumptions.includes('feat#1: same') && !rec.assumptions.includes('feat#2: same'), 'the other keeps its number');
  assert.deepEqual(rec.rejected, ['feat#2: same (instead: different)']);
  // After an earlier rejection the entry is found by text among those left.
  const left = planOf(['a', 'b']);
  runRejectAssumption({ ...left, key: 'feat#1', instead: 'x' });
  left.plan.state.assumptions = ['b']; // the plan event removed the first
  runRejectAssumption({ ...left, key: 'feat#2', instead: 'y' });
  assert.deepEqual(left.fired, [['reject-assumption', 1, 'x'], ['reject-assumption', 1, 'y']]);
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
  // In the renumbered list the plan entry is still found.
  const u = planOf(['a', 'b']);
  runRejectAssumption({ ...u, key: 'feat#1', instead: 'x' });
  ok(work(u.dir, 'run', 'add-assumptions', 'road', 'feat', '["p","q"]'));
  u.plan.state.assumptions = ['p', 'q'];
  runRejectAssumption({ ...u, key: 'feat#2', instead: 'y' });
  assert.deepEqual(u.fired.at(-1), ['reject-assumption', 2, 'y']);
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

test('updateRun: a change that writes the record again is retried on the fresh record, so neither write is lost', () => {
  const dir = fixture();
  const { planningDir, slug } = unit(dir);
  let once = false;
  const rec = updateRun(planningDir, slug, (r) => {
    r.limits = [...r.limits, 'the slower writer'];
    if (once) return;
    once = true;
    // A second writer lands between this change and its write.
    updateRun(planningDir, slug, (other) => {
      other.limits = [...other.limits, 'the faster writer'];
    });
  });
  assert.deepEqual(rec.limits, ['the faster writer', 'the slower writer'], 'the retried change is applied to the record the other writer left');
  assert.deepEqual(showRun(planningDir, slug).limits, ['the faster writer', 'the slower writer']);
});

test('updateRun: a record that changes on every attempt is reported as a lost update, and the losing change is never written', () => {
  const dir = fixture();
  const { planningDir, slug } = unit(dir);
  assert.throws(
    () =>
      updateRun(planningDir, slug, (r) => {
        r.limits = [...r.limits, 'never written'];
        updateRun(planningDir, slug, (other) => {
          other.limits = [...other.limits, 'always another writer'];
        });
      }),
    /lost update/,
  );
  assert.ok(!showRun(planningDir, slug).limits.includes('never written'), 'the losing change never reached the record');
});

test('the docs name the do-it commit line as the ATTRIBUTION constant, and finish-it maps the level argument to run new --level', () => {
  assert.doesNotMatch(read('skills/build-it/COMMITS.md') + read('skills/do-it/scripts/commit.mjs'), /user's (commit )?rules?/);
  assert.match(read('skills/build-it/COMMITS.md'), /ATTRIBUTION/);
  assert.match(read('skills/finish-it/SKILL.md'), /run new <slug> --level\s+lite\|full\|ultra/);
});
