// backlog-cleanup-2026-11 was superseded before it finished: its file is gone and
// todo-clearance-2026-11 carries the items it never shipped. The ids below are pinned
// as literals from the slices that roadmap named, so losing one from its new home, or
// letting the history read it as a finished roadmap, turns a test red.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const cites = (text, id) => new RegExp(`\\b${id}\\b`).test(text);

const HISTORY = 'docs/reference/roadmap-history.md';
const SUCCESSOR = 'docs/roadmap/todo-clearance-2026-11.md';

// The six source files the history records, oldest first.
const REMOVED = [
  'backlog-hardening.md',
  'debt-simplification.md',
  'open-backlog-2026-10.md',
  'run-lane-hardening.md',
  'should-backlog-2026-10.md',
  'backlog-cleanup-2026-11.md',
];

// R1, the only slice that shipped.
const SHIPPED = ['T208', 'T211', 'T216', 'T223', 'T238'];

// R2 to R16, in the order those slices named them.
const CARRIED = [
  'T200', 'T201', 'T197',
  'T215',
  'T235',
  'T202', 'T213',
  'T191', 'T222',
  'T193', 'T185',
  'T210', 'T190',
  'T192', 'T217', 'T218',
  'T164', 'T167',
  'T220', 'T221',
  'T214', 'T219', 'T242',
  'T212',
  'T237', 'T239', 'T244',
  'T240', 'T241', 'T243',
  'T234',
];

const PROMOTED = [...SHIPPED, ...CARRIED];

// The history's table rows, keyed by the file they removed.
function rows(history) {
  const lines = history.split('\n').filter((line) => line.startsWith('| '));
  return lines
    .filter((line) => !/^\|\s*-+/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells[0] !== 'Roadmap');
}

// One `## ` section, heading text and body.
function section(history, heading) {
  const found = history
    .split(/^## /m)
    .find((part) => part.startsWith(`${heading}\n`));
  assert.ok(found, `the history has a "${heading}" section`);
  return found;
}

test('the history names the six removed roadmaps and only backlog-cleanup reads superseded', () => {
  const history = read(HISTORY);
  const table = rows(history);
  assert.deepEqual(
    table.map((cells) => cells[1]).sort(),
    [...REMOVED].sort(),
    'one table row per removed file',
  );
  assert.equal(
    (history.match(/^Source file removed:/gm) ?? []).length,
    REMOVED.length,
    'each section names its source file',
  );
  const superseded = table.filter((cells) => /superseded/.test(cells[3]));
  assert.deepEqual(
    superseded.map((cells) => cells[1]),
    ['backlog-cleanup-2026-11.md'],
    'the superseded roadmap is the only row that did not complete',
  );
  assert.equal(superseded[0][4], '1', 'only R1 shipped under it');
  assert.match(superseded[0][3], /superseded 2026-11-16/, 'the row dates the supersession');
});

test('the backlog cleanup section says what shipped and where the rest went', () => {
  const body = section(read(HISTORY), 'Backlog cleanup 2026-11');
  const shipped = body.split('### Shipped')[1]?.split('### ')[0] ?? '';
  const bullet = shipped.split('\n').find((line) => line.startsWith('- ') && line.includes('r1-text-truth'));
  assert.ok(bullet, 'a Shipped bullet names R1 as r1-text-truth');
  const missing = SHIPPED.filter((id) => !cites(bullet, id));
  assert.deepEqual(missing, [], 'that bullet names the five ids R1 carried');
  assert.match(flat(body), /R2 to R16/, 'the open slices are named');
  assert.match(flat(body), /todo-clearance-2026-11/, 'their new roadmap is named');
});

test('every promoted id still has one home: the successor roadmap or the shipped line', () => {
  const history = read(HISTORY);
  const successor = read(SUCCESSOR);
  const shipped = section(history, 'Backlog cleanup 2026-11').split('### Shipped')[1]?.split('### ')[0] ?? '';
  const homeless = PROMOTED.filter((id) => !cites(successor, id) && !cites(shipped, id));
  assert.deepEqual(homeless, [], 'no promoted id lost its home');
  const lost = CARRIED.filter((id) => !cites(successor, id));
  assert.deepEqual(lost, [], 'the successor cites every carried id');
  assert.equal(new Set(PROMOTED).size, PROMOTED.length, 'the pinned list holds no duplicate');
  assert.equal(PROMOTED.length, 36, 'five shipped ids and the 31 R2 to R16 carried');
});
