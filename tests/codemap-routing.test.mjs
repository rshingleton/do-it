import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { codeMap, mapFromGit, mapFromReference, MAP_BUDGET } from '../hooks/lib/codemap.mjs';
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

test('code map fails open and can be switched off', () => {
  assert.equal(mapFromGit('/', { run: () => ({ status: 128, stdout: '' }) }), '');
  assert.equal(mapFromGit('/', { run: () => { throw new Error('boom'); } }), '');
  const dir = repoWith(['src/a.ts']);
  assert.match(sessionContext(dir, DEFAULTS), /## Code map[\s\S]*`src\/`/);
  assert.doesNotMatch(sessionContext(dir, { ...DEFAULTS, DO_IT_MAP: 'off' }), /## Code map/);
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
  assert.match(r.warnings.join('\n'), /same-it: no routing entries/);
  assert.equal(r.rows.find((x) => x.name === 'fix-it').negOk, 1);
});
