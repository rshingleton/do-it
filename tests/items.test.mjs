import './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workItems } from '../skills/do-it/scripts/items.mjs';
import { writeItem } from '../skills/do-it/scripts/block.mjs';

const DATE = { date: '2026-10-20' };
const ok = (text = 'npm test') => () => ({ ok: true, text });

function setup(opts = {}) {
  const planningDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-items-')), 'docs/planning');
  return { planningDir, items: workItems({ planningDir, ...opts }) };
}

function building(items, id, lane, phases) {
  items.create(id, { lane, title: id });
  if (phases) items.set(id, 'phases', phases);
  items.fire(id, 'approve', DATE);
  items.fire(id, 'start', { head: 'abc', ...DATE });
}

test('items: create lays out the plan by lane and refuses bad ids and duplicates', () => {
  const { planningDir, items } = setup();
  assert.equal(items.create('fix-y', { lane: 's', title: 'Fix Y' }).path, path.join(planningDir, 'fix-y.md'));
  assert.equal(items.create('feat-x', { lane: 'M', title: 'Feature X' }).path, path.join(planningDir, 'feat-x/README.md'));
  assert.equal(items.get('feat-x').state.status, 'draft');
  assert.match(items.get('feat-x').body, /# Feature X/);
  assert.throws(() => items.create('fix-y', { lane: 's' }), /already has a plan/);
  assert.throws(() => items.create('../x', { lane: 's' }), /needs an id/);
  assert.throws(() => items.create('z', { lane: 'l' }), /lane s or/);
  assert.throws(() => items.get('nope'), /no plan for nope/);
  assert.deepEqual(items.list().map((i) => [i.id, i.lane]), [['feat-x', 'm'], ['fix-y', 's']]);
});

test('items: set takes only the settable keys; status changes go through fire', () => {
  const { items } = setup();
  items.create('x', { lane: 's', title: 'X' });
  assert.deepEqual(items.set('x', 'todo', 'T7').state.todo, ['T7']);
  assert.throws(() => items.set('x', 'status', 'shipping'), /go through event/);
  assert.throws(() => items.set('x', 'title'), /needs a value/);
  items.set('x', 'assumptions', ['a', 'b']);
  assert.throws(() => items.set('x', 'assumptions', ''), /pass \[\] to clear/);
  assert.throws(() => items.set('x', 'assumptions', null), /pass \[\] to clear/);
  assert.deepEqual(items.get('x').state.assumptions, ['a', 'b']);
  assert.deepEqual(items.set('x', 'assumptions', []).state.assumptions, []);
  assert.throws(() => items.fire('x', 'start', { head: 'a' }), /allowed: approve/);
  assert.equal(items.fire('x', 'approve', DATE).state.status, 'planned');
});

test('items: set phases keeps recorded progress and refuses to set it', () => {
  const { items } = setup();
  building(items, 'ph', 'm', [{ n: 1, title: 'One' }]);
  items.verifyPhase('ph', 1, ok('npm test'), DATE);
  const r = items.set('ph', 'phases', [{ n: 1, title: 'One' }, { n: 2, title: 'Two', blocked_by: [1] }]);
  assert.deepEqual(r.state.phases.map((x) => [x.n, x.status, x.verified]), [[1, 'done', 'npm test: pass'], [2, 'ready', null]]);
  assert.throws(() => items.set('ph', 'phases', [{ n: 2, title: 'Two', status: 'done' }]), /recorded by events/);
  assert.throws(() => items.set('ph', 'phases', 'nope'), /JSON list/);
});

test('items: raising lane S to M moves the plan into a directory; lowering is refused', () => {
  const { planningDir, items } = setup();
  items.create('grow', { lane: 's', title: 'Grow' });
  const r = items.set('grow', 'lane', 'M');
  assert.equal(r.path, path.join(planningDir, 'grow/README.md'));
  assert.equal(r.state.lane, 'm');
  assert.equal('verified' in r.state, false);
  assert.equal(fs.existsSync(path.join(planningDir, 'grow.md')), false);
  assert.match(items.get('grow').body, /# Grow/);
  assert.throws(() => items.set('grow', 'lane', 's'), /never lowered/);
  assert.throws(() => items.set('grow', 'lane', 'l'), /lane is s or m/);
});

test('items: a failed lane move leaves the lane S plan in place', () => {
  const { planningDir, items } = setup({
    write: (item) => {
      if (item.path.endsWith('README.md')) throw new Error('ENOSPC');
      writeItem(item);
    },
  });
  items.create('grow', { lane: 's', title: 'Grow' });
  assert.throws(() => items.set('grow', 'lane', 'm'), /ENOSPC/);
  assert.equal(items.get('grow').path, path.join(planningDir, 'grow.md'));
  assert.equal(items.get('grow').state.lane, 's');
});

test('items: a plan left in both places by an interrupted move reads from the directory', () => {
  const { planningDir, items } = setup();
  items.create('grow', { lane: 's', title: 'Grow' });
  const old = fs.readFileSync(path.join(planningDir, 'grow.md'), 'utf8');
  items.set('grow', 'lane', 'm');
  fs.writeFileSync(path.join(planningDir, 'grow.md'), old);
  assert.equal(items.get('grow').state.lane, 'm');
});

test('items: verifyPhase records only a passing run, and needs a phase number in lane M', () => {
  const { items } = setup();
  building(items, 's1', 's');
  assert.throws(() => items.verifyPhase('s1', undefined, () => ({ ok: false, why: 'npm test exited 3' })), /npm test exited 3; nothing recorded/);
  assert.equal(items.get('s1').state.verified, null);
  assert.equal(items.verifyPhase('s1', undefined, ok('npm test'), DATE).state.verified, 'npm test: pass');

  building(items, 'm1', 'm', [{ n: 1, title: 'One' }]);
  let ran = false;
  assert.throws(() => items.verifyPhase('m1', undefined, () => { ran = true; return { ok: true, text: 'x' }; }), /needs a phase number/);
  assert.equal(ran, false, 'nothing runs before the arguments are checked');
});

test('items: verifyPhase refuses an illegal record before running any check', () => {
  const { items } = setup();
  let ran = 0;
  const run = () => { ran++; return { ok: true, text: 'npm test' }; };
  items.create('early', { lane: 's', title: 'Early' });
  assert.throws(() => items.verifyPhase('early', undefined, run), /not allowed from draft/);
  building(items, 'm', 'm', [{ n: 1, title: 'One' }, { n: 2, title: 'Two', blocked_by: [1] }]);
  assert.throws(() => items.verifyPhase('m', 2, run), /blocked by phase\(s\) 1/);
  assert.throws(() => items.verifyPhase('m', 3, run), /no phase 3/);
  assert.equal(ran, 0, 'no check ran for a move that could not be recorded');
});

test('items: a phase is recorded only through verifyPhase; fire refuses phase-done (T55)', () => {
  const { planningDir, items } = setup();
  building(items, 'm', 'm', [{ n: 1, title: 'One' }]);
  const before = fs.readFileSync(path.join(planningDir, 'm/README.md'), 'utf8');
  assert.throws(() => items.fire('m', 'phase-done', { n: 1, verified: 'trust me' }), /recorded by verify-phase/);
  assert.equal(fs.readFileSync(path.join(planningDir, 'm/README.md'), 'utf8'), before);
  // No refusal offers what fire refuses.
  for (const event of ['approve', 'bogus']) {
    assert.throws(
      () => items.fire('m', event, DATE),
      (e) => /not allowed from building; allowed: start, block, unblock, build-done, replan$/.test(e.message) && !e.message.includes('phase-done'),
    );
  }
});

test('items: verifyPhase re-reads the plan after the checks, so a change made meanwhile survives (T53)', () => {
  const { items } = setup();
  building(items, 'm', 'm', [{ n: 1, title: 'One' }, { n: 2, title: 'Two' }]);
  const r = items.verifyPhase('m', 1, () => {
    items.fire('m', 'block', { n: 2, why: 'needs a key', ...DATE });
    return { ok: true, text: 'npm test' };
  }, DATE);
  assert.deepEqual(r.state.phases.map((p) => p.status), ['done', 'blocked']);
  assert.deepEqual(items.get('m').state.phases.map((p) => p.status), ['done', 'blocked']);
});

test('items: close only from shipping, removing the file or the lane M directory', () => {
  const { planningDir, items } = setup();
  building(items, 'feat', 'm', [{ n: 1, title: 'One' }]);
  fs.writeFileSync(path.join(planningDir, 'feat/phase-1.md'), '# Phase 1\n');
  items.set('feat', 'todo', ['T7']);
  assert.throws(() => items.close('feat'), /needs status shipping; feat is building/);
  items.verifyPhase('feat', 1, ok(), DATE);
  for (const [e, a] of [['build-done'], ['audit-pass', { fingerprint: 'f' }]]) items.fire('feat', e, { ...a, ...DATE });
  const closed = items.close('feat');
  assert.deepEqual(closed.state.todo, ['T7']);
  assert.equal(fs.existsSync(path.join(planningDir, 'feat')), false);
  assert.equal(fs.existsSync(planningDir), true, 'the planning directory itself stays');

  building(items, 'one', 's');
  items.verifyPhase('one', undefined, ok(), DATE);
  for (const [e, a] of [['build-done'], ['audit-pass', { fingerprint: 'f' }]]) items.fire('one', e, { ...a, ...DATE });
  items.close('one');
  assert.deepEqual(fs.readdirSync(planningDir), []);
});
