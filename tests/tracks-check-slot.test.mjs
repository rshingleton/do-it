// Phase 2 of tracks-mode, the check slot: one run's checks run at a time. Two tracks running the
// same heavy suite queue for the slot instead of fighting for CPU, a lock its holder left behind is
// taken over once it ages past the stale timeout, and the queue time is not charged to the slice's
// cap.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gate as gateRule } from '../skills/do-it/scripts/gate.mjs';
import { lockPath } from '../skills/do-it/scripts/check-slot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A path as a bash check spells it: forward slashes.
const sh = (p) => p.replaceAll('\\', '/');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

const env = (dir) => ({ ...process.env, XDG_CONFIG_HOME: dir });
function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: env(dir) });
  return { status: r.status, out: JSON.parse(r.stdout) };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};

// A repo with a started lane S item "feat" and a run record "road" whose slice R1 is that item.
function fixture(runFlags = []) {
  const dir = tmpDir('do-it-slot-');
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
  return dir;
}

const lockOf = (dir) => lockPath(path.join(dir, 'docs/planning'), 'road');
const entry = (dir) => ok(work(dir, 'run', 'show', 'road')).gates.find((g) => g.id === 'R1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `run verify` with its stderr kept: the checks and a stale-lock takeover both write there.
function verifyAt(dir, cmd) {
  const r = spawnSync('node', [WORK, 'run', 'verify', 'road', 'R1', '--', cmd], { cwd: dir, encoding: 'utf8', env: env(dir) });
  return { status: r.status, out: JSON.parse(r.stdout), err: r.stderr };
}

function verifyAsync(dir, cmd) {
  return new Promise((resolve) => {
    const p = spawn('node', [WORK, 'run', 'verify', 'road', 'R1', '--', cmd], { cwd: dir, env: env(dir) });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', () => {});
    p.on('close', (status) => resolve({ status, out: JSON.parse(out) }));
  });
}

// The same check after a merge: it queues on the same slot.
function mergedAsync(dir, cmd) {
  return new Promise((resolve) => {
    const p = spawn('node', [WORK, 'run', 'verify', 'road', 'R1', '--merged', '.', '--', cmd], { cwd: dir, env: env(dir) });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', () => {});
    p.on('close', (status) => resolve({ status, out: JSON.parse(out) }));
  });
}

async function waitFor(what, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (what()) return;
    await sleep(25);
  }
  throw new Error('timed out waiting for the first check to start');
}

test('two checks on one run take the slot in turn, and the second records the time it queued', async () => {
  const dir = fixture();
  const log = path.join(dir, 'check.log');
  // One second of visible overlap if the slot did not hold: both checks start, then both end.
  const cmd = `echo start >> ${sh(log)}; sleep 1; echo end >> ${sh(log)}`;
  const first = verifyAsync(dir, cmd);
  await waitFor(() => fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('start'));
  // A merged check queues on the same slot, and its queue time is recorded too.
  const second = mergedAsync(dir, cmd);
  const done = await Promise.all([first, second]);
  assert.deepEqual(done.map((r) => r.status), [0, 0], JSON.stringify(done.map((r) => r.out)));
  assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['start', 'end', 'start', 'end'], 'the merged check waited for the first to finish');
  assert.ok(entry(dir).waited_ms >= 300, `the queue time is on the slice: ${entry(dir).waited_ms}`);
  // The wait is inside the span and taken off by waited_ms once: last_seen is the check's end,
  // not the moment the command was typed.
  const e = entry(dir);
  const span = Date.parse(e.last_seen) - Date.parse(e.active_since ?? e.started);
  assert.ok(span >= e.waited_ms, `the queue wait is inside the span it is taken off: span ${span}, waited ${e.waited_ms}`);
  assert.equal(fs.existsSync(lockOf(dir)), false, 'the slot is released');
});

test('a lock older than the stale timeout is taken over, and the takeover is said', () => {
  const dir = fixture();
  const lock = lockOf(dir);
  fs.writeFileSync(lock, '999999\n');
  const past = new Date(Date.now() - 31 * 60000);
  fs.utimesSync(lock, past, past);
  const r = verifyAt(dir, 'true');
  assert.equal(r.status, 0, r.err);
  assert.match(r.err, /check lock older than 30 min: taken over/);
  assert.equal(fs.existsSync(lock), false, 'the takeover holds and releases its own lock');
  assert.ok(entry(dir).verified_fingerprint, 'the check still ran and counted');
});

test('a failing check releases the slot, so the next check is not made to wait', () => {
  const dir = fixture();
  const failed = verifyAt(dir, 'false');
  assert.equal(failed.status, 1);
  assert.equal(fs.existsSync(lockOf(dir)), false, 'a throw on the way out still releases the slot');
  assert.equal(verifyAt(dir, 'true').status, 0);
});

test('queue time does not spend the cap: the gate counts the open span less the wait', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const at = (min) => new Date(start + min * 60000).toISOString();
  const now = start + 45 * 60000;
  const rec = (waited) => ({
    slices: [],
    audit_cap: 3,
    slice_cap_min: 30,
    gates: [{ id: 'R1', active_since: at(0), verified_fingerprint: 'fp', ...(waited ? { waited_ms: waited } : {}) }],
  });
  assert.equal(gateRule(rec(0), 'R1', { current: 'fp', now }).reason, 'SLICE_CAP', '45 min of work is past the cap');
  assert.deepEqual(gateRule(rec(35 * 60000), 'R1', { current: 'fp', now }), { allow: true, reason: null, detail: null }, '35 of the 45 min queued, so 10 min of work');
  assert.equal(gateRule(rec(5 * 60000), 'R1', { current: 'fp', now }).reason, 'SLICE_CAP', '40 min of work is still past the cap');
});

test('a park that banks no span drops the queue credit with it', async () => {
  const dir = fixture(['--slice-cap-min', '30']);
  const log = path.join(dir, 'check.log');
  const cmd = `echo start >> ${sh(log)}; sleep 1`;
  const first = verifyAsync(dir, cmd);
  await waitFor(() => fs.existsSync(log));
  const second = mergedAsync(dir, cmd);
  const done = await Promise.all([first, second]);
  assert.deepEqual(done.map((r) => r.status), [0, 0], JSON.stringify(done.map((r) => r.out)));
  assert.ok(entry(dir).waited_ms > 0, 'the merged check queued for the slot');
  // A park stamped before the span opened banks nothing, so the queue credit must go with it.
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'parked', '--reason', 'x', '--needs', 'user', '--at', '2000-01-01T00:00:00.000Z'));
  const g = entry(dir);
  assert.equal(g.active_ms, 0);
  assert.equal(g.waited_ms, undefined, 'no credit outlives the span it was recorded with');
});
