// Phase 5 of tracks-mode: one record and a merged fingerprint. The coordinator counts every audit
// round through the script, so a slice at its cap is refused before a track is dispatched; the
// fingerprint a slice ships with is the merged tree's; and a lane's own RUN.md is history only.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

// A run "road" at two tracks whose slices R1 and R2 are disjoint, so both are dispatched until a
// cap stops one.
function fixture(runFlags = []) {
  const dir = tmpDir('do-it-record-');
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/roadmap/r.md'), [
    '# R', '', '### M1', '',
    '| Slice | Kind | Delivers | Risk | Blocked by | Status |',
    '|-------|------|----------|------|------------|--------|',
    '| R1 | feat | api | low | - | ready |',
    '| R2 | feat | bus | low | - | ready |',
    '',
  ].join('\n'));
  for (const [id, slice, file] of [['api', 'R1', 'src/api.js,src/other.js'], ['bus', 'R2', 'src/bus.js']]) {
    ok(work(dir, 'new', id, '--lane', 's', '--title', id));
    ok(work(dir, 'set', id, 'roadmap', JSON.stringify(`docs/roadmap/r.md#${slice}`)));
    ok(work(dir, 'event', id, 'approve'));
    ok(work(dir, 'event', id, 'start'));
    fs.appendFileSync(path.join(dir, `docs/planning/${id}.md`), `\n## Files\n${file}\n\n## Interfaces\n\`${id}.run() -> ok\`\n`);
  }
  ok(work(dir, 'run', 'new', 'road', '--tracks', '2', ...runFlags));
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'api'));
  ok(work(dir, 'run', 'start', 'road', 'R2', '--work', 'bus'));
  return dir;
}
const tracks = (dir) => ok(work(dir, 'run', 'tracks', 'road', 'docs/roadmap/r.md'));
const audit = (dir, id) => ok(work(dir, 'run', 'audit', 'road', id));
const show = (dir) => ok(work(dir, 'run', 'show', 'road'));

// The plan's last audit round, ended on these Musts: what the next `run audit` is classified against.
// A plan at its third failed round in a row blocks, so unblock it before the next one.
function auditFailed(dir, id, ...musts) {
  const status = () => ok(work(dir, 'show', id)).status;
  if (status() === 'blocked') ok(work(dir, 'event', id, 'unblock'));
  if (status() === 'building') {
    ok(work(dir, 'verify-phase', id, '--', 'true'));
    ok(work(dir, 'event', id, 'build-done'));
  }
  ok(work(dir, 'event', id, 'audit-fail', ...musts));
}

test('one record counts every track\'s rounds, and a lane record beside it is never read', () => {
  const dir = fixture(['--audit-cap', '3']);
  const out = tracks(dir);
  assert.deepEqual(out.tracks.map((t) => t.id), ['R1', 'R2'], 'two disjoint slices start two tracks');
  assert.deepEqual(out.refused, [], 'both have a round to spend');
  // What each track spends, counted by the coordinator through the script.
  assert.equal(audit(dir, 'R1').audit_rounds, 1);
  assert.equal(audit(dir, 'R1').audit_rounds, 2);
  assert.equal(audit(dir, 'R2').audit_rounds, 1);
  const rec = show(dir);
  assert.equal(rec.audit_rounds, 3, 'the run total is the sum of both tracks\' rounds');
  assert.deepEqual(rec.gates.map((g) => [g.id, g.audit_rounds]), [['R1', 2], ['R2', 1]], 'each track\'s rounds are that slice\'s');
  // A track writes no record of its own; a stray one in its worktree is history nothing reads.
  const wt = out.tracks[0].worktree;
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'do-it/road--R1');
  assert.equal(fs.existsSync(path.join(wt, 'RUN.md')), false, 'a track writes no RUN.md of its own');
  fs.writeFileSync(path.join(wt, 'RUN.md'), '# history\n\naudit_rounds: 99\n');
  assert.equal(show(dir).audit_rounds, 3, 'run show prints the coordinator\'s record, not a lane\'s');
});

