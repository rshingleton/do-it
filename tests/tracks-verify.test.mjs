// Phase 1 of tracks-mode: the tree a verify ran in is the tree its record describes. A track
// verifies in its own worktree, the coordinator merges, and the suite on the merged tree is a
// gate fact (a field on the slice's gate entry), never a second phase record.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
// A path as a bash check spells it: forward slashes.
const sh = (p) => p.replaceAll('\\', '/');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
// A blob id from git itself, never from dirtyHashes: the expected value is independent of the code.
const blob = (dir, text) => execFileSync('git', ['hash-object', '--stdin'], { cwd: dir, input: text, encoding: 'utf8' }).trim();

function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { status: r.status, out: JSON.parse(r.stdout) };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};

// A coordinator checkout and a track's worktree beside it, a started lane S item "feat" and a
// run "road" whose slice R1 is that item. The track changes a.js; the coordinator changes b.js,
// so a fingerprint taken from the wrong tree shows.
function trackFixture() {
  const base = tmpDir('do-it-track-');
  const dir = path.join(base, 'coord');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'a.js'), 'one\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  ok(work(dir, 'new', 'feat', '--lane', 's', '--title', 'Feat'));
  ok(work(dir, 'event', 'feat', 'approve'));
  ok(work(dir, 'event', 'feat', 'start'));
  ok(work(dir, 'run', 'new', 'road'));
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'feat'));
  const wt = path.join(base, 'track');
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'track/R1');
  fs.writeFileSync(path.join(wt, 'a.js'), 'two\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'coord\n');
  return { dir, wt };
}

// The track commits its work after its verify; a commit never moves the fingerprint of its change.
const commitTrack = (wt) => git(wt, 'commit', '-qam', 'the track builds R1');

const verify = (dir, at, ...extra) => ok(work(dir, 'run', 'verify', 'road', 'R1', '--in', at, ...extra, '--', 'true'));
const gate = (dir) => ok(work(dir, 'run', 'gate', 'road', 'R1'));
const entry = (dir) => ok(work(dir, 'run', 'show', 'road')).gates.find((g) => g.id === 'R1');

test('a verify in a track worktree records that tree: its root, its file hash and its fingerprint', () => {
  const { dir, wt } = trackFixture();
  const track = verify(dir, wt, '--paths', 'a.js').gates.find((g) => g.id === 'R1');
  assert.equal(track.verified_root, sh(path.relative(dir, wt)), 'the root is the worktree, from the coordinator');
  assert.equal(track.verified_files['a.js'], `644:${blob(wt, 'two\n')}`, 'the file hash is the track\'s a.js');
  // The coordinator's own checkout holds a different edit, so a fingerprint taken here differs.
  const here = verify(dir, dir, '--paths', 'b.js').gates.find((g) => g.id === 'R1');
  assert.equal(here.verified_root, '.', 'a verify at the coordinator root records that root');
  assert.equal(here.verified_files['b.js'], `644:${blob(dir, 'coord\n')}`);
  assert.notEqual(here.verified_fingerprint, track.verified_fingerprint);
});

test('the gate re-fingerprints the recorded root: the other checkout\'s edit is no change, the track\'s own edit is STALE_VERIFY', () => {
  const { dir, wt } = trackFixture();
  verify(dir, wt, '--paths', 'a.js');
  commitTrack(wt);
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge R1', 'track/R1');
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--merged', dir, '--', 'true'));
  // The coordinator's b.js is dirty and the track never touched it: the verify still matches.
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null });
  fs.writeFileSync(path.join(wt, 'a.js'), 'three\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY', 'the track moved after its verify');
});

test('the merged suite is a gate fact: no ship from a worktree without it, and a merged edit is STALE_VERIFY', () => {
  const { dir, wt } = trackFixture();
  verify(dir, wt, '--paths', 'a.js');
  const unshipped = gate(dir);
  assert.deepEqual([unshipped.allow, unshipped.reason], [false, 'UNVERIFIED']);
  assert.match(unshipped.detail, /merged/, 'the refusal names the missing merged check');
  commitTrack(wt);
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge R1', 'track/R1');
  const before = ok(work(dir, 'show', 'feat', '--brief'));
  const merged = ok(work(dir, 'run', 'verify', 'road', 'R1', '--merged', dir, '--', 'true')).gates.find((g) => g.id === 'R1');
  assert.ok(merged.merged_fingerprint, 'the merged tree\'s fingerprint is recorded');
  assert.deepEqual(ok(work(dir, 'show', 'feat', '--brief')), before, 'the merged check records no phase and no status');
  assert.deepEqual(gate(dir), { allow: true, reason: null, detail: null });
  // A new verify of the track's own tree drops the merged fact: the merge no longer covers it.
  verify(dir, wt, '--paths', 'a.js');
  assert.equal(gate(dir).reason, 'UNVERIFIED', 'the merged check is stale after another verify');
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--merged', dir, '--', 'true'));
  assert.equal(gate(dir).allow, true);
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'shipped'));
  // A failed merged check leaves the recorded fact alone.
  const failed = work(dir, 'run', 'verify', 'road', 'R1', '--merged', dir, '--', 'false');
  assert.equal(failed.status, 1);
  assert.equal(entry(dir).merged_fingerprint, merged.merged_fingerprint);
  // A file that moved in the merged tree after its check is caught here, not at the audit.
  fs.writeFileSync(path.join(dir, 'a.js'), 'three\n');
  assert.equal(gate(dir).reason, 'STALE_VERIFY');
});

test('prove-it names --since as the track path: read from the worktree, no plan read, no state written', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'skills/prove-it/SKILL.md'), 'utf8');
  const pin = doc.slice(doc.indexOf('## 1.'), doc.indexOf('## 2.'));
  assert.match(pin, /`--since <ref>`: a track's path/, 'the mode is named as the track path');
  assert.match(pin, /worktree/, 'the review runs from the track\'s worktree');
  assert.match(pin, /no plan read and no state written/, 'it reads no plan and writes no state');
});
