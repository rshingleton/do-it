// Phase 2 of planning-locality: a lane M plan states each phase's files, the README lists their
// union, and the analyze pass names a phase with none, a pair that does not line up, or two phases
// no block edge separates that share a file. The plan files are the only source; the rules in
// scope-it's docs are read as text.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = path.join(ROOT, 'skills/scope-it/scripts/phases.mjs');

function run(target) {
  const r = spawnSync('node', [CHECK, target], { encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr, out: r.stdout ? JSON.parse(r.stdout) : null };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};
const bad = (r) => {
  assert.equal(r.status, 1, JSON.stringify(r.out));
  return r.out.errors.join('\n');
};

// A lane M plan: the README's state block and its three sections, then one phase file each.
// `section: false` leaves that phase's `## Files` out.
function planDir(phases, readmeFiles) {
  const dir = tmpDir('do-it-phases-');
  const block = phases.flatMap((p) => [
    `  - n: ${p.n}`,
    `    title: Phase ${p.n}`,
    `    blocked_by: [${(p.blocked_by ?? []).join(', ')}]`,
    '    status: ready',
    '    verified: null',
  ]);
  const rows = phases.map((p) => `| [${p.n}](phase-${p.n}.md) | Phase ${p.n} | ${(p.blocked_by ?? []).length ? p.blocked_by.join(', ') : 'none'} |`);
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    [
      '---',
      'id: locality',
      'lane: m',
      'status: draft',
      'phases:',
      ...block,
      '---',
      '',
      '# Locality',
      '',
      '## Phases',
      '',
      '| Phase | Delivers | Blocked by |',
      '|-------|----------|------------|',
      ...rows,
      '',
      '## Files',
      '',
      ...readmeFiles,
      '',
      '## Interfaces',
      '',
      '`A.b() -> c`',
      '',
    ].join('\n'),
  );
  for (const p of phases) phaseFile(dir, p);
  return dir;
}

function phaseFile(dir, p) {
  fs.writeFileSync(
    path.join(dir, `phase-${p.n}.md`),
    [
      `# Phase ${p.n}: Phase ${p.n}`,
      '',
      'Plan: locality. Blocked by: none.',
      '',
      '## Goal',
      'One line.',
      '',
      '## Scope',
      'What changes.',
      '',
      ...(p.section === false ? [] : ['## Files', ...(p.files ?? []), '']),
      '## Seams',
      '- `A.b()`: catches it; misses wiring.',
      '',
      '## Steps',
      '1. Do it -> verify: a test.',
      '',
      '## Done when',
      '- It passes.',
      '',
      '## Starting points',
      '- `skills/locality/x.mjs`',
      '',
    ].join('\n'),
  );
}

test('a plan whose phases state their files and are separated by a block edge passes', () => {
  const dir = planDir([{ n: 1, files: ['src/a.js'] }, { n: 2, blocked_by: [1], files: ['src/b.js'] }], ['src/a.js', 'src/b.js']);
  const out = ok(run(dir));
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.phases.map((p) => p.n), [1, 2], 'each phase file is read once');
});

test('a README list that is not the union fails, naming each path on one side', () => {
  const dir = planDir([{ n: 1, files: ['src/a.js'] }, { n: 2, blocked_by: [1], files: ['src/c.js'] }], ['src/a.js', 'src/b.js']);
  const errors = bad(run(dir));
  assert.match(errors, /not the union/);
  assert.match(errors, /only in the README: src\/b\.js/);
  assert.match(errors, /only in the phases: src\/c\.js/);
});