test('a slice with no audit round left is refused before dispatch; the other track still starts', () => {
  const dir = fixture(['--audit-cap', '1']);
  assert.deepEqual(tracks(dir).tracks.map((t) => t.id), ['R1', 'R2'], 'before any round, both start');
  // R1's rounds keep raising the same Must: the first is new work, the second spends its one repeat round.
  auditFailed(dir, 'api', 'leak');
  assert.equal(audit(dir, 'R1').allow, true, 'its first round on this Must');
  assert.equal(audit(dir, 'R1').allow, true, 'the repeat spends the one round');
  const out = tracks(dir);
  assert.deepEqual(out.tracks.map((t) => t.id), ['R2'], 'a spent cap starts no track for that slice');
  const refused = out.refused.find((r) => r.id === 'R1');
  assert.equal(refused.reason, 'SLICE_AUDIT_CAP');
  assert.match(refused.detail, /slice R1: 1 rounds repeated an earlier Must, cap 1/);
  assert.deepEqual(out.waiting, [], 'refused is not waiting: no next round frees a spent cap');
  const g = show(dir).gates.find((x) => x.id === 'R1');
  assert.deepEqual([g.audit_rounds, g.audit_spent], [2, 1], 'the refusal spends no round');
});

test('a refused round after a passing last round leaves the slice unparked and ships', () => {
  const dir = fixture(['--audit-cap', '1']);
  auditFailed(dir, 'api', 'leak');
  assert.equal(audit(dir, 'R1').allow, true, 'its first round is new work');
  assert.equal(audit(dir, 'R1').allow, true, 'the repeat spends its one round');
  ok(work(dir, 'verify-phase', 'api', '--', 'true'));
  ok(work(dir, 'event', 'api', 'build-done'));
  ok(work(dir, 'event', 'api', 'audit-pass'));
  const refused = audit(dir, 'R1');
  assert.deepEqual([refused.allow, refused.reason], [false, 'SLICE_AUDIT_CAP'], 'the cap still refuses the extra round');
  const rec = show(dir);
  assert.equal(rec.gates.find((g) => g.id === 'R1').audit_refused, undefined, 'a passing last round leaves no refusal marker');
  assert.equal(rec.audit_stop, undefined, 'the refusal does not name a limit that fired');
  assert.equal(rec.slices.some((s) => s.id === 'R1' && s.status === 'parked'), false, 'the slice is not parked');
  assert.equal(ok(work(dir, 'run', 'gate', 'road', 'R1')).reason, 'UNVERIFIED', 'the cap no longer blocks its gate');
  const next = ok(work(dir, 'run', 'next', 'road', 'docs/roadmap/r.md'));
  assert.deepEqual(next.parked, [], 'no defect is held back');
  assert.equal(next.next, 'R1', 'the slice still runs');
});

test('a failed last round still parks the slice at the cap', () => {
  const dir = fixture(['--audit-cap', '1']);
  auditFailed(dir, 'api', 'leak');
  assert.equal(audit(dir, 'R1').allow, true, 'its first round is new work');
  assert.equal(audit(dir, 'R1').allow, true, 'the repeat spends its one round');
  ok(work(dir, 'verify-phase', 'api', '--', 'true'));
  ok(work(dir, 'event', 'api', 'build-done'));
  ok(work(dir, 'event', 'api', 'audit-fail', '1'));
  assert.equal(ok(work(dir, 'show', 'api')).audit.verdict, 'FAIL', 'the last allowed round failed');
  const refused = audit(dir, 'R1');
  assert.deepEqual([refused.allow, refused.reason], [false, 'SLICE_AUDIT_CAP']);
  const rec = show(dir);
  assert.equal(rec.gates.find((g) => g.id === 'R1').audit_refused, 1, 'the refusal is marked on the gate');
  assert.match(rec.audit_stop, /^slice R1: 1 rounds repeated an earlier Must, cap 1/);
  const parked = rec.slices.find((s) => s.id === 'R1');
  assert.deepEqual([parked.status, parked.needs], ['parked', 'decision']);
  assert.match(parked.reason, /last fix unreviewed$/);
});

