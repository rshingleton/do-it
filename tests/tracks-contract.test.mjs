// Phase 3 of tracks-mode: a plan states the files and interfaces its slice changes, `run contract`
// prints those for the whole run in merge order, and the pre-flight refuses a pair whose slices
// overlap. The plans are the only source: nothing here hand-writes a contract.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pairSlices } from '../skills/do-it/scripts/contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const CHECK = path.join(ROOT, 'skills/do-it/scripts/contract.mjs');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { status: r.status, out: JSON.parse(r.stdout) };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};

// Three slices with plans. Merge order is milestone first, so R2 (milestone 1) comes before R1 and
// R3 (milestone 2); R1 pins one interface and consumes another it shares with R2, R2 and R3 share a
// file, and R1 and R3 only share the interface R1 pins.
const ROAD = [
  '# Road',
  '',
  '### M1',
  '',
  '| Slice | Kind | Delivers | Risk | Blocked by | Status |',
  '|-------|------|----------|------|------------|--------|',
  '| R2 | feat | the bus | low | - | ready |',
  '',
  '### M2',
  '',
  '| Slice | Kind | Delivers | Risk | Blocked by | Status |',
  '|-------|------|----------|------|------------|--------|',
  '| R3 | feat | the ui | low | - | ready |',
  '| R1 | feat | the api | low | - | ready |',
  '',
].join('\n');

// A lane S plan for one slice, with the two contract sections scope-it writes.
function plan(dir, id, slice, files, interfaces) {
  ok(work(dir, 'new', id, '--lane', 's', '--title', id));
  ok(work(dir, 'set', id, 'roadmap', JSON.stringify(`docs/roadmap/r.md#${slice}`)));
  fs.appendFileSync(path.join(dir, `docs/planning/${id}.md`), `\n## Files\n${files.join('\n')}\n\n## Interfaces\n${interfaces.join('\n')}\n`);
}

function fixture() {
  const dir = tmpDir('do-it-contract-');
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/roadmap/r.md'), ROAD);
  plan(dir, 'api', 'R1', ['src/api.js'], ['`Limiter.check(key) -> { allowed, wait }`', '`EventBus.emit(name)`']);
  plan(dir, 'bus', 'R2', ['src/bus.js'], ['`EventBus.emit(name)`']);
  plan(dir, 'ui', 'R3', ['src/bus.js', 'src/ui.js'], ['`Limiter.check(key)`']);
  ok(work(dir, 'run', 'new', 'road'));
  ok(work(dir, 'run', 'start', 'road', 'R1', '--work', 'api'));
  const contract = ok(work(dir, 'run', 'contract', 'road', 'docs/roadmap/r.md'));
  return { dir, contract, byId: Object.fromEntries(contract.slices.map((s) => [s.id, s])) };
}

test('run contract prints the merge order by milestone, each slice\'s plan, files and interfaces, and a shared file once with its owner', () => {
  const { dir, contract, byId } = fixture();
  assert.deepEqual(contract.merge_order, ['R2', 'R1', 'R3'], 'milestone first, then the roadmap order rule');
  assert.deepEqual(byId.R1.files, ['src/api.js']);
  assert.equal(byId.R1.plan.split('\\').join('/'), 'docs/planning/api.md', 'the plan path, repo-relative');
  assert.deepEqual(byId.R1.interfaces.map((i) => [i.text, i.pinned]), [
    ['Limiter.check(key) -> { allowed, wait }', true],
    ['EventBus.emit(name)', false],
  ]);
  assert.deepEqual(contract.shared, [{ path: 'src/bus.js', owner: 'R2', slices: ['R2', 'R3'] }], 'the file named once, owned by the slice that merges first');
  assert.deepEqual(ok(work(dir, 'run', 'contract', 'road')).merge_order, ['R1'], 'without a roadmap the run\'s own start order');
});

test('the pre-flight refuses a slice whose plan has no contract, naming the missing section', () => {
  const { byId } = fixture();
  const verdict = pairSlices(byId.R1, { ...byId.R2, files: [], interfaces: [], gaps: ['Files'] });
  assert.deepEqual([verdict.allow, verdict.reason], [false, 'NO_CONTRACT']);
  assert.match(verdict.detail, /R2 has no ## Files/);
});

test('the pre-flight refuses a pair that shares a file, and names the path', () => {
  const { byId } = fixture();
  const verdict = pairSlices(byId.R2, byId.R3);
  assert.deepEqual([verdict.allow, verdict.reason], [false, 'SHARED_FILE']);
  assert.match(verdict.detail, /src\/bus\.js/, 'the colliding path is named');
});

test('the pre-flight refuses an interface neither plan pins, and names the interface', () => {
  const { byId } = fixture();
  const verdict = pairSlices(byId.R1, byId.R2);
  assert.deepEqual([verdict.allow, verdict.reason], [false, 'UNPINNED_INTERFACE']);
  assert.match(verdict.detail, /EventBus\.emit\(name\)/, 'the unpinned interface is named');
});

test('the pre-flight allows a disjoint pair whose one shared interface a plan pins', () => {
  const { byId } = fixture();
  assert.deepEqual(pairSlices(byId.R1, byId.R3), { allow: true, reason: null, detail: null });
});

test('the analyse pass fails a plan with no ## Files section, and passes one that states both', () => {
  const dir = tmpDir('do-it-contract-lint-');
  const bare = path.join(dir, 'bare.md');
  fs.writeFileSync(bare, '---\nid: bare\n---\n\n# Bare\n\n## Goal\nOne line.\n');
  const failed = spawnSync('node', [CHECK, bare], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /## Files/, 'the missing section is named');
  const whole = path.join(dir, 'whole.md');
  fs.writeFileSync(whole, '---\nid: whole\n---\n\n## Files\nsrc/a.js\n\n## Interfaces\n`A.b() -> c`\n');
  assert.equal(spawnSync('node', [CHECK, whole], { encoding: 'utf8' }).status, 0);
});

test('scope-it\'s format shows ## Files and ## Interfaces in both examples, and its checks name the step', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'skills/scope-it/PLAN-FORMAT.md'), 'utf8');
  const fences = [...doc.matchAll(/```markdown\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const fence of fences.slice(0, 2)) {
    assert.match(fence, /^## Files$/m, 'the example carries the section');
    assert.match(fence, /^## Interfaces$/m);
  }
  assert.match(doc, /union of its phases' files/, 'lane M says where the lists come from');
  const checks = fs.readFileSync(path.join(ROOT, 'skills/scope-it/CHECKS.md'), 'utf8');
  assert.match(checks, /^\| Contract \|/m, 'the analyse pass has a Contract row');
  assert.match(checks, /contract\.mjs/, 'the row names the command a scope-it run calls');
});
