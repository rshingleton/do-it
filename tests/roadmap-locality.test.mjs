// A roadmap slice may carry a `Files` hint: the paths it expects to touch, written from scouting.
// The hint orders a run's batch (a disjoint slice is preferred and a collider backfills a spare
// slot) and nothing else moves: a single `next`, the queue's priority and the plan's `## Files`
// contract stay as they are.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRoadmap, roadmapSlices } from '../skills/do-it/scripts/roadmap.mjs';
import { nextSlice } from '../skills/do-it/scripts/run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

// A milestone table, with or without the Files column.
const table = (rows, files = true) =>
  [
    '### M1',
    '',
    files ? '| Slice | Kind | Delivers | Files | Blocked by | Status |' : '| Slice | Kind | Delivers | Blocked by | Status |',
    files ? '|---|---|---|---|---|---|' : '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');

test('parseRoadmap: a Files cell reads present, comma separated and backticked, empty or absent as no hint', () => {
  const { slices } = parseRoadmap(
    table([
      '| R1 | build | A | `src/a.js`, `src/b.js` | none | |',
      '| R2 | build | B |  src/c.js ,  src/d.js  | none | |',
      '| R3 | build | C | | none | |',
    ]),
  );
  assert.deepEqual(
    slices.map((s) => [s.id, s.files]),
    [
      ['R1', ['src/a.js', 'src/b.js']],
      ['R2', ['src/c.js', 'src/d.js']],
      ['R3', []],
    ],
  );
  const bare = parseRoadmap(table(['| R1 | build | A | none | |'], false));
  assert.deepEqual(bare.slices[0].files, [], 'a roadmap with no Files column reads as no hint');
});

test('roadmapSlices: each slice carries its hint as files', () => {
  const dir = tmpDir('do-it-locality-');
  const planningDir = path.join(dir, 'docs/planning');
  fs.mkdirSync(planningDir, { recursive: true });
  const file = path.join(dir, 'r.md');
  fs.writeFileSync(
    file,
    table([
      '| R1 | build | A | src/a.js | none | |',
      '| R2 | build | B | src/a.js, src/b.js | none | |',
      '| R3 | build | C | | none | |',
    ]),
  );
  const out = roadmapSlices(file, { root: dir, planningDir, tracked: () => false });
  assert.deepEqual(
    out.slices.map((s) => [s.id, s.files]),
    [
      ['R1', ['src/a.js']],
      ['R2', ['src/a.js', 'src/b.js']],
      ['R3', []],
    ],
  );
});

// A slice as roadmapSlices hands it over: its state, blocks and hint.
const slice = (id, files, state = 'ready') => ({ id, blocked_by: [], state, files });
const road = (slices, ready = slices.filter((s) => s.state === 'ready').map((s) => s.id)) => ({ slices, ready });
const rec = { max_slices: null, slices: [] };

test('run next --batch: a later slice sharing no file is preferred to a colliding one', () => {
  const r = road([slice('R1', ['src/a.js']), slice('R2', ['src/a.js', 'src/b.js']), slice('R3', ['src/c.js'])]);
  assert.deepEqual(nextSlice(r, rec, { batch: 2 }).next, ['R1', 'R3'], 'R2 collides with R1, so R3 takes the slot');
  assert.equal(nextSlice(r, rec).next, 'R1', 'a single next does not read the hint');
});

test('run next --batch: a collider waits a round when a disjoint slice can take its slot', () => {
  const r = road([slice('R1', ['a.js']), slice('R2', ['a.js']), slice('R3', ['b.js'])]);
  const out = nextSlice(r, rec, { batch: 2 }).next;
  assert.deepEqual(out, ['R1', 'R3']);
  assert.ok(!out.includes('R2'), 'R2 keeps its place in the queue and waits for the next round');
});

test('run next --batch: a set-aside collider backfills a slot the queue left open', () => {
  const r = road([slice('R1', ['src/a.js']), slice('R2', ['src/a.js'])]);
  assert.deepEqual(nextSlice(r, rec, { batch: 2 }).next, ['R1', 'R2'], 'the batch is still two');
});

