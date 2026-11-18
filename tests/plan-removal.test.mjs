import { read, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');

const flat = (s) => s.replace(/\s+/g, ' ');

function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { status: r.status, out: JSON.parse(r.stdout) };
}

// A repo with a lane M item at status shipping and a second plan file next to its README.
function shippingRepo(id) {
  const dir = tmpDir('do-it-plan-removal-');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  work(dir, 'new', id, '--lane', 'm', '--title', 'Item');
  fs.writeFileSync(path.join(dir, 'docs/planning', id, 'phase-1.md'), '# Phase 1\n');
  work(dir, 'set', id, 'phases', '[{"n":1,"title":"One"}]');
  for (const e of [['approve'], ['start']]) work(dir, 'event', id, ...e);
  const v = work(dir, 'verify-phase', id, '1', '--', 'node -e "process.exit(0)"');
  assert.equal(v.status, 0, JSON.stringify(v.out));
  for (const e of [['build-done'], ['audit-pass', 'fp1']]) work(dir, 'event', id, ...e);
  assert.equal(work(dir, 'show', id).out.status, 'shipping');
  return dir;
}

test('work.mjs close: tracked lists the plan paths git tracks, before the delete', () => {
  const dir = shippingRepo('feat-t');
  execFileSync('git', ['add', 'docs/planning'], { cwd: dir });
  const r = work(dir, 'close', 'feat-t');
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.deepEqual([...r.out.tracked].sort(), ['docs/planning/feat-t/README.md', 'docs/planning/feat-t/phase-1.md']);
  assert.equal(fs.existsSync(path.join(dir, 'docs/planning/feat-t')), false);
});

test('work.mjs close: an untracked plan returns tracked: []', () => {
  const dir = shippingRepo('feat-u');
  const r = work(dir, 'close', 'feat-u');
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.tracked, []);
});

test('ship-it: every flow names plan removal and the history entry', () => {
  const history = flat(read('skills/ship-it/HISTORY.md'));
  for (const n of ['Decisions', 'Assumptions', 'Findings', 'Commit', 'never pruned']) assert.ok(history.includes(n), `HISTORY.md names ${n}`);
  assert.ok(history.includes('A run entry') && history.includes('slices shipped') && history.includes('retro'), 'HISTORY.md carries the run entry shape too');
  const ref = flat(read('docs/reference/history.md'));
  assert.ok(ref.includes('skills/ship-it/HISTORY.md') && !ref.includes('token input and output'), 'history.md points at the shape instead of restating it');
  assert.ok(history.includes('never a hash') && !history.includes('`pending`'), 'the commit field names the message prefix, since the entry is written before the commit');
  assert.ok(history.includes('create it on the first entry'), 'a repo with no history.md gets one, so no plan is removed unrecorded');
  assert.ok(!history.includes('do not create one'), 'HISTORY.md no longer skips the record when the file is missing');

  const ship = read('skills/ship-it/SKILL.md');
  const step4 = flat(ship.slice(ship.indexOf('4. **Commit now**'), ship.indexOf('## 4. Close')));
  for (const n of ['git rm', 'remove the plan files', 'docs/planning/']) assert.ok(step4.includes(n), `SKILL.md §3 item 4 names ${n}`);
  assert.ok(step4.includes('git ls-files'), 'the removal is confirmed, not assumed: git ls-files lists none of the plan files');

  assert.ok(flat(read('skills/ship-it/RESUME.md')).includes('tracked plan'), 'RESUME.md names tracked plan');
  assert.ok(!flat(read('skills/ship-it/DOCS.md')).includes('Create none here'), 'DOCS.md no longer forbids the ADR');
});