test('a passing round clears the refusal marker an earlier refused round left', () => {
  const dir = fixture(['--audit-cap', '1']);
  auditFailed(dir, 'api', 'leak');
  assert.equal(audit(dir, 'R1').allow, true, 'its first round is new work');
  assert.equal(audit(dir, 'R1').allow, true, 'the repeat spends its one round');
  ok(work(dir, 'verify-phase', 'api', '--', 'true'));
  ok(work(dir, 'event', 'api', 'build-done'));
  assert.equal(audit(dir, 'R1').reason, 'SLICE_AUDIT_CAP', 'the extra round is refused and marked');
  let rec = show(dir);
  assert.equal(rec.gates.find((g) => g.id === 'R1').audit_refused, 1);
  assert.match(rec.audit_stop, /^slice R1: 1 rounds repeated an earlier Must, cap 1/);
  ok(work(dir, 'event', 'api', 'audit-pass'));
  const refused = audit(dir, 'R1');
  assert.deepEqual([refused.allow, refused.reason], [false, 'SLICE_AUDIT_CAP'], 'the refusal shape stays');
  rec = show(dir);
  assert.equal(rec.gates.find((g) => g.id === 'R1').audit_refused, undefined, 'the stale marker is cleared');
  assert.equal(rec.audit_stop, undefined, 'the stale stop is cleared');
  assert.notEqual(ok(work(dir, 'run', 'gate', 'road', 'R1')).reason, 'SLICE_AUDIT_CAP', 'the stale cap no longer blocks the gate');
});

test('a spent run total refuses every track and names the run total', () => {
  const dir = fixture(['--audit-cap', '1', '--audit-total-cap', '2', '--max-slices', '1']);
  auditFailed(dir, 'api', 'leak');
  audit(dir, 'R1');
  audit(dir, 'R1');
  const out = tracks(dir);
  assert.deepEqual(out.tracks, [], 'the run total has no round left');
  assert.deepEqual(out.refused.map((r) => [r.id, r.reason]), [['R1', 'SLICE_AUDIT_CAP'], ['R2', 'AUDIT_CAP']]);
  assert.match(out.refused[1].detail, /run total: 2 audit rounds, cap 2/);
});

test('the slice ships on the merged tree\'s fingerprint: ship-prepare takes that tree\'s', () => {
  const dir = fixture();
  const wt = tracks(dir).tracks[0].worktree;
  // The coordinator's own change, to a file the item's plan names, so a fingerprint taken from the
  // wrong tree shows.
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/other.js'), 'export const other = 1;\n');
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'do-it/road--R1');
  fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'src/api.js'), 'export const ok = 1;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-qm', 'road R1 (track)');
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--in', wt, '--', 'true'));
  git(dir, 'merge', '-q', '--no-ff', '-m', 'road R1 (track)', 'do-it/road--R1');
  const merged = ok(work(dir, 'run', 'verify', 'road', 'R1', '--merged', '.', '--', 'true')).gates.find((g) => g.id === 'R1');
  // The slice's own audit and ship facts are taken on the merged tree, before it ships.
  ok(work(dir, 'event', 'api', 'build-done'));
  ok(work(dir, 'event', 'api', 'audit-pass'));
  const prepared = ok(work(dir, 'event', 'api', 'ship-prepared'));
  assert.equal(prepared.ship.fingerprint, merged.merged_fingerprint, 'the slice\'s fingerprint is the merged tree\'s');
  assert.deepEqual(ok(work(dir, 'run', 'gate', 'road', 'R1')), { allow: true, reason: null, detail: null });
});

// The loop is text an agent follows, so its rules are pinned where they are written.
const section = (doc, title) => doc.slice(doc.indexOf(`## ${title}`)).split(/\n## /)[0];

test('the track text: the coordinator records every round, refuses a spent cap, and keeps the one record', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'skills/finish-it/TRACKS.md'), 'utf8');
  const rounds = section(doc, 'Rounds');
  assert.match(rounds, /work\.mjs run audit\s+<slug>\s+<slice>/, 'the round is recorded through the script');
  assert.match(rounds, /Before the\s+coordinator audits a track's slice/, 'the round is recorded before it is spent');
  assert.match(rounds, /A track never calls\s+`run audit` or `run start`/, 'a track records neither');
  assert.match(rounds, /SLICE_AUDIT_CAP/);
  assert.match(rounds, /AUDIT_CAP/);
  assert.match(rounds, /`refused`/, 'the dispatch refusal is named');
  assert.match(rounds, /is not `waiting`/, 'a spent cap is not a slice that waits for the next round');
  // The merged fingerprint is what the slice ships with.
  assert.match(doc, /taken\s+after the merge and before step 5 marks it shipped/);
  assert.match(doc, /`STALE_VERIFY`/);
  // A track keeps no record of its own, and a lane's is history.
  const record = section(doc, 'The record');
  assert.match(record, /`work\.mjs run show <slug>`/, 'the coordinator\'s record is read with run show');
  assert.match(record, /history\s+only/, 'a lane record is history only');
  assert.match(record, /never reads them/);
});

