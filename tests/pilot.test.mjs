import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mark, parseLog, report, summarize } from '../scripts/pilot.mjs';

const line = (at, arm, slice, step, event) => `${at} | ${arm} | ${slice} | ${step} | ${event} | -`;

const SAMPLE = [
  line('2026-11-15T09:00:00Z', 'serial', 'R3', 'scope', 'start'),
  line('2026-11-15T09:01:00Z', 'serial', 'R3', 'scope', 'end'),
  line('2026-11-15T09:01:00Z', 'serial', 'R3', 'build', 'start'),
  line('2026-11-15T09:03:00Z', 'serial', 'R3', 'build', 'end'),
  line('2026-11-15T09:03:00Z', 'serial', 'R3', 'prove', 'start'),
  line('2026-11-15T09:04:00Z', 'serial', 'R3', 'prove', 'end'),
  line('2026-11-15T09:04:00Z', 'serial', 'R3', 'ship', 'start'),
  line('2026-11-15T09:05:00Z', 'serial', 'R3', 'ship', 'end'),
].join('\n');

test('parseLog keeps good lines and names a broken one', () => {
  const { entries, skipped } = parseLog(`${SAMPLE}\nnot a log line\n`);
  assert.equal(entries.length, 8);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].why, /fewer than five fields/);
});

test('summarize computes the shares and the 2-track bounds', () => {
  const [s] = summarize(parseLog(SAMPLE).entries);
  assert.equal(s.total, 300);
  assert.equal(s.steps.build, 120);
  assert.equal(s.steps.prove, 60);
  assert.equal(s.build_share, 0.4);
  assert.equal(s.parallel_share, 0.6);
  assert.equal(s.bound_build, 1.25);
  assert.equal(s.bound_both, 1.43);
  assert.deepEqual(s.problems, []);
});

test('an unclosed start is named and counts no duration', () => {
  const text = line('2026-11-15T09:00:00Z', 'serial', 'R4', 'scope', 'start');
  const [s] = summarize(parseLog(text).entries);
  assert.equal(s.steps.scope, 0);
  assert.match(s.problems.join(), /start without an end/);
});

test('mark writes a line the report reads back', () => {
  const dir = tmpDir('do-it-pilot-');
  const log = path.join(dir, 'phase0.log');
  const now = new Date('2026-11-15T09:00:00Z');
  mark(log, { arm: 'serial', slice: 'R3', step: 'scope', event: 'start', note: 'first' }, { now });
  const { entries, skipped } = parseLog(fs.readFileSync(log, 'utf8'));
  assert.equal(skipped.length, 0);
  assert.equal(entries[0].at, now.toISOString());
  assert.equal(entries[0].note, 'first');
  assert.match(report(summarize(entries)), /serial/);
});

test('mark refuses an unknown arm or event', () => {
  const log = path.join(tmpDir('do-it-pilot-'), 'phase0.log');
  assert.throws(() => mark(log, { arm: 'pair', slice: 'R3', step: 'scope', event: 'start' }), /arm must be/);
  assert.throws(() => mark(log, { arm: 'serial', slice: 'R3', step: 'scope', event: 'done' }), /event must be/);
});
