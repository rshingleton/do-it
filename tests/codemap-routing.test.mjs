import './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { codeMap, mapFromContextMap, mapFromGit, mapFromReference, MAP_BUDGET } from '../hooks/lib/codemap.mjs';
import { sessionContext } from '../hooks/lib/context.mjs';
import { DEFAULTS } from '../skills/track-it/scripts/config.mjs';
import { buildModel, evaluate, stem, tokenize } from '../scripts/lib/routing.mjs';

function repoWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-map-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), 'x');
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

test('code map from git: shared dirs first, counts, tests separate, vendored dirs skipped', () => {
  const dir = repoWith([
    'src/orders/a.ts', 'src/orders/b.ts', 'src/auth/c.ts', 'lib/fmt.ts',
    'tests/orders.test.ts', 'src/auth/__tests__/c.test.ts',
    'vendor/x/y.js', 'node_modules/p/i.js', 'README.md',
  ]);
  const map = mapFromGit(dir);
  assert.ok(map.indexOf('`lib/`') < map.indexOf('`src/`'), map);
  assert.match(map, /`src\/` \(3\): `orders\/` 2, `auth\/` 1/);
  assert.match(map, /Tests: .*`tests\/` 1/);
  assert.match(map, /`src\/auth\/__tests__\/` 1/);
  assert.doesNotMatch(map, /vendor|node_modules/);

  fs.mkdirSync(path.join(dir, 'src/billing'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/billing/new.ts'), 'x');
  assert.match(mapFromGit(dir), /`billing\/` 1/, 'untracked new modules appear');
});

test('code map prefers the reference module map', () => {
  const dir = repoWith(['src/a.ts']);
  fs.mkdirSync(path.join(dir, 'docs/reference'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs/reference/module-map.md'),
    '# Modules\n\n| Module | Path |\n|---|---|\n| Orders | `src/orders/` |\n',
  );
  const map = codeMap(dir, DEFAULTS);
  assert.match(map, /docs\/reference\/module-map\.md/);
  assert.match(map, /\| Orders \|/);
  assert.equal(mapFromReference(dir, { ...DEFAULTS, DO_IT_REFERENCE_DIR: 'nowhere' }), '');
});

test('code map stays within budget', () => {
  const files = [];
  for (let i = 0; i < 120; i++) files.push(`pkg${String(i).padStart(3, '0')}-with-a-long-directory-name/sub/f.ts`);
  const map = mapFromGit(repoWith(files));
  assert.ok(map.length <= MAP_BUDGET, String(map.length));
  assert.match(map, /…$/);
});

const listing = (files) => ({ run: () => ({ status: 0, stdout: files.join('\0') }) });

test('code map lists monorepo packages by name (T5)', () => {
  const map = mapFromGit('/', listing([
    'packages/api/src/a.ts',
    'packages/api/src/b.ts',
    'packages/web/src/c.ts',
    'apps/admin/index.ts',
    'lib/util.ts',
  ]));
  const lines = map.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(lines[0], '- `lib/` (1)');
  assert.ok(lines.includes('- `packages/api/` (2): `src/` 2'), map);
  assert.ok(lines.includes('- `packages/web/` (1): `src/` 1'), map);
  assert.ok(lines.includes('- `apps/admin/` (1)'), map);
  assert.ok(!lines.some((l) => l.startsWith('- `packages/` ')), map);
});

test('code map caps a container at 12 packages and keeps the tests line', () => {
  const files = ['lib/util.ts', 'tests/a.test.ts'];
  for (let i = 0; i < 40; i++) files.push(`packages/p${String(i).padStart(2, '0')}/src/index.ts`);
  const map = mapFromGit('/', listing(files));
  assert.ok(map.length <= MAP_BUDGET, String(map.length));
  assert.equal(map.split('\n').filter((l) => l.startsWith('- `packages/p')).length, 12);
  assert.match(map, /More packages: `packages\/` \+28/);
  assert.match(map, /Tests: `tests\/` 1/);
});

test('code map keeps the summary lines when several containers fill the budget', () => {
  const files = ['lib/u.ts', 'tests/a.test.ts', 'packages/README.md'];
  for (const c of ['packages', 'apps', 'services']) {
    for (let i = 0; i < 20; i++) files.push(`${c}/p${i}/src/index.ts`, `${c}/p${i}/components/x.ts`);
  }
  const map = mapFromGit('/', listing(files));
  assert.ok(map.length <= MAP_BUDGET, String(map.length));
  assert.match(map, /More packages: `apps\/` \+8, `packages\/` \+8, `services\/` \+8/);
  assert.match(map, /Tests: `tests\/` 1$/);
  assert.match(map, /\n…\n/, 'the directory lines are what gets clipped');
  assert.doesNotMatch(map, /- `packages\/` \(/, 'a file directly in a container is not an entry');
});

test('code map never exceeds its budget, however long the tests tail', () => {
  const many = [];
  for (let i = 0; i < 400; i++) many.push(`src/m${i}/tests/t.js`);
  for (const budget of [1500, 200, 60, 1]) {
    const map = mapFromGit('/', { ...listing(many), budget });
    assert.ok(map.length <= budget, `${map.length} > ${budget}`);
  }
  const map = mapFromGit('/', listing(many));
  assert.match(map, /Tests: .*\+394 more$/, 'tests are capped like children, so the line survives');
});

test('code map without containers is unchanged by them', () => {
  const map = mapFromGit('/', listing(['src/a.ts', 'src/b/c.ts', 'lib/x.ts']));
  assert.equal(map.split('\n').filter((l) => l.startsWith('- ')).join('\n'), '- `lib/` (1)\n- `src/` (2): `b/` 1');
});

test('code map fails open and can be switched off', () => {
  assert.equal(mapFromGit('/', { run: () => ({ status: 128, stdout: '' }) }), '');
  assert.equal(mapFromGit('/', { run: () => { throw new Error('boom'); } }), '');
  const dir = repoWith(['src/a.ts']);
  assert.match(sessionContext(dir, DEFAULTS), /## Code map[\s\S]*`src\/`/);
  assert.doesNotMatch(sessionContext(dir, { ...DEFAULTS, DO_IT_MAP: 'off' }), /## Code map/);
});

function contextMap(rows) {
  return [
    '# Context map',
    '',
    'Each area has its own CONTEXT.md.',
    '',
    '## Services',
    '',
    '| Context | Location | Scope |',
    '|---------|----------|-------|',
    ...rows.map(([name, loc, scope]) => `| ${name} | \`${loc}\` | ${scope} |`),
    '',
    'Read the area context before exploring it.',
  ].join('\n');
}

test('code map leads with the context map, ahead of the module map', () => {
  const dir = repoWith(['src/a.ts']);
  fs.mkdirSync(path.join(dir, 'docs/reference'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/reference/module-map.md'), '| Module | Path |\n|---|---|\n| Orders | `src/orders/` |\n');
  fs.writeFileSync(path.join(dir, 'CONTEXT-MAP.md'), contextMap([
    ['Root', './CONTEXT.md', 'Shared infrastructure'],
    ['Checkout', 'services/checkout/CONTEXT.md', 'Takes and pays for orders'],
  ]));
  const map = codeMap(dir, DEFAULTS);
  assert.match(map, /^From `CONTEXT-MAP\.md`/);
  assert.match(map, /## Services/);
  assert.match(map, /\| Checkout \| `services\/checkout\/CONTEXT\.md` \| Takes and pays for orders \|/);
  assert.doesNotMatch(map, /Orders|Read the area context/, 'only headings and table rows, not the module map');

  fs.rmSync(path.join(dir, 'CONTEXT-MAP.md'));
  assert.match(codeMap(dir, DEFAULTS), /module-map\.md/, 'without a map the module map is next');
});

test('context map over budget drops to two columns before it drops rows', () => {
  const dir = repoWith(['src/a.ts']);
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push([`area-${i}`, `area-${i}/CONTEXT.md`, 'A scope description long enough to push the table over budget']);
  fs.writeFileSync(path.join(dir, 'CONTEXT-MAP.md'), contextMap(rows));
  const map = mapFromContextMap(dir, DEFAULTS);
  assert.ok(map.length <= MAP_BUDGET, String(map.length));
  assert.match(map, /\| Context \| Location \|\n/);
  assert.match(map, /\| area-14 \| `area-14\/CONTEXT\.md` \|/, 'every row survives');
  assert.doesNotMatch(map, /scope description/);

  for (let i = 15; i < 60; i++) rows.push([`area-${i}`, `area-${i}/CONTEXT.md`, 'x']);
  fs.writeFileSync(path.join(dir, 'CONTEXT-MAP.md'), contextMap(rows));
  const clipped = mapFromContextMap(dir, DEFAULTS);
  assert.ok(clipped.length <= MAP_BUDGET, String(clipped.length));
  assert.match(clipped, /\| area-0 \| `area-0\/CONTEXT\.md` \|/);
  assert.match(clipped, /…$/);
});

test('an unreadable context map yields the next source', () => {
  const dir = repoWith(['src/a.ts']);
  fs.mkdirSync(path.join(dir, 'CONTEXT-MAP.md'));
  assert.equal(mapFromContextMap(dir, DEFAULTS), '');
  assert.match(codeMap(dir, DEFAULTS), /git ls-files/);
});

test('git map lists top-level dirs with their own manifest as packages and skips temp dirs (T48)', () => {
  const files = ['amp-queue/cpanfile', 'amp-queue/lib/Q.pm', 'temp/scratch.pl', 'tmp/x.txt'];
  for (let i = 0; i < 5; i++) files.push(`deprecated/old${i}.pl`);
  const map = mapFromGit('/', listing(files));
  const lines = map.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(lines[0], '- `amp-queue/` (2): `lib/` 1', map);
  assert.equal(lines[1], '- `deprecated/` (5)', map);
  assert.doesNotMatch(map, /temp\/|tmp\//);
});

test('routing: stemming joins word forms, tokenizer drops stopwords', () => {
  assert.equal(stem('debugging'), stem('debug'));
  assert.equal(stem('lives'), stem('live'));
  assert.equal(stem('diagnosis'), stem('diagnose'));
  assert.deepEqual(tokenize('Find the bugs in this'), ['find', 'bug']);
});

test('routing eval: ranks, negatives, similarity and missing entries', () => {
  const skills = [
    { name: 'fix-it', description: 'Diagnose and fix bugs, crashes and failing code.' },
    { name: 'note-it', description: 'File an issue in the tracker for later.' },
    { name: 'same-it', description: 'Diagnose and fix bugs, crashes and failing code.' },
  ];
  assert.equal(buildModel(skills).score('my code crashes, diagnose it')[0].name !== 'note-it', true);
  const r = evaluate(skills, {
    threshold: 0.5,
    skills: {
      'fix-it': { positive: ['diagnose this crash'], negative: [{ prompt: 'file an issue for later', owner: 'note-it' }] },
      'note-it': { positive: ['file an issue in the tracker'] },
    },
  });
  assert.match(r.failures.join('\n'), /too similar: fix-it and same-it/);
  assert.match(r.failures.join('\n'), /same-it: no routing entries/);
  assert.equal(r.rows.find((x) => x.name === 'fix-it').negOk, 1);
});