test('the audit is the coordinator\'s: verify the tree, record the round, prove it, then merge', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'skills/finish-it/TRACKS.md'), 'utf8');
  const audit = section(doc, 'The audit');
  assert.ok(audit, 'TRACKS.md has an ## The audit section');
  assert.match(audit, /A track builds and reports; it never audits/, 'the track is out of the audit');
  assert.match(audit, /subagent depth 1/, 'the reason a track cannot audit is named');
  assert.match(audit, /run audit <slug> <slice>/, 'the round is recorded before the audit starts');
  assert.match(audit, /--since <base>/, 'the audit reads the track tree since its base');
  assert.match(audit, /writes no state/, '--since writes nothing, so the coordinator writes the report');
  assert.match(audit, /`## Audit` in a lane S plan/, 'the lane S report goes in the plan');
  assert.match(audit, /audit-report\.md` for lane M/, 'the lane M report is its own file');
  assert.match(audit, /sources:/, 'the plan and its sources are the spec');
  assert.match(audit, /same `it-builder` session/, 'a Must goes back to the track that built it');
  assert.match(audit, /unverified axis is no pass/, 'an unverified axis never merges');
  assert.match(audit, /`build-done` then `audit-pass`/, 'the coordinator fires the item events');
  // The merge review is scoped to the merge; it no longer says the track proved the slice.
  const merge = section(doc, 'Merge, in contract order');
  assert.match(merge, /already audited the slice on its tree/, 'the merge review names the coordinator\'s audit');
  assert.doesNotMatch(merge, /already ran prove-it/, 'the track did not prove its slice');
  // A Must the track cannot fix parks, like a failed track.
  const failed = section(doc, 'A failed track');
  assert.match(failed, /a Must the same `it-builder`\s+session cannot fix/, 'a stuck Must parks the slice');
});

test('the docs agree a track builds and the coordinator audits: CONTEXT, ADR 0015 and ADR 0012', () => {
  const context = fs.readFileSync(path.join(ROOT, 'CONTEXT.md'), 'utf8');
  const track = context.slice(context.indexOf('**Track**'), context.indexOf('**Contract**'));
  assert.match(track, /builds one slice/, 'a track builds the slice');
  assert.match(track, /coordinator\s+audits it/, 'the coordinator audits it');
  assert.doesNotMatch(track, /builds and proves/, 'a track no longer proves its slice');
  const adr = fs.readFileSync(path.join(ROOT, 'docs/adr/0015-coordinator-audits-track-slices.md'), 'utf8');
  assert.match(adr, /^---\nstatus: proposed\n---/, 'the ADR starts proposed');
  for (const want of ['0012', '--since', 'it-builder', 'fresh', 'TRACKS.md']) assert.ok(adr.includes(want), `ADR 0015 names ${want}`);
  const prior = fs.readFileSync(path.join(ROOT, 'docs/adr/0012-coordinator-plus-tracks.md'), 'utf8');
  assert.match(prior, /Amended 2026-11-17/, 'ADR 0012 names the amendment');
  assert.match(prior, /0015-coordinator-audits-track-slices\.md/, 'the amendment points at 0015');
});

test('T255 and R22 name the coordinator\'s audit, not a track\'s prove', () => {
  const todo = fs.readFileSync(path.join(ROOT, 'docs/TODO.md'), 'utf8');
  const t255 = todo.split('\n').find((l) => l.startsWith('- [ ] T255'));
  assert.ok(t255, 'T255 is still open');
  assert.match(t255, /coordinator's `prove-it` of a track's slice/, 'the slot gap names the coordinator audit');
  assert.doesNotMatch(t255, /A track's `prove-it`/, 'a track no longer proves its slice');
  const road = fs.readFileSync(path.join(ROOT, 'docs/roadmap/todo-clearance-2026-11.md'), 'utf8');
  const r22 = road.split('\n').find((l) => l.startsWith('| R22 |'));
  assert.ok(r22, 'R22 is on the roadmap');
  assert.match(r22, /the coordinator's prove-it of a track's slice takes a check slot/, 'R22 delivers the slot for the audit');
  assert.match(r22, /The coordinator's audit of a track takes the slot/, 'its verify names the audit');
  assert.doesNotMatch(r22, /a track's prove-it takes a check slot/, 'the old wording is gone');
});