test('run next --batch: the batch keeps today\'s size, never repeats an id, and backfills in queue order', () => {
  const r = road([slice('R1', ['a.js']), slice('R2', ['a.js']), slice('R3', ['b.js']), slice('R4', ['b.js'])]);
  const widest = nextSlice(r, rec, { batch: 9 }).next;
  assert.deepEqual(widest, ['R1', 'R3', 'R2', 'R4'], 'the two colliders backfill behind the disjoint pair');
  assert.equal(widest.length, 4, 'min(batch, the queue)');
  assert.equal(new Set(widest).size, widest.length, 'no id repeats');
  assert.equal(nextSlice(r, rec, { batch: 3 }).next.length, 3);
});

test('run next --batch: the in-flight lead is picked first, before any hint is read', () => {
  const flying = slice('R9', ['src/a.js'], 'in flight');
  const r = road([flying, slice('R1', ['src/a.js']), slice('R2', ['src/b.js'])]);
  assert.deepEqual(nextSlice(r, rec, { batch: 2 }).next, ['R9', 'R2'], 'R1 collides with the lead, R9 keeps its place');
  assert.equal(nextSlice(r, rec).next, 'R9', 'the lead resumes alone without a batch');
});

test('run next --batch: a roadmap with no hint returns exactly today\'s ids', () => {
  const bare = {
    slices: ['R1', 'R2', 'R3'].map((id) => ({ id, blocked_by: [], state: 'ready' })),
    ready: ['R3', 'R1', 'R2'],
  };
  assert.deepEqual(nextSlice(bare, rec, { batch: 2 }).next, ['R3', 'R1']);
  assert.deepEqual(nextSlice(bare, rec, { batch: 9 }).next, ['R3', 'R1', 'R2']);
  assert.equal(nextSlice(bare, rec).next, 'R3');
});

test('the roadmap docs state the hint, the batch preference and the plan contract', () => {
  const format = read('skills/roadmap-it/FORMAT.md');
  assert.match(
    format,
    /^\| Slice \| Kind \| Delivers \| Covers \| Files \| Blocked by \| Verify \| Risk \| Status \| Ref \|$/m,
    'the example table has a Files column between Covers and Blocked by',
  );
  assert.match(format, /^\|-------\|------\|----------\|--------\|-------\|------------\|--------\|------\|--------\|-----\|$/m, 'its separator row');
  const filesField = flat(format).match(/\*\*Files:\*\*[\s\S]*?(?=\*\*Blocked by:\*\*)/);
  assert.ok(filesField, 'the format states a **Files:** field before **Blocked by:**');
  const field = filesField[0];
  assert.match(field, /optional/, 'the cell is optional');
  assert.match(field, /comma separated/, 'the paths are comma separated');
  assert.match(field, /scouting/, 'they come from scouting');
  assert.match(field, /hint/, 'it is a hint');
  assert.match(field, /`## Files`/, 'the plan section stays the contract');

  const slicing = flat(read('skills/roadmap-it/SLICING.md'));
  assert.match(slicing, /states a `Files` hint naming them, comma separated/, 'a slice states a hint when its files are known');
  assert.match(slicing, /batch prefers a slice that shares no file with one already picked/, 'a batch prefers a disjoint slice');
  assert.match(slicing, /leaving a colliding slice for the next round/, 'a collider waits a round');

  const skill = read('skills/roadmap-it/SKILL.md');
  assert.match(flat(skill), /a file hint lets a batch prefer disjoint work/, 'the ordering sentence states the purpose');

  const stateLine = read('skills/do-it/STATE.md').split(/\r?\n/).find((line) => line.includes('`--batch n`'));
  assert.ok(stateLine, 'STATE.md documents --batch');
  assert.match(stateLine, /`files` hint/, 'the --batch contract states the hint preference, not a plain prefix');
});

test('every skills/*/SKILL.md stays within the 100-line budget', () => {
  const dir = path.join(ROOT, 'skills');
  const skills = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name);
  assert.ok(skills.length > 0, 'the scan found skills');
  const over = skills
    .map((name) => [name, read(`skills/${name}/SKILL.md`).replace(/\n$/, '').split('\n').length])
    .filter(([, lines]) => lines > 100);
  assert.deepEqual(over, [], 'a SKILL.md over budget moves its detail into a sibling file');
});