test('a phase file with no ## Files fails, naming the file', () => {
  const dir = planDir([{ n: 1, section: false, files: [] }], []);
  const errors = bad(run(dir));
  assert.match(errors, /phase-1\.md: no ## Files section/);
});

test('a phase file whose ## Files lists no path fails, naming the file', () => {
  const dir = planDir([{ n: 1, files: [] }], []);
  const errors = bad(run(dir));
  assert.match(errors, /phase-1\.md: states ## Files but lists no path/);
});

test('a state phase with no phase file fails, naming the file', () => {
  const dir = planDir([{ n: 1, files: ['src/a.js'] }, { n: 2, blocked_by: [1], files: ['src/b.js'] }], ['src/a.js', 'src/b.js']);
  fs.rmSync(path.join(dir, 'phase-2.md'));
  const errors = bad(run(dir));
  assert.match(errors, /phase-2\.md: missing, though phase 2 is in the README state block/);
});

test('a phase file with no state phase fails, naming the file', () => {
  const dir = planDir([{ n: 1, files: ['src/a.js'] }], ['src/a.js']);
  phaseFile(dir, { n: 2, files: ['src/a.js'] });
  const errors = bad(run(dir));
  assert.match(errors, /phase-2\.md: no phase 2 in the README state block/);
});

test('two phases no edge separates that share a file fail, naming both phases and the path', () => {
  const dir = planDir([{ n: 1, files: ['src/a.js'] }, { n: 2, files: ['src/a.js'] }], ['src/a.js']);
  const errors = bad(run(dir));
  assert.match(errors, /phase 1 and phase 2 both change src\/a\.js/);
});

test('a chain of block edges separates a shared file as a direct edge does', () => {
  const transitive = planDir(
    [{ n: 1, files: ['src/a.js'] }, { n: 2, blocked_by: [1], files: ['src/b.js'] }, { n: 3, blocked_by: [2], files: ['src/a.js'] }],
    ['src/a.js', 'src/b.js'],
  );
  ok(run(transitive));
  const direct = planDir([{ n: 1, files: ['src/a.js'] }, { n: 2, blocked_by: [1], files: ['src/a.js'] }], ['src/a.js']);
  ok(run(direct));
});

test('a repeated path on either side is one path, so duplicates do not fail the plan', () => {
  const dir = planDir([{ n: 1, files: ['src/a.js', 'src/a.js'] }, { n: 2, blocked_by: [1], files: ['src/b.js'] }], ['src/a.js', 'src/a.js', 'src/b.js']);
  const out = ok(run(dir));
  assert.deepEqual(out.phases[0].files, ['src/a.js', 'src/a.js'], 'the phase list keeps what it wrote');
});

test('a lane S plan has one list, so the check passes and says so', () => {
  const dir = tmpDir('do-it-phases-s-');
  const file = path.join(dir, 'login-rate-limit.md');
  fs.writeFileSync(file, '---\nid: login-rate-limit\nlane: s\n---\n\n## Files\nsrc/limiter.js\n');
  const out = ok(run(file));
  assert.deepEqual([out.lane, out.errors], ['s', []]);
  assert.match(out.note, /lane S has one/);
  // A directory with no phase files is the same case, read from its README.
  assert.match(ok(run(planDir([], []))).note, /lane S has one/);
});

test('no path is a one-line usage error with exit 2', () => {
  for (const args of [[], [path.join(tmpDir('do-it-phases-missing-'), 'nope')]]) {
    const r = spawnSync('node', [CHECK, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^usage: phases\.mjs/);
    assert.equal(r.stderr.trim().split('\n').length, 1, 'one line');
  }
});

test('scope-it states the rule in both planning paths, and its checks name the command', () => {
  const format = fs.readFileSync(path.join(ROOT, 'skills/scope-it/PLAN-FORMAT.md'), 'utf8');
  const fences = [...format.matchAll(/```markdown\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.match(fences[2], /^## Files$/m, 'the phase example carries the section');
  assert.match(fences[2], /^## Files\r?\nsrc\/limiter\.js\r?$/m, 'it shows a path where the paths go, not prose');
  assert.match(format, /union of its phases' files/, 'lane M says where the README list comes from');
  assert.match(format.replace(/\s+/g, ' '), /no dependency path between them must not share a file/, 'the cutting rule is stated');

  const grill = fs.readFileSync(path.join(ROOT, 'skills/scope-it/GRILL.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(grill, /File boundaries/, 'the grill asks for the file boundary');
  assert.match(grill, /must not share a file/, 'the branch states the cutting rule');

  const checks = fs.readFileSync(path.join(ROOT, 'skills/scope-it/CHECKS.md'), 'utf8');
  assert.match(checks, /^\| Locality \|/m, 'the analyze table has a Locality row');
  assert.match(checks, /an empty one/, 'the row counts an empty list as missing');
  assert.match(checks.replace(/\s+/g, ' '), /`phases\.mjs` means `node <this skill's directory>\/scripts\/phases\.mjs`/, 'the command is given from this skill\'s own directory');
  assert.match(checks.replace(/\s+/g, ' '), /Lane S does the first four checks/, 'lane S still stops before the lane M checks');
});
